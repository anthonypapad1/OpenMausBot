// "Bring what you already use": the skills, MCP servers and memory of a person's other AI tools that the welcome flow
// finds on this computer and brings in.

export type SetupSource = "claudeCode" | "claudeDesktop" | "cursor" | "codex" | "gemini";
export type SkillSource = Extract<SetupSource, "claudeCode" | "codex">;
export const SETUP_SOURCES = ["claudeCode", "claudeDesktop", "cursor", "codex", "gemini"] as const satisfies readonly SetupSource[];
/** A tool whose standing instructions (CLAUDE.md, AGENTS.md, GEMINI.md) and memory notes live in Markdown files. */
export type MemorySource = Extract<SetupSource, "claudeCode" | "codex" | "gemini">;

/** What a tool's memory is about, from its files' kinds (never their text): standing preferences, notes about the
 * person, how they like to work, and how many projects it keeps notes on. */
export interface MemoryTopics { preferences: boolean; aboutYou: boolean; workStyle: boolean; projects: number }

/** Names only, never a file's contents or an env or header value. Everything listed is new here. */
export interface SetupDetection {
  skills: Array<{ name: string; source: SkillSource }>;
  tools: Array<{ name: string; source: SetupSource }>;
  /** Notes not brought in yet from each tool's own memory and standing-instructions files, counted, never shown. */
  memory?: Array<{ source: MemorySource; files: number; notes: number; topics?: MemoryTopics }>;
  /** Distinct days in the last 30 with conversations in each app, from session files' change times and Codex's dated
   * session folders: names and times only, nothing opened. */
  usage?: Partial<Record<SetupSource, number>>;
  /** When each app here was last used (ms), from when its files and history folders last changed: stat only. */
  activity?: Partial<Record<SetupSource, number>>;
}

export interface SetupImportRequest {
  skills?: boolean;
  tools?: boolean;
  /** The tools' memory and instructions, as unverified imported notes in this bot's memory. */
  memory?: boolean;
  memoryBot?: string;
  /** Only these tools' things; absent means every tool's. */
  sources?: SetupSource[];
}

export type SkillSkip = "conflict" | "failed";
/** "conflict": a different server already has that name here; "failed": it could not be saved. */
export type ToolSkip = "limit" | "policy" | "busy" | "conflict" | "failed";

/** Names and counts only. `review`: skills added switched off, because the scan flagged them, until a person reads them. */
export interface SetupImportResult {
  skills?: { added: string[]; present: string[]; skipped: Array<{ name: string; reason: SkillSkip }>; filesLeftOut: number; review: string[] };
  tools?: { added: string[]; present: string[]; skipped: Array<{ name: string; reason: ToolSkip }> };
  /** Notes added to the bot's memory, and the tools they came from. */
  memory?: { added: number; sources: MemorySource[]; failed: boolean };
}

export function detectionCount(detection: SetupDetection | null | undefined): number {
  return detection ? detection.skills.length + detection.tools.length + (detection.memory?.length ?? 0) : 0;
}

/** Each source once, in the order first found. */
export function detectionSources<Source extends SetupSource>(items: ReadonlyArray<{ source: Source }>): Source[] {
  return [...new Set(items.map((item) => item.source))];
}
