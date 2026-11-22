// What an import keeps of another app's memory: durable facts about the person, their deals, preferences, people and
// standing instructions. Noise is dropped (secrets, tool output, chatter, old one-off reminders, repeats and
// near-repeats), short durable lines are kept up to a cap, and passages and what is over the cap are handed back apart.

/** A line longer than this is a passage, not a note. */
export const NOTE_MAX_CHARS = 280;
/** A dated one-off (a reminder, a meeting) older than this is history, not memory. */
export const STALE_DAYS = 60;

export type NoiseReason = "empty" | "secret" | "output" | "chatter" | "stale" | "placeholder";

const CHATTER = /^(?:ok(?:ay)?|k|done|thanks?(?: you)?|ty|sure|got it|on it|will do|working on it|noted|sounds good|yes|no|nope|yep|cool|great|perfect|hi|hello|hey)\b[\s.!]*$/i;
const TRANSIENT = /^(?:today|tonight|this (?:morning|afternoon|evening)|right now|just now|currently)\b.*\b(?:i'?m|i am|we'?re|working|doing|looking|checking|running|trying)\b/i;
const ONE_OFF = /\b(?:remind(?:er)?|meeting|call|appointment|deadline|due|tomorrow|tonight|booked?)\b/i;
const SECRET = /«redacted|\[redacted|\bpassword\s*[:=]|\b(?:api[_ -]?key|token|secret)\s*[:=]\s*\S|\b(?:key|token|password) is\s+\S{12,}/i;
const PLACEHOLDER = /^(?:_?\(.*\)_?|_.*_|\[.*\]|<.*>|tbd|todo|n\/a|none|-|\.\.\.)$|^(?:what|who|how|why)\b.*\?\)?_?$/i;
const DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/;

/** Why a line is noise, or null when it may be a memory. */
export function noiseReason(line: string, now = Date.now()): NoiseReason | null {
  const text = line.trim();
  if (text.length < 4 || !/\p{L}{2}/u.test(text)) return "empty";
  if (SECRET.test(text)) return "secret";
  if (PLACEHOLDER.test(text)) return "placeholder";
  if (CHATTER.test(text) || TRANSIENT.test(text)) return "chatter";
  // tool output and file dumps: code, JSON, logs, stack traces, shell lines, paths
  if (/^(?:```|\$ |> |[{[]\s*"|at \S+ \(|Traceback|error:|warn(?:ing)?:|\d{2}:\d{2}:\d{2})/i.test(text)) return "output";
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters / text.length < 0.5) return "output";
  if (/^(?:\S*[\\/]\S*\s*){3,}$/.test(text) || /^https?:\/\/\S+$/.test(text)) return "output";
  const date = DATE.exec(text);
  if (date && ONE_OFF.test(text)) {
    const at = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
    if (Number.isFinite(at) && now - at > STALE_DAYS * 86_400_000) return "stale";
  }
  return null;
}

const words = (line: string) => line.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 1);

/** Two lines that say the same thing in nearly the same words. */
export function nearDuplicate(a: string, b: string): boolean {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const smaller = Math.min(left.size, right.size);
  return shared / (left.size + right.size - shared) >= 0.8 || (smaller >= 4 && shared / smaller >= 0.9);
}

export interface Distilled {
  /** Short durable lines, each once, at most the cap. */
  keep: string[];
  /** Passages and what was over the cap. */
  later: string[];
  /** Noise, repeats and near-repeats left out. */
  dropped: number;
}

/** The rules pass over a list of remembered lines, in their order. `seen` holds lines already kept elsewhere (About me,
 * another list), so the same fact is not kept twice across them. */
export function distillLines(lines: readonly string[], options: { cap: number; now?: number; seen?: string[] }): Distilled {
  const kept: string[] = [];
  const later: string[] = [];
  const known = options.seen ?? [];
  let dropped = 0;
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (noiseReason(line, options.now) || [...known, ...kept, ...later].some((other) => nearDuplicate(line, other))) {
      dropped += 1;
      continue;
    }
    if (line.length > NOTE_MAX_CHARS || kept.length >= options.cap) later.push(line);
    else kept.push(line);
  }
  known.push(...kept);
  return { keep: kept, later, dropped };
}
