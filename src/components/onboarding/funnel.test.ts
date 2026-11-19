import { describe, expect, it } from "vitest";
import { aiConnected, aiName, aiTiles, freeModel } from "./funnel";

const ai = (instanceId: string, driverKind: string, ready = false, extra: Record<string, unknown> = {}, access = "subscription") => ({
  instanceId, driverKind, displayName: instanceId, access, snapshot: { state: ready ? "available" : "unavailable", ...extra },
});
const ready = (instance: { snapshot: { state: string } }) => instance.snapshot.state === "available";

describe("the first run's AI grid", () => {
  it("shows only the AIs this server can connect, in its fixed order, by what people call them", () => {
    const tiles = aiTiles([ai("chatgpt", "codex"), ai("claude", "claudeAgent"), ai("antigravity", "antigravityAgent"), ai("openrouter", "openai-compat")], ready);
    expect(tiles.map((tile) => [tile.id, tile.label, tile.instance.instanceId])).toEqual([
      ["claude", "Claude", "claude"], ["chatgpt", "ChatGPT", "chatgpt"], ["gemini", "Gemini", "antigravity"], ["openrouter", "OpenRouter", "openrouter"],
    ]);
    expect(aiName({ instanceId: "chatgpt", driverKind: "codex", displayName: "ChatGPT plan", snapshot: { state: "available" } })).toBe("ChatGPT");
    expect(aiName({ instanceId: "kimi", driverKind: "kimiAgent", displayName: "Kimi", snapshot: { state: "available" } })).toBe("Kimi");
  });

  it("lets a signed-in one stand for its tile, and leaves out an API key or a read-only AI", () => {
    expect(aiTiles([ai("chatgpt", "codex"), ai("codex", "codex", true)], ready)[0]!.instance.instanceId).toBe("codex");
    expect(aiTiles([ai("anthropic", "claudeAgent", true, {}, "api")], ready)).toEqual([]);
    expect(aiTiles([{ ...ai("claude", "claudeAgent", true), readOnly: true }], ready)).toEqual([]);
  });

  it("never counts the free backup as the person's own AI, and offers it only when it is ready", () => {
    const free = ai("opencodeGo", "opencodeGo", true, { freeFallback: true });
    expect(aiConnected(free, ready)).toBe(false);
    expect(aiConnected(ai("claude", "claudeAgent", true), ready)).toBe(true);
    expect(freeModel([free], ready)?.instanceId).toBe("opencodeGo");
    expect(freeModel([ai("opencodeGo", "opencodeGo", false, { freeFallback: true })], ready)).toBeUndefined();
  });
});
