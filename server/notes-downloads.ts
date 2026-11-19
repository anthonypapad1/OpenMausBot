// The notes file another AI saved to Downloads after the person copied the prompt for it. Only files named like the one
// the prompt asks for are listed, and only regular files (never a link) changed after the copy are opened.
import { join } from "node:path";

import { NOTES_FILE_PATTERN } from "../shared/assistant-notes.ts";
import type { SetupMachine } from "./setup-import.ts";

export const NOTES_FILE_MAX = 2 * 1024 * 1024;
const MAX_NOTES_FILES = 10;

export interface NotesFile { name: string; modifiedAt: number; text: string }

export function lookForNotes(machine: SetupMachine, since: number): NotesFile[] {
  const folder = join(machine.home, "Downloads");
  const found = (machine.fs.readdir(folder) ?? []).filter((name) => NOTES_FILE_PATTERN.test(name)).flatMap((name) => {
    const stats = machine.fs.lstat(join(folder, name));
    return stats?.isFile() && stats.size <= NOTES_FILE_MAX && stats.mtimeMs > since ? [{ name, modifiedAt: stats.mtimeMs }] : [];
  }).sort((a, b) => a.modifiedAt - b.modifiedAt).slice(0, MAX_NOTES_FILES);
  return found.flatMap(({ name, modifiedAt }) => {
    const raw = machine.fs.read(join(folder, name), NOTES_FILE_MAX, false);
    return raw ? [{ name, modifiedAt, text: raw.toString("utf8") }] : [];
  });
}
