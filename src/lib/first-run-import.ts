// The first run's "bring what you already use": what this Mac holds from other AI apps as one short list, app by app;
// one press brings an app's memory, skills and tools in while the run goes on, and a single quiet line says how it went.
import { useSyncExternalStore } from "react";
import { activeLocale, t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import type { MemoryTopics, SetupDetection, SetupSource } from "../../shared/setup-import";
import { setupImportApi, type SetupImportClient } from "./setup-import";

export interface SourceAmount { notes: number; skills: number; tools: number }

export interface LocalFind {
  /** "setup:<source>" for an AI tool's skills, tools and memory. */
  id: string;
  app: string;
  source: SetupSource;
  /** What it holds in plain words: "18 things about you, 12 skills and 2 tools". */
  summary: string;
  amount: SourceAmount;
  /** When the app was last used (ms), from its files' change times; null when unknown. */
  lastUsed: number | null;
  /** How worth bringing it is: how much it holds, weighed by how recently it was used. */
  score: number;
  /** Used lately and holding enough to matter: shown up front; the rest wait behind Show more. */
  strong: boolean;
  /** Distinct days with conversations in the last 30; null when this app's use can't be told. */
  activeDays: number | null;
  /** What its memory is about. */
  topics?: MemoryTopics;
}

/** Real, repeated use: conversations on at least this many of the last 30 days. */
export const MIN_ACTIVE_DAYS = 5;
/** Enough about the person to be worth bringing. */
export const MIN_KNOWN = 3;

/** The one app this person genuinely uses that knows them: used on MIN_ACTIVE_DAYS of the last 30 and holding notes
 * about them; the most used first, then the one that knows more. Null when none does: the prompt for AIs online leads. */
export function memorySource(finds: readonly LocalFind[]): LocalFind | null {
  return finds.filter((find) => (find.activeDays ?? 0) >= MIN_ACTIVE_DAYS && find.amount.notes >= MIN_KNOWN)
    .sort((a, b) => (b.activeDays ?? 0) - (a.activeDays ?? 0) || b.amount.notes - a.amount.notes)[0] ?? null;
}

const list = (parts: string[]) => new Intl.ListFormat(activeLocale(), { style: "long", type: "conjunction" }).format(parts);
const count = (n: number, one: LocaleKey, many: LocaleKey) => (n === 1 ? t(one) : t(many, { count: n }));
const SOURCE_ORDER: SetupSource[] = ["claudeCode", "claudeDesktop", "codex", "cursor", "gemini"];

const DAY_MS = 86_400_000;
/** Used within this long counts as in use. */
export const RECENT_DAYS = 30;
/** Below this much (a couple of skills, one config), a source is not worth leading with. */
export const MIN_AMOUNT = 8;

/** What it knows, in a person's words: "It's learned your preferences, how you like to work and 4 of your projects." */
export function knowsLine(find: LocalFind): string {
  const topics = find.topics;
  const parts = topics ? [
    ...(topics.preferences ? [t("bring.topicPreferences")] : []),
    ...(topics.aboutYou ? [t("bring.topicAboutYou")] : []),
    ...(topics.workStyle ? [t("bring.topicWorkStyle")] : []),
    ...(topics.projects ? [count(topics.projects, "bring.topicProjectsOne", "bring.topicProjects")] : []),
  ] : [];
  return parts.length ? t("bring.learned", { topics: list(parts) }) : count(find.amount.notes, "bring.remembersOne", "bring.remembers");
}

/** One number for how much a source holds: a skill is worth more than a note, a tool less. */
export function amountOf(amount: Partial<SourceAmount>): number {
  return (amount.skills ?? 0) + (amount.tools ?? 0) * 0.5 + Math.min(amount.notes ?? 0, 500) / 5;
}

/** Its score and whether it is up front: used in the last month and holding enough. */
export function sourceScore(amount: Partial<SourceAmount>, lastUsed: number | null, now = Date.now()): { score: number; strong: boolean } {
  const units = amountOf(amount);
  const days = lastUsed === null ? Infinity : Math.max(0, (now - lastUsed) / DAY_MS);
  const recency = days <= 7 ? 1 : days <= RECENT_DAYS ? 0.6 : 0.15;
  return { score: units * recency, strong: days <= RECENT_DAYS && units >= MIN_AMOUNT };
}

/** What a source holds in plain words, most personal first; `most` keeps a line short (the rest is left unsaid). */
export function amountLine(amount: Partial<SourceAmount>, most = Infinity): string {
  return list(([
    ...(amount.notes ? [count(amount.notes, "bring.aboutYouOne", "bring.aboutYou")] : []),
    ...(amount.skills ? [count(amount.skills, "bring.skillsOne", "bring.skills")] : []),
    ...(amount.tools ? [count(amount.tools, "bring.toolsOne", "bring.tools")] : []),
  ] as string[]).slice(0, most));
}

/** What this computer holds, one find per app, best first: how much it holds weighed by how lately it was used. */
export function localFinds(detection: SetupDetection | null, now = Date.now()): LocalFind[] {
  const activity = detection?.activity ?? {};
  const usage = detection?.usage ?? {};
  return SOURCE_ORDER.flatMap((source): LocalFind[] => {
    const memory = detection?.memory?.find((one) => one.source === source);
    const amount = {
      notes: memory?.notes ?? 0,
      skills: detection?.skills.filter((one) => one.source === source).length ?? 0,
      tools: detection?.tools.filter((one) => one.source === source).length ?? 0,
    };
    if (!amount.notes && !amount.skills && !amount.tools) return [];
    const lastUsed = activity[source] ?? null;
    return [{
      id: `setup:${source}`, app: t(`onboarding.import.source.${source}` as LocaleKey), source, amount, summary: amountLine(amount), lastUsed,
      activeDays: usage[source] ?? 0, ...(memory?.topics ? { topics: memory.topics } : {}), ...sourceScore(amount, lastUsed, now),
    }];
  }).sort((a, b) => Number(b.strong) - Number(a.strong) || b.score - a.score);
}

/** `ids`: the finds being brought in now; `brought`: every find brought in so far, each its own Bring in pressed once. */
export type BringRun =
  | { kind: "idle" }
  | { kind: "working"; ids: string[]; brought: string[] }
  | { kind: "done"; line: string; failed: boolean; brought: string[]; known?: number };

let run: BringRun = { kind: "idle" };
const NONE: readonly string[] = [];
/** What has come in so far, by find id. */
export const broughtIds = (now: BringRun): readonly string[] => (now.kind === "idle" ? NONE : now.brought);
const listeners = new Set<() => void>();
function set(next: BringRun) {
  run = next;
  for (const listener of listeners) listener();
}

export function useBringRun(): BringRun {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => run, () => run);
}

