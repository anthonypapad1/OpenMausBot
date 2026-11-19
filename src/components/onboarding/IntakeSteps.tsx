// Corso's four first-run questions (about, tools, voice, first job), shown by WelcomeFlow between MeetScreen and the
// Chief of Staff. The answers are plain state here; WelcomeFlow saves them into About me (corso-intake.ts).
import type { ReactNode } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEAL_VOLUMES,
  FIRST_JOB_IDS,
  TOOL_IDS,
  TOOL_NAMES,
  VOICE_IDS,
  toggleTool,
  type FirstJobId,
  type IntakeAnswers,
  type VoiceId,
} from "@/lib/corso-intake";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { INTAKE_BEATS, type BeatId } from "@/lib/onboarding";
import { inputClass } from "./beats/shared";
import { PILL } from "./SignInPill";

export type IntakeBeat = "about" | "tools" | "voice" | "firstJob";

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

const CHOICE =
  "flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-[14px] leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const CHOICE_OFF = "border-hairline/60 bg-card text-ink hover:bg-raised";
const CHOICE_ON = "border-accent bg-card text-ink ring-1 ring-accent";

function Choice({ on, onClick, children, className, role = "checkbox" }: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  role?: "checkbox" | "radio";
}) {
  return (
    <button type="button" role={role} aria-checked={on} onClick={onClick} className={cn(CHOICE, on ? CHOICE_ON : CHOICE_OFF, className)}>
      {children}
    </button>
  );
}

function Frame({ beat, title, lede, canContinue, onNext, onBack, onSkip, children }: {
  beat: IntakeBeat;
  title: string;
  lede: string;
  canContinue: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  children: ReactNode;
}) {
  const index = INTAKE_BEATS.indexOf(beat);
  return (
    <div data-intake={beat} className="relative flex min-h-full w-full flex-col items-center px-4 pb-10 pt-16 text-center">
      <button type="button" onClick={onBack} className="absolute left-4 top-4 flex items-center gap-1 rounded text-[13px] text-ink-secondary transition-colors hover:text-ink">
        <ChevronLeft size={14} aria-hidden="true" />{t("onboarding.intake.back")}
      </button>
      <div aria-hidden="true" className="absolute left-1/2 top-6 flex -translate-x-1/2 gap-1.5">
        {INTAKE_BEATS.map((step, i) => (
          <span key={step} className={cn("h-1 rounded-full transition-all", i === index ? "w-5 bg-ink" : "w-2.5 bg-ink/20")} />
        ))}
      </div>
      <div className="my-auto flex w-full max-w-[520px] flex-col items-center">
        <h1 id="welcome-title" className="text-[28px] font-normal leading-[34px] tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-2 max-w-[420px] text-[15px] leading-[22px] text-ink-secondary">{lede}</p>
        <div className="mt-8 w-full">{children}</div>
        <button type="button" data-primary="" disabled={!canContinue} onClick={onNext} className={cn(PILL, "mt-8")}>
          {t("onboarding.intake.continue")}
        </button>
        <button type="button" onClick={onSkip} className="mt-3 rounded text-[13px] text-ink-secondary transition-colors hover:text-ink">
          {t("onboarding.intake.skip")}
        </button>
      </div>
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
            <Choice key={volume} role="radio" on={answers.volume === volume} className="justify-center"
              onClick={() => setAnswers({ ...answers, volume: answers.volume === volume ? null : volume })}>
              {volume}
            </Choice>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolsStep({ answers, setAnswers }: StepProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TOOL_IDS.map((id) => {
        const on = answers.tools.includes(id);
        return (
          <Choice key={id} on={on} onClick={() => setAnswers({ ...answers, tools: toggleTool(answers.tools, id) })}>
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-accent bg-accent text-white" : "border-hairline")}>
              {on && <Check size={11} strokeWidth={3} aria-hidden="true" />}
            </span>
            {TOOL_NAMES[id]}
          </Choice>
        );
      })}
    </div>
  );
}

function VoiceStep({ answers, setAnswers }: StepProps) {
  return (
    <div role="radiogroup" aria-label={t("onboarding.intake.voice.title")} className="flex flex-col gap-2">
      {VOICE_IDS.map((id) => (
        <Choice key={id} role="radio" on={answers.voice === id} className="flex-col items-start gap-1"
          onClick={() => setAnswers({ ...answers, voice: id })}>
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-ink-secondary">{t(VOICE_KEYS[id].name)}</span>
          <span>{t(VOICE_KEYS[id].sample)}</span>
        </Choice>
      ))}
    </div>
  );
}

function FirstJobStep({ job, setJob }: { job: FirstJobId | null; setJob: (job: FirstJobId | null) => void }) {
  return (
    <div role="radiogroup" aria-label={t("onboarding.intake.firstJob.title")} className="flex flex-col gap-2">
      {FIRST_JOB_IDS.map((id) => (
        <Choice key={id} role="radio" on={job === id} onClick={() => setJob(job === id ? null : id)}>
          {t(FIRST_JOB_KEYS[id])}
        </Choice>
      ))}
    </div>
  );
}

/** The answers with one step's left out, for Skip: a skipped question leaves nothing behind. */
export function withoutStep(answers: IntakeAnswers, beat: IntakeBeat): IntakeAnswers {
  if (beat === "about") return { ...answers, brokerage: "", market: "", volume: null };
  if (beat === "tools") return { ...answers, tools: [] };
  if (beat === "voice") return { ...answers, voice: null };
  return answers;
}

interface StepProps {
  answers: IntakeAnswers;
  setAnswers: (answers: IntakeAnswers) => void;
}

/** One of Corso's questions. Continue is always open: every answer is optional, and Skip moves on without it. */
export function IntakeSteps({ beat, answers, setAnswers, job, setJob, onNext, onBack, onSkip }: StepProps & {
  beat: IntakeBeat;
  job: FirstJobId | null;
  setJob: (job: FirstJobId | null) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const frame = { beat, onNext, onBack, onSkip, canContinue: true };
  if (beat === "about") {
    return (
      <Frame {...frame} title={t("onboarding.intake.about.title")} lede={t("onboarding.intake.about.lede")}>
        <AboutStep answers={answers} setAnswers={setAnswers} />
      </Frame>
    );
  }
  if (beat === "tools") {
    return (
      <Frame {...frame} title={t("onboarding.intake.tools.title")} lede={t("onboarding.intake.tools.lede")}>
        <ToolsStep answers={answers} setAnswers={setAnswers} />
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
