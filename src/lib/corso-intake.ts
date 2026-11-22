// Corso's first-run questions (the about, voice and first-job steps in WelcomeFlow) and how their answers
// reach the bots: as lines in the person's "About me" (profile.aboutMe), which every bot already reads.
import { LEARNED_PREFIX } from "../../shared/assistant-notes";

export type DealVolume = "1-5" | "6-15" | "16-40" | "40+";
export type VoiceId = "direct" | "warm" | "casual";
export type FirstJobId = "deadlines" | "signatures" | "inbox";

export const DEAL_VOLUMES: readonly DealVolume[] = ["1-5", "6-15", "16-40", "40+"];
export const VOICE_IDS: readonly VoiceId[] = ["direct", "warm", "casual"];
export const FIRST_JOB_IDS: readonly FirstJobId[] = ["deadlines", "signatures", "inbox"];

export interface IntakeAnswers {
  brokerage: string;
  market: string;
  volume: DealVolume | null;
  voice: VoiceId | null;
}

export const EMPTY_INTAKE: IntakeAnswers = { brokerage: "", market: "", volume: null, voice: null };

/** How each voice reads to a bot. The bots' instructions are English, whatever language the app shows. */
const VOICE_LINES: Record<VoiceId, string> = {
  direct: "short and to the point, facts first",
  warm: "friendly and reassuring, but still brief",
  casual: "relaxed and conversational",
};

/** Each line starts with its label, so answering again replaces the line instead of adding a second one. */
const LABELS = {
  brokerage: "Brokerage:",
  market: "Market:",
  volume: "Deals open at a time:",
  voice: "How to talk to me:",
} as const;

export function intakeLines(answers: IntakeAnswers): string[] {
  const lines: string[] = [];
  if (answers.brokerage.trim()) lines.push(`${LABELS.brokerage} ${answers.brokerage.trim()}`);
  if (answers.market.trim()) lines.push(`${LABELS.market} ${answers.market.trim()}`);
  if (answers.volume) lines.push(`${LABELS.volume} ${answers.volume}`);
  if (answers.voice) lines.push(`${LABELS.voice} ${VOICE_LINES[answers.voice]}`);
  return lines;
}

/** A line's label ("Brokerage:"), also on a fact another AI's notes brought in (`- date · learned by ChatGPT · Brokerage: …`). */
const labelOf = (line: string) => {
  const fact = line.replace(LEARNED_PREFIX, "");
  return fact.slice(0, fact.indexOf(":") + 1);
};

/** The person's About me with the intake's lines in it: an answered line replaces the old one with the same label, and
 * every fact brought in from another AI under it, an unanswered one leaves the old one alone, and everything else the
 * person wrote stays where it was. */
export function mergeAboutMe(existing: string, answers: IntakeAnswers): string {
  const fresh = intakeLines(answers);
  const freshLabels = new Set(fresh.map(labelOf));
  const kept = existing.split("\n").filter((line) => !freshLabels.has(labelOf(line)));
  while (kept.length && !kept[kept.length - 1]!.trim()) kept.pop();
  return [...kept, ...fresh].join("\n").replace(/^\n+/, "");
}

export function intakeAnswered(answers: IntakeAnswers): boolean {
  return intakeLines(answers).length > 0;
}
