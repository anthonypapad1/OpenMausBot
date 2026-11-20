// The Today page's one copy of GET /api/deals/today, shared by the page and the sidebar's Today row. The server pushes no
// event when a deal changes, so it is read again every minute, and at once when the window comes back.
import { useEffect, useSyncExternalStore } from "react";
import type { DealTodayView } from "../../shared/deals";
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

/** Reads the day now; a read already on its way is shared rather than sent twice. */
export function refreshDealsToday(): Promise<void> {
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

/** Keeps the day current while the app is open: on mount, every DEALS_TODAY_POLL_MS, and when the window gets focus. */
export function useDealsTodayLoader(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void refreshDealsToday();
    const timer = setInterval(() => void refreshDealsToday(), DEALS_TODAY_POLL_MS);
    const again = () => void refreshDealsToday();
    window.addEventListener("focus", again);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", again);
    };
  }, [enabled]);
}
