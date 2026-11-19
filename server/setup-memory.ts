// The memory half of "bring what you already use": the standing instructions and memory notes another AI tool keeps
// on this computer (CLAUDE.md, AGENTS.md, GEMINI.md, Claude Code's per-project memory), brought into one bot's memory as
// unverified notes, and when each tool was last used, from change times alone.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MemorySource, MemoryTopics, SetupDetection, SetupImportResult, SetupSource } from "../shared/setup-import.ts";
import { redactSecretsInText } from "../shared/redact.ts";
import { writeFileAtomic } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { factIdentity } from "./memory-entries.ts";
import { journalMemoryWrite } from "./memory-journal.ts";
import { looksLikeInstruction } from "./memory-trust.ts";
import { locate, setupPaths, utf8, type SetupMachine } from "./setup-import.ts";
import { memoryEntry, readMemoryTopic } from "./workspace.ts";

/** A standing-instructions file bigger than this is someone's notes folder, not instructions: it is not read. */
export const INSTRUCTIONS_MAX_BYTES = 64 * 1024;

export const MEMORY_LIMITS = {
  /** Project memory files read per tool. */
  files: 400,
  /** One note: longer is cut at a word. */
  noteChars: 500,
  /** Notes brought in per tool: the ones about the person first, never a dump of project trivia. */
  notes: 50,
  chars: 160 * 1024,
};

/** Every memory path finding reads or dates, and nothing else. */
export function memoryPaths(machine: Pick<SetupMachine, "home" | "platform" | "env">) {
  const { home } = machine;
  const { codexHome, tools } = setupPaths(machine);
  const desktopConfig = tools.filter((tool) => tool.source === "claudeDesktop").map((tool) => tool.path);
  return {
    instructions: [
      { source: "claudeCode", path: join(home, ".claude", "CLAUDE.md") },
      { source: "codex", path: join(codexHome, "AGENTS.md") },
      { source: "gemini", path: join(home, ".gemini", "GEMINI.md") },
    ] satisfies Array<{ source: MemorySource; path: string }>,
    /** Folders of per-project memory notes: <root>/<project>/memory/*.md, and nothing else under <root>. */
    memoryFolders: [
      { source: "claudeCode", root: join(home, ".claude", "projects"), inner: "memory" },
    ] satisfies Array<{ source: MemorySource; root: string; inner: string }>,
    /** Looked at for when each app was last used, by their change time only: never listed or opened. */
    activity: {
      claudeCode: [join(home, ".claude", "history.jsonl"), join(home, ".claude", "projects"), join(home, ".claude", "CLAUDE.md"), join(home, ".claude", "skills")],
      claudeDesktop: desktopConfig,
      codex: [join(codexHome, "history.jsonl"), join(codexHome, "sessions"), join(codexHome, "AGENTS.md"), join(codexHome, "skills")],
      cursor: [join(home, ".cursor", "mcp.json"), join(home, ".cursor", "rules")],
      gemini: [join(home, ".gemini", "tmp"), join(home, ".gemini", "history"), join(home, ".gemini", "GEMINI.md")],
    } satisfies Record<SetupSource, string[]>,
    /** Where each app keeps its conversations: listed by name and dated by change time, never opened. */
    usage: {
      claudeCode: { root: join(home, ".claude", "projects"), shape: "projectFiles" },
      codex: { root: join(codexHome, "sessions"), shape: "dayFolders" },
      gemini: { root: join(home, ".gemini", "tmp"), shape: "chatFiles" },
    } satisfies Partial<Record<SetupSource, { root: string; shape: "projectFiles" | "dayFolders" | "chatFiles" }>>,
  };
}

const APP_NAMES: Record<MemorySource, string> = { claudeCode: "Claude Code", codex: "Codex", gemini: "Gemini CLI" };
const MEMORY_TOPICS: Record<MemorySource, string> = {
  claudeCode: "imported-claude-code.md", codex: "imported-codex.md", gemini: "imported-gemini-cli.md",
};
const MEMORY_INDEX = () => join(DATA_DIR, "skill-state", "imported-memory.json");
const MEMORY_INDEX_MAX = 20_000;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/** A note as dedupe compares it: case, punctuation and spacing aside. */
const noteKey = (note: string) => sha256(note.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()).slice(0, 24);

