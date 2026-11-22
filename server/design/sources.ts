// The photos, logo and headshot a design_render call names, read into memory before the render starts: a file in the
// bot's own folders or the person's attachments (the roots browser uploads take, server/browser-upload.ts), or an
// https image on a public address. The rendered page itself reaches none of them; render.ts serves these bytes.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { realpath, readFile, stat } from "node:fs/promises";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isAbsolute, join, relative, sep } from "node:path";

import { addressClass } from "../browser/egress/policy.ts";
import { guestWorkspaceToHost } from "../bot-attachment.ts";
import { inSecretFolder, SECRET_FILE_REFUSAL } from "../secret-folder.ts";

export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGES_TOTAL_MAX_BYTES = 80 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export interface SourceImage { mime: string; bytes: Buffer }

export interface SourceRoots {
  /** The bot's working folder first (relative paths are read from it), then its other folders and the attachments. */
  roots: readonly string[];
  /** A Local VM turn's workspace: its guest paths name files here. */
  vm?: { guestRoot: string; hostRoot: string } | null;
}

export class SourceRefusal extends Error {}

/** The image type `bytes` starts with, whatever the name says. */
export function sniffImage(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString("latin1", 0, 6))) return "image/gif";
  return null;
}

const inside = (root: string, path: string) => {
  const rest = relative(root, path);
  return rest !== "" && rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);
};

const shown = (value: string) => value.slice(0, 200);

/** The host path a bot's local path names, or a refusal: never `..`, never outside its roots. */
export async function localImagePath(requested: string, where: SourceRoots): Promise<string> {
  const value = requested.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) {
    throw new SourceRefusal(/^http:/i.test(value)
      ? `${shown(value)} is not https. Use the image's https address, or save it in your working folder first.`
      : `${shown(value)} is neither a file path nor an https address.`);
  }
  if (value.split(/[\\/]/).includes("..")) throw new SourceRefusal(`${shown(value)} climbs out with "..". Give the file's own path in your working folder.`);
  const [workFolder] = where.roots;
  if (!workFolder) throw new SourceRefusal("You have no working folder to read images from.");
  const guest = where.vm ? guestWorkspaceToHost(value, where.vm.guestRoot, where.vm.hostRoot) : null;
  const path = guest ?? (isAbsolute(value) ? value : join(workFolder, value));
  let real: string;
  try {
    real = await realpath(path);
  } catch {
    throw new SourceRefusal(`Nothing was found at ${shown(value)}.`);
  }
  const roots = await Promise.all([...where.roots, ...(where.vm ? [where.vm.hostRoot] : [])].map((root) => realpath(root).catch(() => null)));
  if (!roots.some((root) => root && inside(root, real))) {
    throw new SourceRefusal(`${shown(value)} is not in your working folder or among the person's attachments. Save it in your working folder first, or ask the person to attach it.`);
  }
  if (inSecretFolder(real)) throw new SourceRefusal(SECRET_FILE_REFUSAL);
  return real;
}

async function readLocal(requested: string, where: SourceRoots): Promise<SourceImage> {
  const real = await localImagePath(requested, where);
  const info = await stat(real);
  if (!info.isFile()) throw new SourceRefusal(`${shown(requested)} is a folder, not an image.`);
  if (info.size > IMAGE_MAX_BYTES) throw new SourceRefusal(`${shown(requested)} is over ${IMAGE_MAX_BYTES / 1024 / 1024} MB. Use a smaller copy.`);
  const bytes = await readFile(real);
  const mime = sniffImage(bytes);
  if (!mime) throw new SourceRefusal(`${shown(requested)} is not a PNG, JPEG, WebP or GIF image.`);
  return { mime, bytes };
}

/** A lookup that answers only with public addresses, so a name cannot lead the fetch onto this computer or its network
 * between the check and the connection. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "", 0);
    const usable = addresses.filter((entry) => addressClass(entry.address) === "public");
    if (!usable.length || usable.length !== addresses.length) {
      return callback(Object.assign(new Error(`${hostname} is not a public address`), { code: "ENOTPUBLIC" }), "", 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (error: null, all: LookupAddress[]) => void)(null, usable);
    callback(null, usable[0]!.address, usable[0]!.family);
  });
};

function fetchOnce(url: URL, signal: AbortSignal): Promise<{ redirect: string } | SourceImage> {
  return new Promise((done, fail) => {
    const call = request(url, { method: "GET", lookup: publicLookup, signal, headers: { accept: "image/*" } }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        return done({ redirect: response.headers.location });
      }
      if (status !== 200) {
        response.resume();
        return fail(new SourceRefusal(`${shown(url.href)} answered ${status}.`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > IMAGE_MAX_BYTES) {
          call.destroy();
          fail(new SourceRefusal(`${shown(url.href)} is over ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`));
        } else chunks.push(chunk);
      });
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const mime = sniffImage(bytes);
        if (!mime) return fail(new SourceRefusal(`${shown(url.href)} is not a PNG, JPEG, WebP or GIF image.`));
        done({ mime, bytes });
      });
      response.on("error", fail);
    });
    call.on("error", (error: NodeJS.ErrnoException) => fail(error instanceof SourceRefusal ? error : new SourceRefusal(error.code === "ENOTPUBLIC"
      ? `${shown(url.href)} is not on the public internet, so it is not fetched. Save the image in your working folder instead.`
      : `${shown(url.href)} could not be fetched (${error.message}).`)));
    call.end();
  });
}

/** An https image on a public address, following at most three redirects, each held to the same rules. */
export async function fetchImage(address: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<SourceImage> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new SourceRefusal(`${shown(address)} is not a valid address.`);
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:") throw new SourceRefusal(`${shown(url.href)} is not https. Only https images are fetched.`);
    if (url.username || url.password) throw new SourceRefusal("An image address may not carry a user name or password.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && addressClass(host) !== "public") throw new SourceRefusal(`${shown(url.href)} is not on the public internet, so it is not fetched. Save the image in your working folder instead.`);
    const answer = await fetchOnce(url, signal).catch((error: unknown) => {
      if (signal.aborted) throw new SourceRefusal(`${shown(url.href)} took over ${timeoutMs / 1000} s.`);
      throw error;
    });
    if (!("redirect" in answer)) return answer;
    url = new URL(answer.redirect, url);
  }
  throw new SourceRefusal(`${shown(address)} redirected more than ${MAX_REDIRECTS} times.`);
}

/** One image a call names: an https address, or a path in the bot's folders or attachments (relative to its working folder). */
export function readSourceImage(source: string, where: SourceRoots): Promise<SourceImage> {
  return /^https:\/\//i.test(source.trim()) ? fetchImage(source.trim()) : readLocal(source, where);
}
