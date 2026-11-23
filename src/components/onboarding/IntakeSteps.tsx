// Corso's three first-run questions (about, voice, first job), shown by WelcomeFlow between the bring step and the
// Chief of Staff. The about step opens with the kind of work the person does, which picks the questions under it and the
// first jobs offered. The answers are plain state here; WelcomeFlow saves them into About me (corso-intake.ts).
import type { ChangeEvent, ReactNode } from "react";
import { Building2, Check, ListChecks, MessageSquareText, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  choosePath,
  DEAL_VOLUMES,
  DETAILS,
  PATH_FIRST_JOBS,
  PATH_QUESTIONS,
  pathOf,
  VOICE_IDS,
  WORK_PATHS,
  type DetailId,
  type FirstJobId,
  type IntakeAnswers,
  type VoiceId,
  type WorkPath,
} from "@/lib/corso-intake";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { INTAKE_BEATS, type BeatId } from "@/lib/onboarding";
import { inputClass } from "./beats/shared";
import { PRIMARY, QUIET, STEP_ICON, StepFrame, StepIcon, TILE } from "./FunnelSteps";

export type IntakeBeat = "about" | "voice" | "firstJob";

export function isIntakeBeat(beat: BeatId): beat is IntakeBeat {
  return INTAKE_BEATS.includes(beat);
}

const VOICE_KEYS: Record<VoiceId, { name: LocaleKey; sample: LocaleKey }> = {
  direct: { name: "onboarding.intake.voice.direct", sample: "onboarding.intake.voice.directSample" },
  warm: { name: "onboarding.intake.voice.warm", sample: "onboarding.intake.voice.warmSample" },
  casual: { name: "onboarding.intake.voice.casual", sample: "onboarding.intake.voice.casualSample" },
};

/** Each first job, as its choice reads and as the message it leaves in the Chief's message box. */
export const FIRST_JOB_KEYS: Record<FirstJobId, LocaleKey> = {
  deadlines: "onboarding.intake.firstJob.deadlines",
  signatures: "onboarding.intake.firstJob.signatures",
  inbox: "onboarding.intake.firstJob.inbox",
  criticalDates: "onboarding.intake.firstJob.criticalDates",
  dealDates: "onboarding.intake.firstJob.dealDates",
  renewals: "onboarding.intake.firstJob.renewals",
  maintenance: "onboarding.intake.firstJob.maintenance",
  ownerReports: "onboarding.intake.firstJob.ownerReports",
  explainContract: "onboarding.intake.firstJob.explainContract",
  moveDates: "onboarding.intake.firstJob.moveDates",
  agentQuestions: "onboarding.intake.firstJob.agentQuestions",
  audit: "onboarding.intake.firstJob.audit",
  licenses: "onboarding.intake.firstJob.licenses",
};

/** The about step's words for each path: residential keeps the step's own. */
const ABOUT_KEYS: Record<WorkPath, { title: LocaleKey; lede: LocaleKey }> = {
  residential: { title: "onboarding.intake.about.title", lede: "onboarding.intake.about.lede" },
  commercial: { title: "onboarding.intake.about.commercial.title", lede: "onboarding.intake.about.commercial.lede" },
  property: { title: "onboarding.intake.about.property.title", lede: "onboarding.intake.about.property.lede" },
  consumer: { title: "onboarding.intake.about.consumer.title", lede: "onboarding.intake.about.consumer.lede" },
  brokerage: { title: "onboarding.intake.about.brokerage.title", lede: "onboarding.intake.about.brokerage.lede" },
};

/** A follow-up question's words: its label, a typed one's placeholder, a choice's own name. */
export const detailKey = (id: DetailId, part: string): LocaleKey => `onboarding.intake.detail.${id}.${part}` as LocaleKey;

const ART: Record<IntakeBeat, ReactNode> = {
  about: <Building2 size={STEP_ICON} aria-hidden="true" />,
  voice: <MessageSquareText size={STEP_ICON} aria-hidden="true" />,
  firstJob: <ListChecks size={STEP_ICON} aria-hidden="true" />,
};

