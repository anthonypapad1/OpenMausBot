// The first run's AI grid, kept free of React so it can be tested on its own.
import { freeFallback } from "../../../shared/ai-ranking";

interface AiTileInstance {
  instanceId: string;
  driverKind: string;
  access?: string;
  readOnly?: boolean;
  snapshot: { state: string; authenticated?: boolean; freeFallback?: boolean; authenticationUnavailableReason?: string };
}

export type AiTileId = "claude" | "chatgpt" | "gemini" | "grok" | "copilot" | "openrouter" | "local";

/** An AI people sign in to with their own plan, not an API key or a custom endpoint. */
const plan = (instance: AiTileInstance) => instance.access !== "api" && instance.access !== "custom";

/** The grid's AIs, by what people call them, and which of this server's AIs are each one (an id listed first wins). */
const TILES: ReadonlyArray<{ id: AiTileId; label: string; ids: readonly string[]; is: (instance: AiTileInstance) => boolean }> = [
  { id: "claude", label: "Claude", ids: ["claude"], is: (instance) => instance.driverKind === "claudeAgent" && plan(instance) },
  { id: "chatgpt", label: "ChatGPT", ids: ["chatgpt", "codex"], is: (instance) => instance.driverKind === "codex" && plan(instance) },
  { id: "gemini", label: "Gemini", ids: ["gemini", "antigravity"], is: (instance) => instance.driverKind === "geminiAgent" || instance.driverKind === "antigravityAgent" },
  { id: "grok", label: "Grok", ids: ["grok", "xaiApi"], is: (instance) => instance.driverKind === "grokAgent" },
  { id: "copilot", label: "GitHub Copilot", ids: ["githubCopilot"], is: (instance) => instance.driverKind === "copilotAgent" },
  { id: "openrouter", label: "OpenRouter", ids: ["openrouter"], is: () => false },
  { id: "local", label: "Local model", ids: ["openaiCompat"], is: () => false },
];

export interface AiTile<Instance> {
  id: AiTileId;
  label: string;
  instance: Instance;
  /** Every instance that is this AI, best first: the one shown, then the others. */
  candidates: Instance[];
}

/** The grid, in its fixed order, with only the AIs this server can connect. `usable`: whether one can be connected here
 * (a ChatGPT plan sign-in a hosted cloud can't take is passed over for the Codex one). */
export function aiTiles<Instance extends AiTileInstance>(instances: readonly Instance[], ready: (instance: Instance) => boolean,
  usable: (instance: Instance) => boolean = (instance) => !instance.snapshot.authenticationUnavailableReason): AiTile<Instance>[] {
  const tiles: AiTile<Instance>[] = [];
  for (const tile of TILES) {
    const own = instances.filter((instance) => !instance.readOnly);
    const byId = tile.ids.map((id) => own.find((instance) => instance.instanceId === id)).filter(Boolean) as Instance[];
    const byKind = own.filter((instance) => tile.is(instance) && !byId.includes(instance));
    const candidates = [...byId, ...byKind];
    // a signed-in one stands for the tile, else the first that can connect here, else the first of its kind
    const instance = candidates.find(ready) ?? candidates.find(usable) ?? candidates[0];
    if (instance) tiles.push({ id: tile.id, label: tile.label, instance, candidates: [instance, ...candidates.filter((other) => other !== instance)] });
  }
  return tiles;
}

/** What people call this AI: the grid's name for it ("ChatGPT", not "ChatGPT plan"), else its own. */
export function aiName(instance: AiTileInstance & { displayName: string }): string {
  const tile = TILES.find((one) => one.ids.includes(instance.instanceId) || one.is(instance));
  return tile && tile.id !== "local" ? tile.label : instance.displayName;
}

/** Connected here and more than the free backup, which the grid never counts as a person's own AI. */
export function aiConnected<Instance extends AiTileInstance>(instance: Instance, ready: (instance: Instance) => boolean): boolean {
  return ready(instance) && !freeFallback(instance);
}

/** The ready free model, if there is one: a way to start now and connect a better AI later. */
export function freeModel<Instance extends AiTileInstance>(instances: readonly Instance[], ready: (instance: Instance) => boolean): Instance | undefined {
  return instances.find((instance) => ready(instance) && freeFallback(instance));
}
