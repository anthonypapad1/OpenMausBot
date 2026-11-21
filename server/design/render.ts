// Turns a filled template into a PNG or a PDF in a Chrome of its own: the same binary the bots' browser runs
// (chromeLauncher.binary()), started headless on a throwaway profile for this one render and closed after it, so no
// signed-in bot profile, cookie or tab is ever near it. Scripts are off, and every request the page makes is answered
// here from memory: the page, the images and the bundled fonts at RENDER_ORIGIN, and a failure for anything else, so
// nothing leaves this computer. A CSP header backs that up.
//
// It speaks CDP over the launch pipe directly rather than through omb-cdp's CdpConnection: that connection's
// allowlist (server/browser/cdp/policy.ts) is the bot browser's and rightly lacks Page.printToPDF,
// Emulation.setScriptExecutionDisabled and the like; widening it for a page that is not a bot's would weaken that guard.
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CdpTransport } from "../browser/cdp/transport.ts";
import type { HostKind } from "../browser/chrome/flags.ts";
import { needsNoSandbox } from "../browser/chrome/identity.ts";
import { FIRST_START_MS, launchChrome, type ChromeProcess } from "../browser/chrome/launch.ts";
import { RENDER_ORIGIN } from "./origin.ts";

export interface RenderAsset { mime: string; bytes: Buffer }

export interface RenderRequest {
  html: string;
  /** Bytes by the exact URL the page asks for them at (images and fonts under RENDER_ORIGIN). */
  assets: ReadonlyMap<string, RenderAsset>;
  width: number;
  height: number;
  output: "png" | "pdf";
  /** Device pixels per CSS pixel for a PNG. */
  scale?: number;
}

export interface Rendered {
  bytes: Buffer;
  /** A small JPEG of the page, for the bot to check its work. */
  preview: Buffer;
  /** Requests the page made that were refused: anything not passed in. */
  refused: string[];
}

export interface RendererOptions {
  executablePath: string;
  host?: HostKind;
  sandbox?: boolean;
  tmpRoot?: string;
  timeoutMs?: number;
}

const PAGE_URL = `${RENDER_ORIGIN}/index.html`;
const PREVIEW_MAX_PX = 480;
const CSP = `default-src 'none'; img-src ${RENDER_ORIGIN} data:; font-src ${RENDER_ORIGIN} data:; style-src 'unsafe-inline' ${RENDER_ORIGIN}; script-src 'none'; base-uri 'none'; form-action 'none'`;

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message?: string }; sessionId?: string };

/** Ids, answers and events over Chrome's pipe; just what one render needs. */
class Pipe {
  #id = 1_000;
  readonly #pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  readonly #listeners = new Set<(message: Message) => void>();
  readonly #transport: CdpTransport;

