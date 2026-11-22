// Notes from another AI on their way in, as the chat shows it: the card above the message box says they came (from
// Downloads, a dropped file or a paste) while they are brought in, then what came in, for a few seconds. Held outside
// the app reducer.
import { useSyncExternalStore } from "react";

export type NotesVia = "downloads" | "drop" | "paste";

/** How long the card says what came in before it goes. */
export const ARRIVAL_SHOWN_MS = 6_000;
/** A failure stays a little longer, so it can be read. */
export const ARRIVAL_FAILED_MS = 8_000;

export interface NotesArrival {
  via: NotesVia;
  /** The chat it came into; Downloads' is the first bot's. */
  botId: string | null;
  at: number;
  /** Bringing in, then done or failed with the line that says how it went. */
  state: "working" | "done" | "failed";
  line?: string;
}

let arrival: NotesArrival | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const changed = () => { for (const listener of Array.from(listeners)) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function hideAfter(ms: number | null) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = ms === null ? null : setTimeout(() => {
    hideTimer = null;
    arrival = null;
    changed();
  }, ms);
}

/** The notes came: the card says they are being brought in until `arrivalDone` or `arrivalFailed`. */
export function noteArrival(via: NotesVia, botId: string | null, now = Date.now()): void {
  arrival = { via, botId, at: now, state: "working" };
  hideAfter(null);
  changed();
}

/** They came in: the card says what came in for ARRIVAL_SHOWN_MS, then goes. */
export function arrivalDone(line: string, now = Date.now()): void {
  arrival = { via: arrival?.via ?? "paste", botId: arrival?.botId ?? null, at: now, state: "done", line };
  hideAfter(ARRIVAL_SHOWN_MS);
  changed();
}

/** They couldn't be read: the card says why for ARRIVAL_FAILED_MS. */
export function arrivalFailed(line: string, now = Date.now()): void {
  arrival = { via: arrival?.via ?? "paste", botId: arrival?.botId ?? null, at: now, state: "failed", line };
  hideAfter(ARRIVAL_FAILED_MS);
  changed();
}

export function dismissArrival(): void {
  hideAfter(null);
  if (!arrival) return;
  arrival = null;
  changed();
}

export const notesArrival = () => arrival;
export function useNotesArrival(): NotesArrival | null {
  return useSyncExternalStore(subscribe, notesArrival, () => null);
}
