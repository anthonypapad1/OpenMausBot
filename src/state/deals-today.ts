// The Today page's one copy of GET /api/deals/today, shared by the page and the sidebar's Today row, so the row's count is
// always the page's. The server pushes no event when a deal changes, so it is read again every minute, when the window
// comes back, each time the Today page is opened, and whenever a bot's turn ends, since a turn is how deals change.
// Turn ends arrive through noteDealsTurnEvent, which src/lib/live-events.ts calls for every live runtime frame.
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { DealTodayView } from "../../shared/deals";
import type { RuntimeEvent } from "../../shared/runtime-events";
import { api } from "./api";

export const DEALS_TODAY_POLL_MS = 60_000;

export interface DealsToday {
  view: DealTodayView | null;
  /** The last read failed; `view` is still the last one that arrived. */
  failed: boolean;
}

const EMPTY: DealsToday = { view: null, failed: false };
let value = EMPTY;
const listeners = new Set<() => void>();
const set = (next: DealsToday) => { value = next; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const get = () => value;

export const currentDealsToday = get;
export const useDealsToday = (): DealsToday => useSyncExternalStore(subscribe, get, get);
/** Tests and previews show a day of their own. */
export const setDealsToday = (view: DealTodayView | null, failed = false): void => set({ view, failed });

// Each read takes the next number; an answer lands only if no later one has, so a slow read never shows an older day.
let sent = 0, shown = 0;
let reading: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/** Reads the day now; a read already on its way is shared rather than sent twice. `fresh` is for a moment a deal may just
 * have changed: a read sent before it can't show the change, so one more goes out after it, shared by every fresh ask. */
export function refreshDealsToday({ fresh = false }: { fresh?: boolean } = {}): Promise<void> {
  if (reading && fresh) return (queued ??= reading.then(() => { queued = null; return refreshDealsToday(); }));
  if (reading) return reading;
  const seq = ++sent;
  reading = api<DealTodayView>("/api/deals/today", { background: true })
    .then((view) => {
      if (seq < shown || !Array.isArray(view?.needsYou)) return;
      shown = seq;
      set({ view, failed: false });
    })
    .catch(() => { if (seq >= shown) set({ ...value, failed: true }); })
    .finally(() => { reading = null; });
  return reading;
}

// Loaders keeping the day current; a turn's end reads the day only while one is.
let loaders = 0;

/** A live runtime frame from any thread. A bot's turn that has ended may have saved deals, so the day is read again. */
export function noteDealsTurnEvent(event: Pick<RuntimeEvent, "type">): void {
  if (loaders === 0) return;
  if (event.type === "turn.completed" || event.type === "cap.exhausted" || event.type === "session.exited") void refreshDealsToday({ fresh: true });
}

/** Keeps the day current while the app is open: on mount, every DEALS_TODAY_POLL_MS, when the window gets focus, when
 * the Today page comes into view (`todayShown` turning true), and when a bot's turn ends. */
export function useDealsTodayLoader(enabled: boolean, todayShown: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    loaders++;
    void refreshDealsToday();
    const timer = setInterval(() => void refreshDealsToday(), DEALS_TODAY_POLL_MS);
    const again = () => void refreshDealsToday();
    window.addEventListener("focus", again);
    return () => {
      loaders--;
      clearInterval(timer);
      window.removeEventListener("focus", again);
    };
  }, [enabled]);
  // Only the Today page coming into view reads here; a page showing from the start is the mount read's.
  const wasShown = useRef(todayShown);
  useEffect(() => {
    const opened = todayShown && !wasShown.current;
    wasShown.current = todayShown;
    if (enabled && opened) void refreshDealsToday({ fresh: true });
  }, [enabled, todayShown]);
}
