// Corso's three first-run questions (about, voice, first job), shown by WelcomeFlow between the bring step and the
// Chief of Staff. The answers are plain state here; WelcomeFlow saves them into About me (corso-intake.ts).
import type { ReactNode } from "react";
import { Building2, Check, ListChecks, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEAL_VOLUMES,
  FIRST_JOB_IDS,
  VOICE_IDS,
  type FirstJobId,
  type IntakeAnswers,
  type VoiceId,
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
};

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

function AboutStep({ answers, setAnswers }: StepProps) {
  return (
    <div className="flex flex-col gap-4 text-left">
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
        {t("onboarding.intake.about.brokerage")}
        <input className={inputClass} value={answers.brokerage} autoFocus
          placeholder={t("onboarding.intake.about.brokeragePlaceholder")}
          onChange={(event) => setAnswers({ ...answers, brokerage: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
        {t("onboarding.intake.about.market")}
        <input className={inputClass} value={answers.market}
          placeholder={t("onboarding.intake.about.marketPlaceholder")}
          onChange={(event) => setAnswers({ ...answers, market: event.target.value })} />
      </label>
      <div role="radiogroup" aria-label={t("onboarding.intake.about.volume")} className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
        {t("onboarding.intake.about.volume")}
        <div className="grid grid-cols-4 gap-2">
          {DEAL_VOLUMES.map((volume) => (
            <Choice key={volume} on={answers.volume === volume} className="justify-center text-center"
              onClick={() => setAnswers({ ...answers, volume: answers.volume === volume ? null : volume })}>
              {volume}
            </Choice>
          ))}
        </div>
      </div>
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

function FirstJobStep({ job, setJob }: { job: FirstJobId | null; setJob: (job: FirstJobId | null) => void }) {
  return (
    <div role="radiogroup" aria-label={t("onboarding.intake.firstJob.title")} className="flex flex-col gap-2">
      {FIRST_JOB_IDS.map((id) => (
        <Choice key={id} on={job === id} onClick={() => setJob(job === id ? null : id)}>
          {t(FIRST_JOB_KEYS[id])}
        </Choice>
      ))}
    </div>
  );
}

/** The answers with one step's left out, for Skip: a skipped question leaves nothing behind. */
export function withoutStep(answers: IntakeAnswers, beat: IntakeBeat): IntakeAnswers {
  if (beat === "about") return { ...answers, brokerage: "", market: "", volume: null };
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
  if (beat === "about") {
    return (
      <Frame {...frame} title={t("onboarding.intake.about.title")} lede={t("onboarding.intake.about.lede")}>
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
      <FirstJobStep job={job} setJob={setJob} />
    </Frame>
  );
}