function Choice({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={cn(TILE, "flex items-center gap-2 px-4 py-3 text-start text-[13px] leading-[18px] text-ink", on && "bg-ink/[0.08] hover:bg-ink/[0.08]", className)}>
      <span className="min-w-0 flex-1">{children}</span>
      {on && <Check size={14} aria-hidden="true" className="shrink-0 text-ink" />}
    </button>
  );
}

function Frame({ beat, title, lede, canContinue, onNext, onSkip, children }: {
  beat: IntakeBeat;
  title: string;
  lede: string;
  canContinue: boolean;
  onNext: () => void;
  onSkip: () => void;
  children: ReactNode;
}) {
  return (
    <div data-intake={beat} className="flex min-h-full w-full flex-col">
      <StepFrame art={<StepIcon>{ART[beat]}</StepIcon>} title={title} sub={lede}
        footer={<>
          <button type="button" data-primary="" disabled={!canContinue} onClick={onNext} className={PRIMARY}>{t("onboarding.intake.continue")}</button>
          <button type="button" onClick={onSkip} className={QUIET}>{t("onboarding.intake.skip")}</button>
        </>}>
        <div className="w-full">{children}</div>
      </StepFrame>
    </div>
  );
}

function Field({ label, value, placeholder, autoFocus, onChange }: {
  label: string; value: string; placeholder: string; autoFocus?: boolean; onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
      {label}
      <input className={inputClass} value={value} autoFocus={autoFocus} placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Choices<Id extends string>({ label, ids, on, name, onPick, columns }: {
  label: string; ids: readonly Id[]; on: Id | null | undefined; name: (id: Id) => ReactNode; onPick: (id: Id | null) => void; columns?: number;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
      {label}
      <div className={cn("grid gap-2", columns === 4 ? "grid-cols-4" : "grid-cols-2")}>
        {ids.map((id) => (
          <Choice key={id} on={on === id} className={columns === 4 ? "justify-center text-center" : undefined}
            onClick={() => onPick(on === id ? null : id)}>
            {name(id)}
          </Choice>
        ))}
      </div>
    </div>
  );
}

function Detail({ id, answers, setAnswers }: StepProps & { id: DetailId }) {
  const details = answers.details ?? {};
  const set = (value: string | null) => {
    const next = { ...details };
    if (value) next[id] = value;
    else delete next[id];
    setAnswers({ ...answers, details: next });
  };
  const choices = DETAILS[id].choices;
  if (!choices) {
    return <Field label={t(detailKey(id, "label"))} value={details[id] ?? ""} placeholder={t(detailKey(id, "placeholder"))} onChange={set} />;
  }
  const ids = Object.keys(choices);
  return <Choices label={t(detailKey(id, "label"))} ids={ids} on={details[id]} columns={ids.length === 4 ? 4 : undefined}
    name={(choice) => t(detailKey(id, choice))} onPick={set} />;
}

function Checklist({ answers, setAnswers }: StepProps) {
  const read = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void file.text().then((text) => setAnswers({ ...answers, checklist: text }), () => {});
  };
  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
      <label htmlFor="intake-checklist">{t("onboarding.intake.checklist.label")}</label>
      <textarea id="intake-checklist" rows={4} className={cn(inputClass, "resize-y text-[13px]")} value={answers.checklist ?? ""}
        placeholder={t("onboarding.intake.checklist.placeholder")}
        onChange={(event) => setAnswers({ ...answers, checklist: event.target.value })} />
      <span className="flex items-center justify-between gap-2 text-[12px] text-ink-tertiary">
        {t("onboarding.intake.checklist.hint")}
        <label className={cn(TILE, "flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-ink")}>
          <Upload size={13} aria-hidden="true" />
          {t("onboarding.intake.checklist.upload")}
          <input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" className="sr-only" onChange={read} />
        </label>
      </span>
    </div>
  );
}

