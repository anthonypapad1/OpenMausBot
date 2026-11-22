// "Bring what you already use": what this computer holds (the one app that knows this person, then the rest), each with
// its own Bring in, and the prompt for AIs online below it (BringPrompt): copy it, paste it there, and its answer comes in
// when it is pasted or dropped into any chat, or saved to Downloads.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, Copy, Laptop } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { copyNotesPrompt, looksLikeNotes, notesInFiles } from "@/lib/assistant-notes";
import { amountLine, broughtIds, knowsLine, memorySource, type BringRun, type LocalFind } from "@/lib/first-run-import";
import { NOTES_PROMPT } from "../../shared/assistant-notes";
import { useNotesIntake, type NotesSay } from "./NotesWaiting";
import { ClaudeMark, CodexMark, CursorMark, PresetProviderMark } from "./ProviderIcons";

/** The app's own mark, by the find's tool. */
function FindMark({ find, size = 18 }: { find: LocalFind; size?: number }) {
  switch (find.source) {
    case "claudeCode":
    case "claudeDesktop": return <ClaudeMark size={size} />;
    case "codex": return <CodexMark size={size} />;
    case "cursor": return <CursorMark size={size} />;
    case "gemini": return <PresetProviderMark preset="google" size={size} />;
    default: return <Laptop size={size} aria-hidden="true" />;
  }
}

type RowState = "idle" | "working" | "done";

/** "18 things about you and 12 skills. Used on 4 of the last 30 days.": what it holds and how much it is really used. */
function lineFor(find: LocalFind): string {
  const summary = amountLine(find.amount, 2);
  return find.activeDays ? t("bring.summaryDays", { summary, count: Math.min(find.activeDays, 30) }) : `${summary}.`;
}

const ROW_BUTTON = "ui-button ui-button-pill ui-button-sm shrink-0 gap-1.5 disabled:opacity-50";
const PRIMARY_BUTTON = "ui-button ui-button-pill ui-button-md ui-button-primary gap-1.5 disabled:opacity-60";
const WORKING_DOT = "inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-current motion-reduce:animate-none";

/** The one app that knows this person, said as a person would: it already knows you; bring what it's learned. Its
 * skills and tools come along quietly; only the memory is offered. */
function MemorySource({ find, state, busy, said, onImport }: { find: LocalFind; state: RowState; busy: boolean; said: string | null; onImport: () => void }) {
  const done = state === "done";
  return (
    <div data-bring-find={find.id} data-bring-hero="" data-bring-state={state} className="flex flex-col gap-4 rounded-xl bg-ink/[0.035] p-5 text-start">
      <div className="flex min-w-0 items-start gap-3.5">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-app"><FindMark find={find} size={22} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-medium leading-[22px] text-ink">{t("bring.knowsYou", { app: find.app })}</span>
          {done ? (
            <span role="status" data-bring-said="" className="flex items-start gap-1.5 text-pretty text-[13px] leading-[18px] text-ink">
              <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0" />{said ?? t("bring.imported")}
            </span>
          ) : (
            <span data-bring-topics="" className="text-pretty text-[13px] leading-[18px] text-ink-secondary">
              {knowsLine(find)}{find.activeDays ? ` ${t("bring.usedDays", { count: Math.min(find.activeDays, 30) })}` : ""}
            </span>
          )}
        </span>
      </div>
      {!done && (
        <button type="button" data-bring-import={find.id} disabled={busy} onClick={onImport}
          aria-label={state === "working" ? undefined : t("bring.importApp", { app: find.app })} className={cn(PRIMARY_BUTTON, "w-full sm:w-auto sm:self-start")}>
          {state === "working" && <span aria-hidden="true" className={WORKING_DOT} />}
          {state === "working" ? t("bring.importing") : t("bring.bringIt")}
        </button>
      )}
    </div>
  );
}

function Imported() {
  return (
    <span data-bring-imported="" className="inline-flex min-h-8 shrink-0 items-center gap-1 px-2 text-[13px] leading-[18px] text-ink-secondary">
      <Check size={14} aria-hidden="true" />{t("bring.imported")}
    </span>
  );
}

/** Anything else this computer holds: its mark, what it holds, and its own quiet Bring in. */
function FindRow({ find, state, busy, onImport }: { find: LocalFind; state: RowState; busy: boolean; onImport: () => void }) {
  return (
    <li data-bring-find={find.id} data-bring-state={state} className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-start">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-app"><FindMark find={find} size={16} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium leading-[18px] text-ink">{find.app}</span>
        <span className="truncate text-[12px] leading-4 text-ink-tertiary">{lineFor(find)}</span>
      </span>
      {state === "done" ? <Imported /> : (
        <button type="button" data-bring-import={find.id} disabled={busy} onClick={onImport} aria-label={state === "working" ? undefined : t("bring.importApp", { app: find.app })} className={ROW_BUTTON}>
          {state === "working" && <span aria-hidden="true" className={WORKING_DOT} />}
          {state === "working" ? t("bring.importing") : t("bring.import")}
        </button>
      )}
    </li>
  );
}

