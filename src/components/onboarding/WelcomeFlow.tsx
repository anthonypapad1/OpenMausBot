import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { setEmailGateDone, track } from "@/lib/analytics";
import { looksLikeNotes } from "@/lib/assistant-notes";
import { cn } from "@/lib/cn";
import { EMPTY_INTAKE, intakeAnswered, mergeAboutMe, type FirstJobId, type IntakeAnswers } from "@/lib/corso-intake";
import { firstRunMakesDesks, pathDesks } from "@/lib/desks/path-desks";
import { createFirstRunDesks } from "@/lib/first-run-desks";
import { chiefStepFits, holdBotCount, myDefaultBot, setChiefStepOpen, useViewerEmail } from "@/lib/default-bot";
import { appendComposerDraft } from "@/lib/drafts";
import { bringChosen, localFinds, useBringRun, type LocalFind } from "@/lib/first-run-import";
import { t } from "@/lib/i18n";
import { beatsFor, completionPatch, firstRunPatch, markWelcomeFinished, resumeBeat, showWelcome, type BeatId } from "@/lib/onboarding";
import { macPermissionsBridge, permissionsMissing, type MacPermissionStatus } from "@/lib/mac-permissions";
import { detectSetupWithin, localSetupImport, setupImportApi } from "@/lib/setup-import";
import { clearWelcomeDraft, readWelcomeDraft, saveWelcomeDraft } from "@/lib/welcome-draft";
import { api, useStore } from "@/state/store";
import type { SetupDetection } from "../../../shared/setup-import";
import { useNotesIntake } from "../NotesWaiting";
import { AiStep } from "./AiStep";
import { BringStatus, BringStep } from "./BringStep";
import { ChiefIntro } from "./ChiefIntro";
import { FunnelBar, WelcomeStep } from "./FunnelSteps";
import { FIRST_JOB_KEYS, IntakeSteps, isIntakeBeat, withoutStep } from "./IntakeSteps";
import { PermissionsStep } from "./PermissionsStep";
import { useWelcomeAi } from "./welcome-ai";
import { localDesktopPage } from "./WelcomeGate";

const LEAVE_MS = 100;

const FADE_MS = 150;

/** How long the first run looks for other AI apps here before it settles on what it has: the steps before the bring
 * step take longer than this, so it is never waited on. */
export const FIRST_RUN_LOOK_MS = 30_000;

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

