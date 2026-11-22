// @vitest-environment happy-dom
import { createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { initialState, type AppState, type Bot } from "./state/store";

let state: AppState;
vi.mock("./state/store", async (original) => ({
  ...await original<typeof import("./state/store")>(),
  StoreProvider: ({ children }: { children: ReactNode }) => children,
  useStore: () => ({ state, dispatch: () => {}, flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {} }),
}));
vi.mock("./lib/analytics", () => ({ initAnalytics: () => {}, track: () => {}, emailGateDone: () => true }));
const { default: App } = await import("./App");

afterEach(() => { vi.unstubAllGlobals(); });

const bot = { id: "deal", threadId: "main", name: "Deal Desk", title: "", description: "", color: "green", tasks: [], messages: [],
  modelSelection: { instanceId: "claude", model: "claude-sonnet-5" } } as unknown as Bot;
const instances = [{ instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", models: { default: "claude-sonnet-5", options: [] }, snapshot: { state: "available", authenticated: true } }] as unknown as AppState["instances"];

function draw(): string {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    flushSync(() => root.render(createElement(App)));
    return [container.querySelector("[data-today-view]") ? "today" : "", container.querySelector("[data-chathead-identity]") ? "chat" : ""].filter(Boolean).join(",");
  } finally {
    root.unmount();
    container.remove();
  }
}

it("lands on Today once the app has loaded, and shows the bot's chat once one is opened", () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  state = { ...initialState, connected: true, hydrated: true, bots: [bot], selectedId: bot.id, instances };
  expect(draw()).toBe("today");
  state = { ...state, activeView: "chat" };
  expect(draw()).toBe("chat");
});

it("keeps the loading screen until the app has loaded", () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  state = { ...initialState, connected: true, instances };
  expect(draw()).toBe("");
});