/** A quiet status line: a slow breath while it works, then what came in, or what went wrong. */
function StatusLine({ state, line, ...rest }: { state: "working" | "done" | "failed"; line: string; "data-bring-run"?: string; "data-bring-notes"?: string }) {
  return (
    <p role="status" aria-live="polite" {...rest} className="m-0 mt-3 flex animate-fade-in items-start gap-2 px-1 text-start text-[13px] leading-[18px] text-ink-secondary motion-reduce:animate-none">
      {state === "working"
        ? <span aria-hidden="true" className={cn(WORKING_DOT, "mt-[6px] bg-ink/60")} />
        : state === "failed"
          ? <CircleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-secondary" />
          : <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink" />}
      <span className="min-w-0 text-pretty">{line}</span>
    </p>
  );
}

/** How the bringing in is going, under what was chosen. */
function RunLine({ run }: { run: BringRun }) {
  if (run.kind === "idle") return null;
  return <StatusLine data-bring-run={run.kind} state={run.kind === "working" ? "working" : run.failed ? "failed" : "done"} line={run.kind === "working" ? t("bring.working") : run.line} />;
}

/** The one memory source, and everything else here, by how much each is really used, then by how much it holds. */
export function useBringChoice(finds: readonly LocalFind[] | null) {
  return useMemo(() => {
    const rows = finds ?? [];
    const source = memorySource(rows);
    const others = rows.filter((find) => find !== source).sort((a, b) => (b.activeDays ?? 0) - (a.activeDays ?? 0) || b.score - a.score);
    return { rows, source, others, found: rows.length > 0 };
  }, [finds]);
}
export type BringChoice = ReturnType<typeof useBringChoice>;

/** One of the three steps, its number on a soft tonal disc. */
function How({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-[12px] font-medium leading-4 tabular-nums text-ink-secondary">{n}</span>
      <span className="min-w-0 pt-[3px] text-pretty text-[13px] leading-[18px] text-ink-secondary">{children}</span>
    </li>
  );
}

const DISCLOSE = "transition-[grid-template-rows,opacity] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/** For AIs that live online (ChatGPT, Claude, Gemini, Grok): three steps around a prompt to copy. Its answer comes in
 * when it is pasted or dropped here or into any chat, or saved to Downloads; the first bot's chat waits for it. */
export function BringPrompt({ titled = false }: { titled?: boolean }) {
  const promptId = useId();
  const notes = useNotesHere();
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [open, setOpen] = useState(false);
  const copyPrompt = async () => setCopy((await copyNotesPrompt()) ? "copied" : "failed");

  return (
    <section data-bring-prompt="" data-bring-drop={notes.over ? "over" : undefined} aria-labelledby={`${promptId}-label`} className={cn("w-full text-start", titled && "mt-5")}>
      <h2 id={`${promptId}-label`} className={titled ? "m-0 mb-2 px-1 text-[12px] font-medium leading-4 text-ink-tertiary" : "sr-only"}>{t("bring.onlineLabel")}</h2>
      <div className={cn("rounded-xl bg-ink/[0.035] p-4 transition-colors duration-150 motion-reduce:transition-none", notes.over && "bg-ink/[0.07]")}>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          <How n={1}>{t("bring.howCopy")}</How>
          <How n={2}>{t("bring.howPaste")}</How>
          <How n={3}>{t("bring.howFile")}</How>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 ps-9">
          <button type="button" data-bring-copy="" onClick={() => void copyPrompt()} className={ROW_BUTTON}>
            {copy === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copy === "copied" ? t("bring.copiedShort") : t("bring.copyPrimary")}</span>
          </button>
          <button type="button" data-bring-see="" aria-expanded={open} aria-controls={`${promptId}-text`} onClick={() => setOpen((was) => !was)}
            className="flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[13px] leading-[18px] text-ink-tertiary transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none">
            <span>{open ? t("bring.hidePrompt") : t("bring.seePrompt")}</span>
            <ChevronDown size={14} aria-hidden="true" className={cn("transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
          </button>
        </div>
        {copy !== "idle" && (
          <p role="status" data-bring-copied={copy} className={cn("mb-0 mt-2 animate-fade-in ps-9 text-pretty text-[12px] leading-4 motion-reduce:animate-none", copy === "failed" ? "text-danger" : "text-ink-tertiary")}>
            {copy === "failed" ? t("bring.copyFailed") : t("bring.copied")}
          </p>
        )}
        <div id={`${promptId}-text`} inert={!open} className={cn("grid", DISCLOSE, open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="min-h-0 overflow-hidden">
            <pre tabIndex={open ? 0 : -1} aria-label={t("bring.promptLabel")}
              className="m-0 mt-3 max-h-[200px] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-lg bg-app px-3.5 py-3 font-mono text-[12px] leading-[18px] text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {NOTES_PROMPT}
            </pre>
          </div>
        </div>
      </div>
      {notes.said && <StatusLine data-bring-notes={notes.said.state} state={notes.said.state} line={notes.said.line} />}
    </section>
  );
}

/** Notes from another AI, pasted or dropped while this is open, come in here and say how it went here. Nothing behind
 * sees them: the chat box would otherwise attach a dropped file, and one Send would hand it to its model. */
function useNotesHere(): { said: { line: string; state: "working" | "done" | "failed" } | null; over: boolean } {
  const takeNotes = useNotesIntake();
  const [said, setSaid] = useState<{ line: string; state: "working" | "done" | "failed" } | null>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const say: NotesSay = (line, state) => setSaid({ line, state });
    const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    let depth = 0;
    const paste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikeNotes(pasted)) return;
      event.preventDefault();
      event.stopPropagation();
      takeNotes(pasted, say, "paste");
    };
    const hold = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "dragenter") depth += 1;
      if (event.type === "dragleave") depth = Math.max(0, depth - 1);
      setOver(depth > 0);
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth = 0;
      setOver(false);
      void notesInFiles(Array.from(event.dataTransfer?.files ?? [])).then((notes) => {
        if (notes) takeNotes(notes.text, say, "drop");
        else say(t("composer.notes.error.notExport"), "failed");
      });
    };
    const listeners = [["paste", paste], ["dragenter", hold], ["dragover", hold], ["dragleave", hold], ["drop", drop]] as const;
    for (const [type, listener] of listeners) window.addEventListener(type, listener as EventListener, true);
    return () => {
      for (const [type, listener] of listeners) window.removeEventListener(type, listener as EventListener, true);
    };
  }, [takeNotes]);
  return { said, over };
}

