// Notes from another AI, as the chat takes them: pasted into any chat, and one quiet card above the first bot's message
// box while they are on their way. When they come (from Downloads, a drop or a paste) that card says they are being
// brought in, then what came in, for a few seconds, and goes. Nothing about the import is ever said inside the message
// box.
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import { localSetupImport } from "@/lib/setup-import";
import { arrivalDone, arrivalFailed, dismissArrival, noteArrival, useNotesArrival, type NotesVia } from "@/lib/notes-arrival";
import {
  copyNotesPrompt, importNotes, isNotesPrompt, looksLikeNotes, notesErrorLine, notesOutcomeLine, notesWatch, scheduleNotesReminder, stopWaiting,
  takeNotesFromDownloads, useNotesWaiting, WATCH_EVERY_MS,
} from "@/lib/assistant-notes";
import { myDefaultBot, useViewerEmail } from "@/lib/default-bot";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";

export type NotesSay = (line: string, state: "working" | "done" | "failed") => void;

/** Takes a pasted or dropped block. A chat passes no `say`: the card above its message box says how it goes. A screen
 * of its own (the bring step) passes `say` to hear "bringing in…", then the outcome. */
export function useNotesIntake() {
  const { state, dispatch } = useStore();
  const firstBotId = myDefaultBot(state.bots, useViewerEmail())?.id ?? null;
  return useCallback((text: string, say?: NotesSay, via: NotesVia = "paste", chatBot?: string | null) => {
    // the chat it was pasted or dropped into; a group's or none is the first bot's
    const here = (chatBot && state.bots.some((bot) => bot.id === chatBot) ? chatBot : null) ?? firstBotId;
    if (isNotesPrompt(text)) {
      if (say) say(t("composer.notes.error.prompt"), "failed");
      else { noteArrival(via, here); arrivalFailed(t("composer.notes.error.prompt")); }
      return;
    }
    if (say) say(t("composer.notes.working"), "working");
    else noteArrival(via, here);
    void importNotes(text, { bots: state.bots, aboutMe: state.config?.profile?.aboutMe ?? "", team: Boolean(state.config?.team), firstBotId, dispatch })
      .then((outcome) => {
        const line = notesOutcomeLine(outcome);
        const failed = outcome.failed.length > 0 || Boolean(outcome.lost?.length);
        if (say) say(line, failed ? "failed" : "done");
        else if (failed) arrivalFailed(line);
        else arrivalDone(line);
      }, (cause: unknown) => (say ? say(notesErrorLine(cause), "failed") : arrivalFailed(notesErrorLine(cause))));
  }, [state.bots, state.config?.profile?.aboutMe, state.config?.team, firstBotId, dispatch]);
}

/** A chat's paste: notes another AI wrote for Corso come in, wherever they are pasted, instead of being sent. True when
 * the paste was notes and is taken. */
export function useNotesPaste(chatBot: string | null) {
  const takeNotes = useNotesIntake();
  return useCallback((event: ClipboardEvent<HTMLElement>, pasted: string) => {
    if (!looksLikeNotes(pasted)) return false;
    event.preventDefault();
    takeNotes(pasted, undefined, "paste", chatBot);
    return true;
  }, [takeNotes, chatBot]);
}

/** While the prompt's answer may still come, Downloads is checked every few seconds for the corso-notes.md it asks for,
 * and a new one comes in by itself. Only on the desktop app's own computer; never before the prompt was copied. Paste
 * and drop still work the whole time. */
export function useNotesFromDownloads() {
  const { state, dispatch } = useStore();
  const firstBotId = myDefaultBot(state.bots, useViewerEmail())?.id ?? null;
  const context = useRef({ bots: state.bots, aboutMe: "", team: false, firstBotId, dispatch });
  context.current = { bots: state.bots, aboutMe: state.config?.profile?.aboutMe ?? "", team: Boolean(state.config?.team), firstBotId, dispatch };
  const local = Boolean(state.config) && localSetupImport(state.config?.cloudHome === true);
  useEffect(() => {
    if (!local) return;
    let busy = false;
    const timer = setInterval(() => {
      const watch = notesWatch();
      if (busy || !watch || Date.now() > watch.until) return;
      busy = true;
      void takeNotesFromDownloads(context.current).finally(() => { busy = false; });
    }, WATCH_EVERY_MS);
    return () => clearInterval(timer);
  }, [local]);
}

/** One reminder 15 minutes after the prompt was copied, while its answer hasn't come: a system notification that opens
 * the first bot's chat. Without permission for one, the waiting line in that chat is the reminder. */
export function useNotesReminder() {
  const { state, dispatch } = useStore();
  const waiting = useNotesWaiting();
  const firstBotId = myDefaultBot(state.bots, useViewerEmail())?.id;
  useEffect(() => {
    if (!waiting || waiting.reminded || !firstBotId) return;
    return scheduleNotesReminder(() => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      try {
        new Notification(t("composer.notes.remindTitle"), { body: t("composer.notes.remindBody"), tag: "corso:notes", silent: true }).onclick = () => {
          window.focus();
          dispatch({ type: "select", id: firstBotId });
        };
      } catch {}
    });
  }, [waiting, firstBotId, dispatch]);
}

const cardClass = "mb-2 flex items-center gap-2 rounded-xl bg-ink/[0.04] py-1.5 pe-1.5 ps-3 text-[13px] leading-[18px] text-ink-secondary";
const xClass = "grid size-7 shrink-0 place-items-center rounded-full text-ink-tertiary transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";
const dot = <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-ink/60" />;
const liveDot = <span aria-hidden="true" className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-ink/60 motion-reduce:animate-none" />;

/** Above the message box: while notes are on their way (first bot's chat only), "waiting" with the prompt again and a
 * way to stop; once they come into this chat, that they are being brought in, then what came in, then nothing. */
export function NotesWaitingLine({ botId }: { botId: string | undefined }) {
  const { state } = useStore();
  const waiting = useNotesWaiting();
  const arrival = useNotesArrival();
  const first = myDefaultBot(state.bots, useViewerEmail());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!botId) return null;
  if (arrival && (arrival.botId ?? first?.id) === botId) {
    return (
      <div data-notes-arrived={arrival.state} role="status" aria-live="polite" className={cardClass}>
        {arrival.state === "failed" ? <CircleAlert size={14} aria-hidden="true" className="shrink-0" /> : arrival.state === "working" ? liveDot : dot}
        <span className="min-w-0 flex-1 text-pretty">{arrival.state === "working" ? t(`composer.notes.got.${arrival.via}`) : arrival.line}</span>
        <button type="button" data-notes-dismiss="" onClick={dismissArrival} aria-label={t("composer.notes.dismiss")} title={t("composer.notes.dismiss")} className={xClass}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }
  if (!waiting || botId !== first?.id) return null;
  return (
    <div data-notes-waiting="" className={cardClass}>
      {dot}
      <span className="min-w-0 flex-1 text-pretty">{t("composer.notes.waiting")}</span>
      <button type="button" data-notes-copy="" onClick={() => void copyNotesPrompt().then(setCopied)}
        className="shrink-0 rounded-full px-2 py-1 text-ink transition-colors hover:bg-ink/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none">
        {copied ? t("composer.notes.copied") : t("composer.notes.copyAgain")}
      </button>
      <button type="button" data-notes-stop="" onClick={stopWaiting} aria-label={t("composer.notes.stopWaiting")} title={t("composer.notes.stopWaiting")} className={xClass}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