function AboutStep({ answers, setAnswers }: StepProps) {
  const asks = PATH_QUESTIONS[pathOf(answers)];
  return (
    <div className="flex flex-col gap-4 text-left">
      <Choices label={t("onboarding.intake.path.label")} ids={WORK_PATHS} on={answers.path}
        name={(path) => t(`onboarding.intake.path.${path}` as LocaleKey)} onPick={(path) => setAnswers(choosePath(answers, path))} />
      {asks.brokerage && <Field label={t("onboarding.intake.about.brokerage")} value={answers.brokerage} autoFocus
        placeholder={t("onboarding.intake.about.brokeragePlaceholder")} onChange={(brokerage) => setAnswers({ ...answers, brokerage })} />}
      {asks.market && <Field label={t("onboarding.intake.about.market")} value={answers.market} autoFocus={!asks.brokerage}
        placeholder={t("onboarding.intake.about.marketPlaceholder")} onChange={(market) => setAnswers({ ...answers, market })} />}
      {asks.volume && <Choices label={t("onboarding.intake.about.volume")} ids={DEAL_VOLUMES} on={answers.volume} columns={4}
        name={(volume) => volume} onPick={(volume) => setAnswers({ ...answers, volume })} />}
      {asks.details.map((id) => <Detail key={id} id={id} answers={answers} setAnswers={setAnswers} />)}
      {asks.checklist && <Checklist answers={answers} setAnswers={setAnswers} />}
    </div>
  );
}

function VoiceStep({ answers, setAnswers }: StepProps) {
  return (
    <div role="radiogroup" aria-label={t("onboarding.intake.voice.title")} className="flex flex-col gap-2">
      {VOICE_IDS.map((id) => (
        <Choice key={id} on={answers.voice === id} onClick={() => setAnswers({ ...answers, voice: id })}>
          <span className="flex flex-col gap-1">
            <span className="text-[12px] font-medium leading-4 text-ink-secondary">{t(VOICE_KEYS[id].name)}</span>
            <span>{t(VOICE_KEYS[id].sample)}</span>
          </span>
        </Choice>
      ))}
    </div>
  );
}

function FirstJobStep({ path, job, setJob }: { path: WorkPath; job: FirstJobId | null; setJob: (job: FirstJobId | null) => void }) {
  return (
    <div role="radiogroup" aria-label={t("onboarding.intake.firstJob.title")} className="flex flex-col gap-2">
      {PATH_FIRST_JOBS[path].map((id) => (
        <Choice key={id} on={job === id} onClick={() => setJob(job === id ? null : id)}>
          {t(FIRST_JOB_KEYS[id])}
        </Choice>
      ))}
    </div>
  );
}

/** The answers with one step's left out, for Skip: a skipped question leaves nothing behind. */
export function withoutStep(answers: IntakeAnswers, beat: IntakeBeat): IntakeAnswers {
  if (beat === "about") return { ...answers, brokerage: "", market: "", volume: null, path: null, details: {}, checklist: "" };
  if (beat === "voice") return { ...answers, voice: null };
  return answers;
}

interface StepProps {
  answers: IntakeAnswers;
  setAnswers: (answers: IntakeAnswers) => void;
}

/** One of Corso's questions, in the first run's own step frame (Back and the step indicator are the run's). Continue is
 * always open: every answer is optional, and Skip moves on without it. */
export function IntakeSteps({ beat, answers, setAnswers, job, setJob, onNext, onSkip }: StepProps & {
  beat: IntakeBeat;
  job: FirstJobId | null;
  setJob: (job: FirstJobId | null) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const frame = { beat, onNext, onSkip, canContinue: true };
  const path = pathOf(answers);
  if (beat === "about") {
    return (
      <Frame {...frame} title={t(ABOUT_KEYS[path].title)} lede={t(ABOUT_KEYS[path].lede)}>
        <AboutStep answers={answers} setAnswers={setAnswers} />
      </Frame>
    );
  }
  if (beat === "voice") {
    return (
      <Frame {...frame} title={t("onboarding.intake.voice.title")} lede={t("onboarding.intake.voice.lede")}>
        <VoiceStep answers={answers} setAnswers={setAnswers} />
      </Frame>
    );
  }
  return (
    <Frame {...frame} title={t("onboarding.intake.firstJob.title")} lede={t("onboarding.intake.firstJob.lede")}>
      <FirstJobStep path={path} job={job} setJob={setJob} />
    </Frame>
  );
}