const STEP_SHOWN = 3;

/** Up front: the finds used lately and holding enough, else (with no app that knows the person) the first few; the rest
 * wait behind Show more. */
function upFront(others: readonly LocalFind[], source: LocalFind | null): LocalFind[] {
  const strong = others.filter((find) => find.strong).slice(0, STEP_SHOWN);
  return strong.length || source ? strong : others.slice(0, STEP_SHOWN);
}

/** What this computer holds, each with its own Bring in, and the prompt for AIs online below. Only the strongest finds
 * show until Show more. */
export function BringIn({ finds, choice, run, onImport }: {
  /** null while still looking. */
  finds: readonly LocalFind[] | null;
  choice: BringChoice;
  /** The bringing in, once started (useBringRun). */
  run: BringRun;
  /** One app's own Bring in. */
  onImport?: (find: LocalFind) => void;
}) {
  const brought = broughtIds(run);
  const busy = run.kind === "working";
  const rowState = (find: LocalFind): RowState => brought.includes(find.id) ? "done" : busy && run.ids.includes(find.id) ? "working" : "idle";
  const { source, others, found } = choice;
  const [all, setAll] = useState(false);
  const front = all ? others : upFront(others, source);
  const hidden = others.length - front.length;
  // the last bringing in was the source's own: it says how it went where the person is looking
  const [sourceLast, setSourceLast] = useState(false);
  const said = run.kind === "done" && sourceLast
    ? (run.known ? (run.known === 1 ? t("bring.knowDoneOne") : t("bring.knowDone", { count: run.known })) : run.line)
    : null;

  return (
    <div data-bring-in="" className="w-full">
      {finds === null && <p role="status" data-bring-looking="" className="mb-6 text-[13px] leading-[18px] text-ink-tertiary">{t("bring.looking")}</p>}
      {source && (
        <MemorySource find={source} state={rowState(source)} busy={busy} said={said}
          onImport={() => { setSourceLast(true); onImport?.(source); }} />
      )}
      {others.length > 0 && (
        <section aria-labelledby="bring-others" className="mt-5 w-full text-start">
          <h2 id="bring-others" className="m-0 mb-1 px-1 text-[12px] font-medium leading-4 text-ink-tertiary">{source ? t("bring.alsoHere") : t("bring.onThis")}</h2>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {front.map((find) => <FindRow key={find.id} find={find} state={rowState(find)} busy={busy} onImport={() => { setSourceLast(false); onImport?.(find); }} />)}
          </ul>
          {hidden > 0 && (
            <button type="button" data-bring-more="" onClick={() => setAll(true)}
              className="ms-2 mt-1 flex min-h-8 items-center gap-1 rounded-full px-2 text-[13px] leading-[18px] text-ink-tertiary transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none">
              <span>{t("bring.showMore", { count: hidden })}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
          {!sourceLast && run.kind !== "idle" && <RunLine run={run} />}
        </section>
      )}
      <BringPrompt titled={found} />
    </div>
  );
}