/** One markdown file as short notes: its lines of prose and its list items, without front matter, headings, code,
 * tables or link targets. Credentials are redacted; a line that reads like an instruction to send data or override
 * rules is dropped. */
export function memoryNotes(text: string): string[] {
  const body = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const notes: string[] = [];
  let fenced = false;
  for (const raw of body.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*(?:#|\||<!--|-{3,}\s*$|\*{3,}\s*$|={3,}\s*$)/.test(raw)) continue;
    let line = raw
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(?:[-*+•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
      .replace(/\*\*|__/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 12 || !/\p{L}{3}/u.test(line)) continue;
    if (line.length > MEMORY_LIMITS.noteChars) {
      const cut = line.slice(0, MEMORY_LIMITS.noteChars);
      line = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MEMORY_LIMITS.noteChars - 60)).trimEnd()}…`;
    }
    line = redactSecretsInText(line);
    if (looksLikeInstruction(line)) continue;
    notes.push(line);
  }
  return notes;
}

function readMemoryIndex(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(MEMORY_INDEX(), "utf8"));
    const notes = isRecord(parsed) && Array.isArray(parsed.notes) ? parsed.notes : [];
    return new Set(notes.filter((one): one is string => typeof one === "string"));
  } catch {
    return new Set();
  }
}

interface FoundMemory {
  source: MemorySource;
  files: number;
  notes: string[];
  topics: MemoryTopics;
}

type MemoryKind = "preferences" | "aboutYou" | "workStyle" | "project";
/** The order notes are taken in: what is about the person before what is about one project. */
const KIND_ORDER: Record<MemoryKind, number> = { preferences: 0, aboutYou: 1, workStyle: 2, project: 3 };
/** A first pass takes at most this many from each file, so one long file can't crowd out the rest; a second pass fills
 * what is left in the same order. */
const FIRST_PASS: Record<MemoryKind, number> = { preferences: 12, aboutYou: 8, workStyle: 2, project: 1 };

/** A Claude Code memory file's kind, from its front matter's type (user, feedback, project, reference). */
function memoryKind(text: string): MemoryKind {
  const front = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const type = /^\s*type:\s*["']?(\w+)/m.exec(front)?.[1]?.toLowerCase();
  return type === "user" ? "aboutYou" : type === "feedback" ? "workStyle" : "project";
}

/** Each tool's standing instructions and memory notes not brought in yet, deduped across files and tools: the ones
 * about the person first, at most MEMORY_LIMITS.notes. Only the files memoryPaths names are opened: never a
 * transcript, a session or a login. A memory folder's index (MEMORY.md) only points at the others and is skipped. */
function findMemory(machine: SetupMachine): FoundMemory[] {
  const index = readMemoryIndex();
  const real = machine.fs.realpath(machine.home);
  const places = { homes: [...new Set([machine.home, ...(real ? [real] : [])])], darwin: machine.platform === "darwin" };
  const paths = memoryPaths(machine);
  const files = new Map<MemorySource, Array<{ text: string; kind: MemoryKind; project: string | null }>>();
  const add = (source: MemorySource, path: string, project: string | null) => {
    const bytes = machine.fs.read(path, INSTRUCTIONS_MAX_BYTES, false, true);
    const text = bytes ? utf8(bytes) : null;
    if (!text) return;
    files.set(source, [...(files.get(source) ?? []), { text, kind: project === null ? "preferences" : memoryKind(text), project }]);
  };
  for (const file of paths.instructions) {
    const found = locate(machine, places, file.path);
    if (found?.info.isFile() && /\.md$/i.test(found.path)) add(file.source, found.path, null);
  }
  for (const folder of paths.memoryFolders) {
    const root = locate(machine, places, folder.root);
    if (!root?.info.isDirectory()) continue;
    let count = 0;
    for (const project of (machine.fs.readdir(root.path) ?? []).filter((name) => !name.startsWith(".")).sort()) {
      if (!machine.fs.lstat(join(root.path, project))?.isDirectory()) continue;
      const inner = join(root.path, project, folder.inner);
      if (!machine.fs.lstat(inner)?.isDirectory()) continue;
      for (const name of (machine.fs.readdir(inner) ?? []).filter((one) => /\.md$/i.test(one) && !one.startsWith(".") && one.toLowerCase() !== "memory.md").sort()) {
        if (count >= MEMORY_LIMITS.files) break;
        if (!machine.fs.lstat(join(inner, name))?.isFile()) continue;
        add(folder.source, join(inner, name), project);
        count += 1;
      }
    }
  }
  const seen = new Set<string>();
  const found: FoundMemory[] = [];
  for (const [source, list] of files) {
    const notes: string[] = [];
    const topics: MemoryTopics = { preferences: false, aboutYou: false, workStyle: false, projects: 0 };
    const projects = new Set<string>();
    let chars = 0;
    const ordered = [...list].sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind]).map((file) => ({ ...file, notes: memoryNotes(file.text), taken: 0 }));
    const took = new Set<number>();
    for (const pass of ["first", "fill"] as const) {
      ordered.forEach((file, at) => {
        for (const note of file.notes) {
          if (notes.length >= MEMORY_LIMITS.notes) return;
          if (pass === "first" && file.taken >= FIRST_PASS[file.kind]) return;
          const key = noteKey(note);
          if (seen.has(key) || index.has(key) || chars + note.length > MEMORY_LIMITS.chars) continue;
          seen.add(key);
          notes.push(note);
          chars += note.length;
          file.taken += 1;
          took.add(at);
        }
      });
    }
    for (const at of took) {
      const file = ordered[at]!;
      if (file.kind === "project" && file.project) projects.add(file.project);
      else if (file.kind !== "project") topics[file.kind] = true;
    }
    topics.projects = projects.size;
    if (notes.length) found.push({ source, files: took.size, notes, topics });
  }
  return found;
}

const DAY_MS = 86_400_000;
const USAGE_DAYS = 30;
const USAGE_MAX_ENTRIES = 6_000;

/** Distinct days in the last 30 with conversations in each app: session files dated by their change time (Codex by
 * its YYYY/MM/DD folders' names). Folders are listed and files dated; nothing in them is ever opened. */
function findUsage(machine: SetupMachine, now = Date.now()): Partial<Record<SetupSource, number>> {
  const usage: Partial<Record<SetupSource, number>> = {};
  const list = (path: string) => (machine.fs.readdir(path) ?? []).filter((name) => !name.startsWith("."));
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const recent = (at: number) => now - at <= USAGE_DAYS * DAY_MS && at <= now + DAY_MS;
  for (const [source, { root, shape }] of Object.entries(memoryPaths(machine).usage) as Array<[SetupSource, { root: string; shape: string }]>) {
    if (!machine.fs.lstat(root)?.isDirectory()) continue;
    const days = new Set<string>();
    let budget = USAGE_MAX_ENTRIES;
    const dateAll = (folder: string, keep: (name: string) => boolean = () => true) => {
      for (const name of list(folder).filter(keep)) {
        if (budget-- <= 0) return;
        const at = machine.fs.mtime(join(folder, name));
        if (at !== null && recent(at)) days.add(dayOf(at));
      }
    };
    if (shape === "dayFolders") {
      for (const year of list(root).filter((name) => /^\d{4}$/.test(name))) {
        for (const month of list(join(root, year)).filter((name) => /^\d{2}$/.test(name))) {
          for (const day of list(join(root, year, month)).filter((name) => /^\d{2}$/.test(name))) {
            const at = Date.parse(`${year}-${month}-${day}T12:00:00Z`);
            if (Number.isFinite(at) && recent(at)) days.add(`${year}-${month}-${day}`);
          }
        }
      }
    } else {
      for (const child of list(root)) {
        if (!machine.fs.lstat(join(root, child))?.isDirectory()) continue;
        if (shape === "projectFiles") dateAll(join(root, child), (name) => name.endsWith(".jsonl"));
        else dateAll(join(root, child, "chats"));
      }
    }
    if (days.size) usage[source] = days.size;
  }
  return usage;
}

/** When each app was last used: the newest change time of its known files and history folders, and for Claude Code of
 * its project folders (a new conversation changes its folder). Nothing is opened or listed beyond the projects folder. */
function findActivity(machine: SetupMachine): Partial<Record<SetupSource, number>> {
  const paths = memoryPaths(machine);
  const activity: Partial<Record<SetupSource, number>> = {};
  const note = (source: SetupSource, at: number | null) => {
    if (at !== null && at > (activity[source] ?? 0)) activity[source] = Math.round(at);
  };
  for (const [source, list] of Object.entries(paths.activity) as Array<[SetupSource, string[]]>) {
    for (const path of list) note(source, machine.fs.mtime(path));
  }
  for (const folder of paths.memoryFolders) {
    if (!machine.fs.lstat(folder.root)?.isDirectory()) continue;
    for (const project of (machine.fs.readdir(folder.root) ?? []).filter((name) => !name.startsWith(".")).slice(0, 500)) {
      note(folder.source, machine.fs.mtime(join(folder.root, project)));
    }
  }
  return activity;
}

/** What the tools' memory holds that is new here, and how much each app is used; each part left out when empty. */
export function detectMemory(machine: SetupMachine): Pick<SetupDetection, "memory" | "usage" | "activity"> {
  const memory = findMemory(machine).map(({ source, files, notes, topics }) => ({ source, files, notes: notes.length, topics }));
  const activity = findActivity(machine);
  const usage = findUsage(machine);
  return {
    ...(memory.length ? { memory } : {}), ...(Object.keys(activity).length ? { activity } : {}), ...(Object.keys(usage).length ? { usage } : {}),
  };
}

/** The notes as one topic of the bot's memory per tool, kept beside what an earlier import left there: recalled when a
 * message needs them, never loaded every session. */
function keepMemory(botId: string, found: FoundMemory): number {
  const app = APP_NAMES[found.source];
  const topic = MEMORY_TOPICS[found.source];
  const existing = readMemoryTopic(botId, topic);
  const held = new Set((existing ?? "").split("\n").map((line) => factIdentity(line.replace(/^- \d{4}-\d{2}-\d{2} · (?:from [^·\n]* · )?/, ""))));
  const fresh = found.notes.filter((note) => !held.has(factIdentity(note)));
  if (!fresh.length) return 0;
  const head = existing?.trim() ? existing.replace(/\s+$/, "")
    : `---\ntitle: From ${app}\ndescription: Notes imported from ${app} on this computer. Unverified: recalled when they fit, never loaded every session.\n---\n`;
  const source = `${app} import, unverified`;
  journalMemoryWrite(botId, `memory/${topic}`, `${head}\n${fresh.map((note) => memoryEntry(note, { source })).join("\n")}\n`, { actor: "import", via: "setup-import" });
  return fresh.length;
}

/** Brings the chosen tools' memory into `botId`'s memory; what came in is recorded, so it is never offered twice. */
export function importMemory(machine: SetupMachine, botId: string | undefined, sources?: readonly SetupSource[]): NonNullable<SetupImportResult["memory"]> {
  const result: NonNullable<SetupImportResult["memory"]> = { added: 0, sources: [], failed: false };
  let found: FoundMemory[];
  try {
    found = findMemory(machine).filter((one) => !sources || sources.includes(one.source));
  } catch {
    return { ...result, failed: true };
  }
  if (!found.length) return result;
  if (!botId) return { ...result, failed: true };
  const kept: string[] = [];
  for (const one of found) {
    try {
      result.added += keepMemory(botId, one);
      result.sources.push(one.source);
      kept.push(...one.notes.map(noteKey));
    } catch {
      result.failed = true;
    }
  }
  if (kept.length) {
    try {
      const notes = [...readMemoryIndex(), ...kept].slice(-MEMORY_INDEX_MAX);
      mkdirSync(dirname(MEMORY_INDEX()), { recursive: true, mode: 0o700 });
      writeFileAtomic(MEMORY_INDEX(), `${JSON.stringify({ notes }, null, 2)}\n`, { mode: 0o600 });
    } catch {
      // offered again next time; the topic itself skips what it holds already
    }
  }
  return result;
}
