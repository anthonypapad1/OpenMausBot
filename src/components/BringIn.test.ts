// @vitest-environment happy-dom
// The first run's bring step body: the one app that knows the person leads with its own Bring in, the rest wait in a
// short list, and the prompt for AIs online sits below with its three steps.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock("@/state/store", () => ({ useStore: () => ({ state: { bots: [], config: { profile: {} } }, dispatch: vi.fn() }), api: vi.fn() }));
vi.mock("@/lib/copy-text", () => ({ copyText: f.copy }));
vi.mock("@/lib/default-bot", async (original) => ({ ...(await original<typeof import("@/lib/default-bot")>()), useViewerEmail: () => null }));

import { setLocale } from "@/lib/i18n";
import { stopWaiting } from "@/lib/assistant-notes";
import { localFinds, type BringRun, type LocalFind } from "@/lib/first-run-import";
import { BringIn, useBringChoice } from "./BringIn";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NOW = Date.now();
const finds = localFinds({
  skills: [{ name: "pdf", source: "codex" }], tools: [{ name: "notion", source: "cursor" }],
  memory: [{ source: "claudeCode", files: 4, notes: 18, topics: { preferences: true, aboutYou: false, workStyle: true, projects: 0 } }],
  usage: { claudeCode: 12 }, activity: { claudeCode: NOW, codex: NOW, cursor: NOW },
}, NOW);

let host: HTMLDivElement, root: Root;
function Harness({ run, onImport }: { run: BringRun; onImport: (find: LocalFind) => void }) {
  const choice = useBringChoice(finds);
  return createElement(BringIn, { finds, choice, run, onImport });
}
const show = async (run: BringRun, onImport = vi.fn()) => { await act(async () => root.render(createElement(Harness, { run, onImport }))); return onImport; };

beforeEach(() => {
  setLocale("en");
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  f.copy.mockResolvedValue("copied");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  stopWaiting();
  vi.unstubAllGlobals();
});

describe("bring what you already use", () => {
  it("leads with the app the person really uses, said as a person would, and brings it in with one press", async () => {
    const onImport = await show({ kind: "idle" });
    const hero = host.querySelector<HTMLElement>("[data-bring-hero]")!;
    expect(hero.dataset.bringFind).toBe("setup:claudeCode");
    expect(hero.textContent).toContain("Claude Code already knows you");
    expect(hero.textContent).toContain("It's learned your preferences and how you like to work. You've used it on 12 of the last 30 days.");
    await act(async () => hero.querySelector<HTMLButtonElement>("[data-bring-import]")!.click());
    expect(onImport).toHaveBeenCalledWith(finds.find((find) => find.id === "setup:claudeCode"));
  });

  it("says when it came in, in place of the button", async () => {
    await show({ kind: "done", line: "Your bots now know 18 things about you.", failed: false, brought: ["setup:claudeCode"], known: 18 });
    expect(host.querySelector("[data-bring-hero] [data-bring-import]")).toBeNull();
    expect(host.querySelector("[data-bring-hero]")?.textContent).toContain("Brought in");
  });

  it("keeps the prompt for AIs online below, with its three steps, and copies it", async () => {
    await show({ kind: "idle" });
    const prompt = host.querySelector<HTMLElement>("[data-bring-prompt]")!;
    expect(prompt.querySelectorAll("ol > li")).toHaveLength(3);
    expect(prompt.textContent).toContain("Paste it into ChatGPT, Claude, Gemini, Grok or any other AI.");
    expect(prompt.querySelector("pre")?.textContent).toContain("format: corso-notes");
    await act(async () => prompt.querySelector<HTMLButtonElement>("[data-bring-copy]")!.click());
    expect(f.copy).toHaveBeenCalledOnce();
    expect(prompt.querySelector("[data-bring-copied]")?.textContent).toMatch(/^Copied\./);
  });
});