  constructor(transport: CdpTransport) {
    this.#transport = transport;
    transport.onMessage((text) => {
      let message: Message;
      try { message = JSON.parse(text) as Message; } catch { return; }
      if (typeof message.id === "number") {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message ?? "failed"}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.#listeners) listener(message);
    });
    transport.onClose((reason) => {
      for (const pending of this.#pending.values()) pending.reject(new Error(`Chrome closed (${reason}).`));
      this.#pending.clear();
    });
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = ++this.#id;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: Record<string, unknown>) => void, reject });
      this.#transport.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  on(listener: (message: Message) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took over ${Math.round(ms / 1000)} s.`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** One page, rendered and closed. */
export async function renderDesign(request: RenderRequest, options: RendererOptions): Promise<Rendered> {
  const dir = await mkdtemp(join(options.tmpRoot ?? tmpdir(), "corso-design-"));
  let chrome: ChromeProcess | null = null;
  try {
    chrome = await launchChrome({
      executablePath: options.executablePath,
      userDataDir: join(dir, "profile"),
      mode: "headless",
      // As the launcher reads a binary's identity (server/browser/chrome/launcher.ts): a container's Chrome needs its flags.
      host: options.host ?? (process.platform === "linux" && existsSync("/.dockerenv") ? "container" : "desktop"),
      sandbox: options.sandbox ?? !needsNoSandbox(),
      viewport: { width: request.width, height: request.height },
      startUrl: "about:blank",
      handshakeTimeoutMs: FIRST_START_MS,
    });
    const running = chrome;
    return await withTimeout(drive(new Pipe(running.transport), request), options.timeoutMs ?? 45_000, "The render");
  } finally {
    if (chrome) await chrome.close(2_000).catch(() => chrome?.kill());
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}

async function drive(pipe: Pipe, request: RenderRequest): Promise<Rendered> {
  const { targetId } = await pipe.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await pipe.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const send = <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}) => pipe.send<T>(method, params, sessionId);
  const refused: string[] = [];
  const page = Buffer.from(request.html, "utf8");
  pipe.on((message) => {
    if (message.sessionId !== sessionId || message.method !== "Fetch.requestPaused") return;
    const params = message.params as { requestId: string; request: { url: string } };
    const url = params.request.url;
    const asset = url === PAGE_URL ? { mime: "text/html; charset=utf-8", bytes: page } : request.assets.get(url);
    if (!asset) {
      // Chrome asks for a favicon on its own; only what the template asked for is worth reporting.
      if (refused.length < 20 && url !== `${RENDER_ORIGIN}/favicon.ico`) refused.push(url.slice(0, 200));
      void send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      return;
    }
    const headers = [{ name: "Content-Type", value: asset.mime }, { name: "Cache-Control", value: "no-store" }, ...(url === PAGE_URL ? [{ name: "Content-Security-Policy", value: CSP }] : [])];
    void send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: headers, body: asset.bytes.toString("base64") }).catch(() => {});
  });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await send("Emulation.setDeviceMetricsOverride", { width: request.width, height: request.height, deviceScaleFactor: request.scale ?? 1, mobile: false });
  await send("Page.enable");
  await send("Page.setLifecycleEventsEnabled", { enabled: true });
  const idle = new Promise<void>((resolve) => {
    const off = pipe.on((message) => {
      if (message.sessionId === sessionId && message.method === "Page.lifecycleEvent" && (message.params as { name?: string }).name === "networkIdle") {
        off();
        resolve();
      }
    });
  });
  const loaded = new Promise<void>((resolve) => {
    const off = pipe.on((message) => {
      if (message.sessionId === sessionId && message.method === "Page.loadEventFired") {
        off();
        resolve();
      }
    });
  });
  const navigated = await send<{ errorText?: string }>("Page.navigate", { url: PAGE_URL });
  if (navigated.errorText) throw new Error(`The page did not open (${navigated.errorText}).`);
  await loaded;
  // Fonts and late images settle by network idle; a page that never goes idle is captured as it is after a short wait.
  await Promise.race([idle, new Promise((resolve) => setTimeout(resolve, 3_000))]);
  const clip = (scale: number) => ({ x: 0, y: 0, width: request.width, height: request.height, scale });
  const previewScale = Math.min(1, PREVIEW_MAX_PX / Math.max(request.width, request.height)) / (request.scale ?? 1);
  const preview = await send<{ data: string }>("Page.captureScreenshot", { format: "jpeg", quality: 70, clip: clip(previewScale), captureBeyondViewport: false });
  const bytes = request.output === "pdf"
    ? await send<{ data: string }>("Page.printToPDF", {
      paperWidth: request.width / 96, paperHeight: request.height / 96,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      printBackground: true, preferCSSPageSize: false, pageRanges: "1",
    })
    : await send<{ data: string }>("Page.captureScreenshot", { format: "png", clip: clip(1), captureBeyondViewport: false });
  await pipe.send("Browser.close").catch(() => {});
  return { bytes: Buffer.from(bytes.data, "base64"), preview: Buffer.from(preview.data, "base64"), refused };
}