/** The first run, one calm screen at a time: the hello, an AI, what other AI apps here hold and the prompt for AIs
 * online, Corso's questions about the person's business (IntakeSteps), then the Chief of Staff over the app itself. Its
 * end is the chat with the bot chosen there (`onDone`), with the first job picked in the questions waiting in its
 * message box. */
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
  // what other AI apps left on this computer, looked for from the hello on in the background so the bring step is ready
  // by the time it shows; the step's prompt for AIs online is there either way
  // by the time it shows; the step's prompt for AIs online is there either way. A gallery opened on the step looks too.
  const offersBring = (!replay && !embedded && !hosted && localSetupImport(state.config?.cloudHome === true)) || initialBeat === "bring";
  // this Mac's permissions: read once, so the step stays put while the person grants them; offered until that read says
  // nothing is missing, which lets a run reopened on this step (Screen Recording needs that) land back on it
  const macAccess = useMemo(() => (!embedded || initialBeat === "permissions" ? macPermissionsBridge() : null), [embedded, initialBeat]);
  const [firstAccess, setFirstAccess] = useState<MacPermissionStatus | null | undefined>(macAccess ? undefined : null);
  useEffect(() => {
    if (!macAccess) return;
    void macAccess.status().then((found) => setFirstAccess((known) => (known === undefined ? found : known)),
      () => setFirstAccess((known) => (known === undefined ? null : known)));
  }, [macAccess]);
  const permissions = !hosted && Boolean(macAccess) && (firstAccess === undefined || permissionsMissing(firstAccess) || initialBeat === "permissions");
  const beats = beatsFor({ hosted, bring: offersBring, permissions });
  const [beat, setBeat] = useState<BeatId>(() => resumeBeat(beats, initialBeat ?? (keepsDraft ? readWelcomeDraft()?.beat : undefined)));
  const root = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);
  const record = useRef(state.config?.onboarding);
  record.current = state.config?.onboarding;
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY_INTAKE);
  const intake = useRef(answers);
  intake.current = answers;
  const [job, setJob] = useState<FirstJobId | null>(null);
  // a first job belongs to its path: picking another path drops it
  const answer = useCallback((next: IntakeAnswers) => {
    if ((next.path ?? null) !== (intake.current.path ?? null)) setJob(null);
    setAnswers(next);
  }, []);
  const firstJob = useRef<FirstJobId | null>(null);
  firstJob.current = job;
  const bots = useRef(state.bots);
  bots.current = state.bots;
  const firstRun = !replay && !embedded && !hosted;
  const desksCounted = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!firstRun) return;
    const release = holdBotCount();
    desksCounted.current = release;
    return release;
  }, [firstRun]);
  // An AI counts once it answered a test message (or cannot be sent one); the free backup only once picked here.
  const [chosen, setChosen] = useState<string | null>(null);
  const tested = useWelcomeAi(state.instances, !hosted, chosen, "meet");

  const [detection, setDetection] = useState<SetupDetection | null | undefined>(offersBring ? undefined : null);
  useEffect(() => {
    if (!offersBring) return;
    const look = detectSetupWithin(setupImportApi, FIRST_RUN_LOOK_MS);
    void look.found.then(setDetection);
    return look.cancel;
  }, [offersBring]);
  const finds = useMemo(() => (detection === undefined ? null : localFinds(detection)), [detection]);
  const bringRun = useBringRun();
  const [notesLine, setNotesLine] = useState<string | null>(null);

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
      // the path's Desks join the sidebar behind the Chief's chat
      if (!embedded && !hosted && firstRunMakesDesks(intake.current)) void createFirstRunDesks(pathDesks(intake.current), bots.current, dispatch);
      desksCounted.current?.();
      try {
        const patch = replay ? completionPatch() : firstRunPatch(record.current, new Date());
        const config = await api("/api/config", { method: "PUT", body: JSON.stringify(patch), signal: AbortSignal.timeout(10_000) });
        dispatch({ type: "configStatus", config });
      } catch {
      }
    },
    [beat, dispatch, onDone, replay, embedded, hosted, keepsDraft, maus],
  );

  // The answers join the person's About me once the questions are behind them, replacing a Brokerage or Market line the
  // bring step brought in; a failed save leaves the run going.
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

  // each step's title takes focus, so a screen reader hears where it is; a step with a field of its own keeps it
  useEffect(() => {
    if (chief) return;
    const title = root.current?.querySelector<HTMLElement>("#welcome-title");
    if (title && !root.current?.querySelector("[autofocus]") && !root.current?.contains(document.activeElement)) title.focus({ preventScroll: true });
    else if (!title) root.current?.focus({ preventScroll: true });
  }, [beat, chief]);

  const bring = (find: LocalFind) => void bringChosen([find], { firstBotId: maus?.id ?? null });
  // notes from another AI pasted on any step come in from here too (the bring step takes them itself, and says so there)
  const takeNotes = useNotesIntake();
  const onPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData("text/plain");
    if (!looksLikeNotes(pasted)) return;
    event.preventDefault();
    takeNotes(pasted, setNotesLine);
  };

  // Escape is "not now": past an optional step, never past the hello. Enter on the screen itself presses its way on.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!chief && beat !== "welcome" && event.key === "Escape") {
      if (event.defaultPrevented) return;
      event.preventDefault();
      next();
      return;
    }
    if (!chief && event.key === "Enter" && event.target === root.current) {
      event.preventDefault();
      root.current.querySelector<HTMLButtonElement>("[data-primary]:not([disabled])")?.click();
      return;
    }
    trapTab(event, root.current);
  };

  let body: ReactNode;
  if (chief) body = <ChiefIntro replay={replay} onLeave={fadeScrim} onDone={(botId) => void finish("completed", botId)} />;
  else if (isIntakeBeat(beat)) {
    body = (
      <IntakeSteps beat={beat} answers={answers} setAnswers={answer} job={job} setJob={setJob}
        onNext={next}
        onSkip={() => { answer(withoutStep(answers, beat)); if (beat === "firstJob") setJob(null); next(); }} />
    );
  } else if (beat === "ai") body = <AiStep tested={tested} hosted={hosted} onChoose={setChosen} onNext={next} />;
  else if (beat === "bring") body = <BringStep finds={finds} run={bringRun} onBring={bring} onNext={next} />;
  else if (beat === "permissions" && macAccess) {
    const relaunch = window.ogb?.relaunch;
    body = <PermissionsStep bridge={macAccess} relaunch={relaunch ? () => void relaunch().catch(() => {}) : null} onNext={next} />;
  }
  else body = <WelcomeStep onStart={next} />;

  // the Chief is the app itself under a scrim, not a step of the run
  const steps: BeatId[] = beats.filter((one) => one !== "chief");
  const index = steps.indexOf(beat);
  const previous = index > 0 ? back : null;
  return (
    <div
      ref={root}
      role={chief ? undefined : "dialog"}
      aria-modal={chief ? undefined : true}
      aria-labelledby={chief ? undefined : "welcome-title"}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      data-welcome={beat}
      className={cn(
        "welcome-screen flex outline-none",
        embedded ? "relative h-full w-full" : "fixed inset-0 z-50",
        chief ? "ui-scrim items-center justify-center p-4" : "overflow-y-auto bg-app",
      )}
    >
      {!chief && beat !== "welcome" && steps.length > 1 && <FunnelBar at={index} count={steps.length} onBack={previous} />}
      {chief ? body : <div key={beat} className="relative flex min-h-full w-full flex-col">{body}</div>}
      {/* the bring step says how its own bringing in went; every later step keeps the line at its foot */}
      {!chief && <BringStatus working={beat !== "bring" && bringRun.kind === "working"} line={notesLine ?? (beat !== "bring" && bringRun.kind === "done" ? bringRun.line : null)} />}
    </div>
  );
}