export const bringRunNow = (): BringRun => run;
export function resetBringRunForTests() { run = { kind: "idle" }; }

/** Brings the chosen finds in: their skills, tools and memory in one request, the memory into the first bot's. Never
 * throws; the line says what came in. Runs once at a time; the first run goes on meanwhile. */
export async function bringChosen(finds: readonly LocalFind[], context: { firstBotId: string | null; client?: SetupImportClient }): Promise<void> {
  if (run.kind === "working" || !finds.length) return;
  const before = broughtIds(run);
  const ids = finds.map((find) => find.id);
  set({ kind: "working", ids, brought: [...before] });
  const client = context.client ?? setupImportApi;
  let skills = 0, tools = 0, notes = 0, failed = false;
  try {
    const memory = context.firstBotId !== null && finds.some((find) => find.amount.notes > 0);
    const result = await client.apply({
      skills: true, tools: true, sources: finds.map((find) => find.source), ...(memory ? { memory: true, memoryBot: context.firstBotId! } : {}),
    });
    skills = result.skills?.added.length ?? 0;
    tools = result.tools?.added.length ?? 0;
    notes = result.memory?.added ?? 0;
    failed = Boolean(result.skills?.skipped.some((one) => one.reason === "failed") || result.tools?.skipped.some((one) => one.reason === "failed") || result.memory?.failed);
  } catch {
    failed = true;
  }
  // what the bots now know about the person leads; the rest follows in one line
  const also = [
    ...(skills ? [count(skills, "bring.skillsOne", "bring.skills")] : []),
    ...(tools ? [count(tools, "bring.toolsOne", "bring.tools")] : []),
  ];
  const said = notes
    ? [count(notes, "bring.knowNowOne", "bring.knowNow"), ...(also.length ? [t("bring.alsoCame", { list: list(also) })] : [])]
    : also.length ? [t("bring.done", { list: list(also) })] : failed ? [] : [t("bring.allHere")];
  const line = [...said, failed ? t("bring.failed") : ""].filter(Boolean).join(" ");
  // a find that failed stays one to bring in again
  set({ kind: "done", line, failed, brought: failed ? [...before] : [...new Set([...before, ...ids])], known: notes });
}
