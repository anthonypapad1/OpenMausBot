import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { setEmailGateDone, track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { EMPTY_INTAKE, intakeAnswered, mergeAboutMe, type FirstJobId, type IntakeAnswers } from "@/lib/corso-intake";
import { chiefStepFits, myDefaultBot, setChiefStepOpen, useViewerEmail } from "@/lib/default-bot";
import { appendComposerDraft } from "@/lib/drafts";
import { t } from "@/lib/i18n";
import { beatsFor, completionPatch, firstRunPatch, markWelcomeFinished, resumeBeat, showWelcome, type BeatId } from "@/lib/onboarding";
import { clearWelcomeDraft, readWelcomeDraft, saveWelcomeDraft } from "@/lib/welcome-draft";
import { api, useStore } from "@/state/store";
import { ChiefIntro } from "./ChiefIntro";
import { FIRST_JOB_KEYS, IntakeSteps, isIntakeBeat, withoutStep } from "./IntakeSteps";
import { MeetScreen } from "./MeetScreen";
import { localDesktopPage } from "./WelcomeGate";

const LEAVE_MS = 100;

const FADE_MS = 150;

type Config = ReturnType<typeof useStore>["state"]["config"];

/** A genuine first run on this computer's own page names the person after its account, where their profile has none
 * (never on a Cloud, a Team Cloud or a remote page). The name stays theirs to change in Settings. */
async function nameFromComputer(config: Config, done: (config: NonNullable<Config>) => void): Promise<void> {
  const bridge = window.ogb;
  if (!config || config.onboarding?.completedAt || config.profile?.name?.trim() || config.cloudHome || config.team) return;
  if (!localDesktopPage() || bridge?.remoteClient?.active) return;
  const name = await bridge?.desktopProfile?.systemName().catch(() => null);
  if (!name) return;
  try {
    done(await api<NonNullable<Config>>("/api/config", { method: "PUT", body: JSON.stringify({ profile: { name } }), signal: AbortSignal.timeout(10_000) }));
  } catch {
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab stay inside `root`, the way a modal dialog keeps them. */
function trapTab(event: ReactKeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  if (event.key !== "Tab" || !root) return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** The first run, then the chat. Meeting the app (with an AI to connect when none works), Corso's questions about the
 * person's business (IntakeSteps), then the Chief of Staff over the app itself. Its end is the chat with the bot chosen
 * there (`onDone`), with the first job picked in the questions waiting in its message box. */
export function WelcomeFlow({
  onDone,
  replay = false,
  initialBeat,
  embedded = false,
  hosted = false,
}: {
  onDone: (botId: string | null) => void;
  replay?: boolean;
  initialBeat?: BeatId;
  embedded?: boolean;
  hosted?: boolean;
}) {
  const { state, dispatch } = useStore();
  const maus = myDefaultBot(state.bots, useViewerEmail());
  // A first run keeps its screen in this browser, so a reload resumes it; a replay starts over. A hosted place's
  // browser may hold another person's draft.
  const keepsDraft = !replay && !embedded && !hosted;
  const beats = beatsFor({ hosted });
  const [beat, setBeat] = useState<BeatId>(() => resumeBeat(beats, initialBeat ?? (keepsDraft ? readWelcomeDraft()?.beat : undefined)));
  const root = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);
  const record = useRef(state.config?.onboarding);
  record.current = state.config?.onboarding;
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY_INTAKE);
  const [job, setJob] = useState<FirstJobId | null>(null);
  const firstJob = useRef<FirstJobId | null>(null);
  firstJob.current = job;
  const bots = useRef(state.bots);
  bots.current = state.bots;

  useEffect(() => {
    track("onboarding_step", { step: beat, replay });
    if (keepsDraft && !finishing.current) saveWelcomeDraft({ beat });
  }, [beat, replay, keepsDraft]);

  // A Cloud sheet opened over the welcome never switches the window away from it (CloudAddDialog).
  useEffect(() => (embedded ? undefined : showWelcome()), [embedded]);
  useEffect(() => {
    if (!replay && !embedded && !hosted) void nameFromComputer(state.config, (config) => dispatch({ type: "configStatus", config }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    async (reason: "completed" | "skipped", botId: string | null) => {
      if (finishing.current) return;
      finishing.current = true;
      track("onboarding_completed", { reason, at: beat, replay });
      setEmailGateDone("submitted");
      if (!replay && !embedded) markWelcomeFinished();
      if (keepsDraft) clearWelcomeDraft();
      onDone(botId);
      // The first job waits in the chosen bot's message box, for the person to send (Composer's draft id).
      const lead = bots.current.find((bot) => bot.id === botId) ?? maus;
      if (firstJob.current && lead) appendComposerDraft(`bot:${lead.id}:${lead.threadId}`, t(FIRST_JOB_KEYS[firstJob.current]));
      try {
        const patch = replay ? completionPatch() : firstRunPatch(record.current, new Date());
        const config = await api("/api/config", { method: "PUT", body: JSON.stringify(patch), signal: AbortSignal.timeout(10_000) });
        dispatch({ type: "configStatus", config });
      } catch {
      }
    },
    [beat, dispatch, onDone, replay, embedded, keepsDraft, hosted, maus],
  );

  // The answers join the person's About me once the questions are behind them; a failed save leaves the run going.
  const saveIntake = useCallback(async () => {
    if (!intakeAnswered(answers)) return;
    const aboutMe = mergeAboutMe(state.config?.profile?.aboutMe ?? "", answers);
    try {
      const config = await api<NonNullable<Config>>("/api/config", { method: "PUT", body: JSON.stringify({ profile: { aboutMe } }), signal: AbortSignal.timeout(10_000) });
      dispatch({ type: "configStatus", config });
    } catch {
    }
  }, [answers, state.config?.profile?.aboutMe, dispatch]);

  // Each screen fades away before the next comes up; a timer moves on, since a hidden window runs no animation to its
  // end. The Chief step comes only when it fits; without it the questions end the run.
  const toChief = beats.includes("chief") && chiefStepFits(state.bots, maus);
  const leaving = useRef(false);
  const go = useCallback((to: BeatId) => {
    leaving.current = true;
    root.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: "ease-in", fill: "forwards" });
    setTimeout(() => {
      root.current?.getAnimations().forEach((animation) => animation.cancel());
      leaving.current = false;
      setBeat(to);
    }, LEAVE_MS);
  }, []);
  const next = useCallback(() => {
    if (finishing.current || leaving.current) return;
    if (beat === "firstJob") void saveIntake();
    const to = beats[beats.indexOf(beat) + 1];
    if (!to || (to === "chief" && !toChief)) return void finish("completed", null);
    go(to);
  }, [beat, beats, toChief, finish, go, saveIntake]);
  const back = useCallback(() => {
    if (finishing.current || leaving.current) return;
    const to = beats[beats.indexOf(beat) - 1];
    if (to) go(to);
  }, [beat, beats, go]);

  const chief = beat === "chief";
  useEffect(() => {
    if (!chief || embedded) return;
    setChiefStepOpen(true);
    return () => setChiefStepOpen(false);
  }, [chief, embedded]);
  // The scrim fades with the dialog and lets clicks through while Corso lands.
  const fadeScrim = useCallback(() => {
    if (!root.current) return;
    root.current.style.pointerEvents = "none";
    root.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: "forwards" });
  }, []);

  useEffect(() => {
    if (beat === "meet" || beat === "voice" || beat === "firstJob") root.current?.focus({ preventScroll: true });
  }, [beat]);

  // Escape moves on as Later does; Enter on the screen itself presses Next while it can be pressed.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((beat === "meet" || isIntakeBeat(beat)) && event.key === "Escape") {
      event.preventDefault();
      next();
      return;
    }
    if ((beat === "meet" || isIntakeBeat(beat)) && event.key === "Enter" && event.target === root.current) {
      event.preventDefault();
      root.current.querySelector<HTMLButtonElement>("[data-primary]:not([disabled])")?.click();
      return;
    }
    trapTab(event, root.current);
  };

  return (
    <div
      ref={root}
      role={chief ? undefined : "dialog"}
      aria-modal={chief ? undefined : true}
      aria-labelledby={chief ? undefined : "welcome-title"}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-welcome={beat}
      className={cn(
        "welcome-screen flex outline-none",
        embedded ? "relative h-full w-full" : "fixed inset-0 z-50",
        chief ? "ui-scrim items-center justify-center p-4" : "overflow-y-auto bg-app",
      )}
    >
      {chief ? (
        <ChiefIntro replay={replay} onLeave={fadeScrim} onDone={(botId) => void finish("completed", botId)} />
      ) : isIntakeBeat(beat) ? (
        <IntakeSteps beat={beat} answers={answers} setAnswers={setAnswers} job={job} setJob={setJob}
          onNext={next} onBack={back}
          onSkip={() => { setAnswers(withoutStep(answers, beat)); if (beat === "firstJob") setJob(null); next(); }} />
      ) : (
        <MeetScreen hosted={hosted} onNext={next} />
      )}
    </div>
  );
}
