// Where a rendered design is saved: marketing/ in the bot's working folder, named so a person can find it by date,
// property and kind: 2026-11-21-1847-larkspur-ln-just-listed-square.png.
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";

export const MARKETING_FOLDER = "marketing";

/** Lowercase ASCII words joined by hyphens, at most `max` characters, never cut mid-word when it can help it. */
export function slug(text: string, max = 48): string {
  const words = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (words.length <= max) return words;
  const cut = words.slice(0, max);
  const lastBreak = cut.lastIndexOf("-");
  return (lastBreak > max / 2 ? cut.slice(0, lastBreak) : cut).replace(/-+$/, "");
}

/** The calendar date at `now` in `timeZone`, as YYYY-MM-DD. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function designFileName(parts: { date: string; address?: string; template: string; format: string; output: "png" | "pdf" }): string {
  const place = parts.address ? slug(parts.address) : "";
  return `${[parts.date, place, parts.template, parts.format].filter(Boolean).join("-")}.${parts.output}`;
}

/** `name` in `folder`, or the first of name-2, name-3… not taken, so a render never replaces an earlier one. The name is
 * taken for good: the file is created empty with O_EXCL (`wx`), so two renders running at once can never pick the same
 * name. The caller then writes the bytes over it. */
export function claimPath(folder: string, name: string, create: (path: string) => void = (path) => closeSync(openSync(path, "wx"))): string {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = [name.slice(0, dot), name.slice(dot)];
  for (let copy = 1; ; copy += 1) {
    const path = join(folder, copy === 1 ? name : `${stem}-${copy}${extension}`);
    try {
      create(path);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}
