// Corso's first-run questions (the about, voice and first-job steps in WelcomeFlow) and how their answers
// reach the bots: as lines in the person's "About me" (profile.aboutMe), which every bot already reads. The about step
// starts with the kind of work the person does (their path), which picks its follow-up questions, the first jobs offered,
// and the Desks the first run makes for them (desks/path-desks.ts).
import { LEARNED_PREFIX } from "../../shared/assistant-notes";

export type DealVolume = "1-5" | "6-15" | "16-40" | "40+";
export type VoiceId = "direct" | "warm" | "casual";
export type WorkPath = "residential" | "commercial" | "property" | "consumer" | "brokerage";
export type FirstJobId =
  | "deadlines" | "signatures" | "inbox"
  | "criticalDates" | "dealDates"
  | "renewals" | "maintenance" | "ownerReports"
  | "explainContract" | "moveDates" | "agentQuestions"
  | "audit" | "licenses";

export const DEAL_VOLUMES: readonly DealVolume[] = ["1-5", "6-15", "16-40", "40+"];
export const VOICE_IDS: readonly VoiceId[] = ["direct", "warm", "casual"];
export const FIRST_JOB_IDS: readonly FirstJobId[] = ["deadlines", "signatures", "inbox"];
export const WORK_PATHS: readonly WorkPath[] = ["residential", "commercial", "property", "consumer", "brokerage"];

/** The follow-up questions a path asks beyond the residential ones. A choice keeps its id; its line says it in English. */
export type DetailId = "propertyTypes" | "side" | "dealSize" | "doors" | "portfolio" | "software" | "move" | "address" | "agent"
  | "agents" | "transactionSystem" | "offerAgents";

interface Detail {
  label: string;
  /** A choice's ids and the English each writes; none for a typed answer. */
  choices?: Readonly<Record<string, string>>;
}

export const DETAILS: Readonly<Record<DetailId, Detail>> = {
  propertyTypes: { label: "Property types:" },
  side: { label: "Sales or leasing:", choices: { sales: "sales", leasing: "leasing", both: "both sales and leasing" } },
  dealSize: { label: "Typical deal size:", choices: { under1m: "under $1M", "1m-5m": "$1M to $5M", "5m-25m": "$5M to $25M", over25m: "over $25M" } },
  doors: { label: "Doors managed:", choices: { "1-50": "1-50", "51-200": "51-200", "201-1000": "201-1,000", over1000: "over 1,000" } },
  portfolio: { label: "Residential or commercial:", choices: { residential: "residential", commercial: "commercial", both: "both residential and commercial" } },
  software: { label: "Property management software:", choices: { appfolio: "AppFolio", buildium: "Buildium", rentmanager: "Rent Manager", other: "other" } },
  move: { label: "Buying or selling:", choices: { buying: "buying", selling: "selling", both: "both buying and selling" } },
  address: { label: "Home address:" },
  agent: { label: "My agent:" },
  agents: { label: "Agents at the brokerage:", choices: { "1-10": "1-10", "11-50": "11-50", "51-200": "51-200", over200: "over 200" } },
  transactionSystem: { label: "Transaction system:", choices: { ctm: "CTM eContracts", skyslope: "SkySlope", dotloop: "Dotloop", lonewolf: "Lone Wolf", other: "other" } },
  offerAgents: { label: "Plans to offer Corso to our agents:", choices: { yes: "yes", maybe: "maybe later", no: "no" } },
};

/** What each path's about step asks, in order: the residential questions it keeps, then its own. */
export const PATH_QUESTIONS: Readonly<Record<WorkPath, { brokerage: boolean; market: boolean; volume: boolean; details: readonly DetailId[]; checklist: boolean }>> = {
  residential: { brokerage: true, market: true, volume: true, details: [], checklist: false },
  commercial: { brokerage: false, market: true, volume: false, details: ["propertyTypes", "side", "dealSize"], checklist: false },
  property: { brokerage: false, market: false, volume: false, details: ["doors", "portfolio", "software"], checklist: false },
  consumer: { brokerage: false, market: false, volume: false, details: ["move", "address", "agent"], checklist: false },
  brokerage: { brokerage: true, market: false, volume: false, details: ["agents", "transactionSystem", "offerAgents"], checklist: true },
};

