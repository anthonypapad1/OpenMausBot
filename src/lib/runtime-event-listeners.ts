// Who else hears each live runtime frame. src/lib/live-events.ts calls emitRuntimeEvent for every one; a screen's store
// subscribes here instead of being imported by live-events.ts, so the live path doesn't pull that store, and everything it
// imports (the translation catalogs included), into every page and test that reads live frames.
import type { RuntimeEvent } from "../../shared/runtime-events";

type Listener = (event: RuntimeEvent) => void;
const listeners = new Set<Listener>();

/** Hear every live runtime frame from now on; the returned function stops it. */
export function onRuntimeEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitRuntimeEvent(event: RuntimeEvent): void {
  for (const listener of listeners) listener(event);
}