/** The first jobs each path offers. */
export const PATH_FIRST_JOBS: Readonly<Record<WorkPath, readonly FirstJobId[]>> = {
  residential: FIRST_JOB_IDS,
  commercial: ["criticalDates", "dealDates", "inbox"],
  property: ["renewals", "maintenance", "ownerReports"],
  consumer: ["explainContract", "moveDates", "agentQuestions"],
  brokerage: ["audit", "signatures", "licenses"],
};

/** The path the answers stand for: residential until another is picked. */
export const pathOf = (answers: IntakeAnswers): WorkPath => answers.path ?? "residential";

export interface IntakeAnswers {
  brokerage: string;
  market: string;
  volume: DealVolume | null;
  voice: VoiceId | null;
  /** Unset or null: no path picked, which reads as residential. */
  path?: WorkPath | null;
  details?: Partial<Record<DetailId, string>>;
  /** Brokerage only: their own compliance checklist, pasted or read from a file. It seeds Office Compliance Desk, not
   * About me. */
  checklist?: string;
}

export const EMPTY_INTAKE: IntakeAnswers = { brokerage: "", market: "", volume: null, voice: null, path: null, details: {}, checklist: "" };

/** The answers on another path: what the new path also asks stays, the rest goes. */
export function choosePath(answers: IntakeAnswers, path: WorkPath | null): IntakeAnswers {
  const asks = PATH_QUESTIONS[path ?? "residential"];
  const details = Object.fromEntries(Object.entries(answers.details ?? {}).filter(([id]) => asks.details.includes(id as DetailId)));
  return {
    ...answers,
    path,
    brokerage: asks.brokerage ? answers.brokerage : "",
    market: asks.market ? answers.market : "",
    volume: asks.volume ? answers.volume : null,
    details,
    checklist: asks.checklist ? answers.checklist ?? "" : "",
  };
}

/** How each voice reads to a bot. The bots' instructions are English, whatever language the app shows. */
const VOICE_LINES: Record<VoiceId, string> = {
  direct: "short and to the point, facts first",
  warm: "friendly and reassuring, but still brief",
  casual: "relaxed and conversational",
};

/** Each line starts with its label, so answering again replaces the line instead of adding a second one. */
const LABELS = {
  path: "What I do:",
  brokerage: "Brokerage:",
  market: "Market:",
  volume: "Deals open at a time:",
  voice: "How to talk to me:",
} as const;

/** How each path other than residential reads to a bot. Residential writes no line: it is what the bots assume. */
const PATH_LINES: Record<Exclude<WorkPath, "residential">, string> = {
  commercial: "commercial real estate",
  property: "property management",
  consumer: "buying or selling my own home (I am not a real estate professional)",
  brokerage: "I run a brokerage (broker, managing broker or compliance)",
};

export function intakeLines(answers: IntakeAnswers): string[] {
  const lines: string[] = [];
  if (answers.path && answers.path !== "residential") lines.push(`${LABELS.path} ${PATH_LINES[answers.path]}`);
  if (answers.brokerage.trim()) lines.push(`${LABELS.brokerage} ${answers.brokerage.trim()}`);
  if (answers.market.trim()) lines.push(`${LABELS.market} ${answers.market.trim()}`);
  if (answers.volume) lines.push(`${LABELS.volume} ${answers.volume}`);
  for (const id of PATH_QUESTIONS[pathOf(answers)].details) {
    const value = answers.details?.[id]?.trim();
    const detail = DETAILS[id];
    if (value) lines.push(`${detail.label} ${detail.choices ? detail.choices[value] ?? value : value}`);
  }
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
