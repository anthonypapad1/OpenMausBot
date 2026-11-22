// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DealTodayView } from "../../shared/deals";
import { api } from "./api";
import { currentDealsToday, DEALS_TODAY_POLL_MS, noteDealsTurnEvent, refreshDealsToday, setDealsToday, useDealsTodayLoader } from "./deals-today";

vi.mock("./api", () => ({ api: vi.fn() }));

const day = (today: string): DealTodayView => ({ today, timeZone: "America/Denver", needsYou: [], comingUp: [], recentActivity: [] });
const flush = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };

let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setDealsToday(null);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(api).mockReset();
});

it("reads the day as a background request, so a poll never wakes a sleeping Cloud home", async () => {
  vi.mocked(api).mockResolvedValue(day("2026-11-20"));
  await refreshDealsToday();
  expect(api).toHaveBeenCalledWith("/api/deals/today", { background: true });
  expect(currentDealsToday()).toEqual({ view: day("2026-11-20"), failed: false });
});

it("shares a read already on its way instead of sending a second", async () => {
  let answer!: (view: DealTodayView) => void;
  vi.mocked(api).mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  const first = refreshDealsToday();
  const second = refreshDealsToday();
  answer(day("2026-11-20"));
  await Promise.all([first, second]);
  expect(api).toHaveBeenCalledTimes(1);
});

it("keeps the last day it showed when a read fails, and says so", async () => {
  setDealsToday(day("2026-11-19"));
  vi.mocked(api).mockRejectedValue(new Error("offline"));
  await refreshDealsToday();
  expect(currentDealsToday()).toEqual({ view: day("2026-11-19"), failed: true });
  vi.mocked(api).mockResolvedValue(day("2026-11-20"));
  await refreshDealsToday();
  expect(currentDealsToday()).toEqual({ view: day("2026-11-20"), failed: false });
});

it("ignores an answer that isn't a day", async () => {
  setDealsToday(day("2026-11-19"));
  vi.mocked(api).mockResolvedValue({ error: "nope" });
  await refreshDealsToday();
  expect(currentDealsToday().view).toEqual(day("2026-11-19"));
});

it("reads on mount, every minute and when the window gets focus, and stops when it unmounts", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.mocked(api).mockResolvedValue(day("2026-11-20"));
  function Probe({ enabled }: { enabled: boolean }) {
    useDealsTodayLoader(enabled, false);
    return null;
  }
  const host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root!.render(createElement(Probe, { enabled: false })));
  expect(api).not.toHaveBeenCalled();
  await act(async () => root!.render(createElement(Probe, { enabled: true })));
  await flush();
  expect(api).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(DEALS_TODAY_POLL_MS); await flush(); });
  expect(api).toHaveBeenCalledTimes(2);
  await act(async () => { window.dispatchEvent(new Event("focus")); await flush(); });
  expect(api).toHaveBeenCalledTimes(3);
  await act(async () => root!.unmount());
  root = null;
  await act(async () => { vi.advanceTimersByTime(DEALS_TODAY_POLL_MS * 3); window.dispatchEvent(new Event("focus")); await flush(); });
  expect(api).toHaveBeenCalledTimes(3);
  expect(DEALS_TODAY_POLL_MS).toBe(60_000);
});

function Loader({ enabled = true, todayShown = false }: { enabled?: boolean; todayShown?: boolean }) {
  useDealsTodayLoader(enabled, todayShown);
  return null;
}
async function mount(props: { enabled?: boolean; todayShown?: boolean }) {
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Loader, props)));
  await flush();
}

it("reads the day again each time the Today page comes into view, not while it stays in view", async () => {
  vi.mocked(api).mockResolvedValue(day("2026-11-20"));
  await mount({ todayShown: false });
  expect(api).toHaveBeenCalledTimes(1);
  await mount({ todayShown: true });
  expect(api).toHaveBeenCalledTimes(2);
  await mount({ todayShown: true });
  expect(api).toHaveBeenCalledTimes(2);
  await mount({ todayShown: false });
  await mount({ todayShown: true });
  expect(api).toHaveBeenCalledTimes(3);
});

it("reads once when the app opens on the Today page, and not again as it gets ready", async () => {
  vi.mocked(api).mockResolvedValue(day("2026-11-20"));
  await mount({ enabled: false, todayShown: true });
  expect(api).not.toHaveBeenCalled();
  await mount({ enabled: true, todayShown: true });
  expect(api).toHaveBeenCalledTimes(1);
});

it("reads the day again when a bot's turn ends, and only while the app keeps the day", async () => {
  vi.mocked(api).mockResolvedValue(day("2026-11-20"));
  noteDealsTurnEvent({ type: "turn.completed" });
  await flush();
  expect(api).not.toHaveBeenCalled();
  await mount({});
  expect(api).toHaveBeenCalledTimes(1);
  noteDealsTurnEvent({ type: "turn.progress" });
  noteDealsTurnEvent({ type: "content.delta" });
  await flush();
  expect(api).toHaveBeenCalledTimes(1);
  for (const type of ["turn.completed", "cap.exhausted", "session.exited"] as const) {
    noteDealsTurnEvent({ type });
    await flush();
  }
  expect(api).toHaveBeenCalledTimes(4);
});

it("sends one more read after one already on its way when a turn ends, so the count shows what the turn saved", async () => {
  const answers: ((view: DealTodayView) => void)[] = [];
  vi.mocked(api).mockImplementation(() => new Promise((resolve) => { answers.push(resolve as (view: DealTodayView) => void); }));
  await mount({});
  expect(api).toHaveBeenCalledTimes(1);
  noteDealsTurnEvent({ type: "turn.completed" });
  noteDealsTurnEvent({ type: "turn.completed" });
  await flush();
  expect(api).toHaveBeenCalledTimes(1);
  answers[0]!(day("2026-11-19"));
  await flush();
  expect(api).toHaveBeenCalledTimes(2);
  const fresh = { ...day("2026-11-20"), needsYou: [{ type: "document", dealId: "d1", address: "622 W Pine St", document: { id: "doc", dealId: "d1", name: "Disclosure", status: "needs_signature", required: true, updatedAt: 0 } }] } as DealTodayView;
  answers[1]!(fresh);
  await flush();
  expect(currentDealsToday().view?.needsYou).toHaveLength(1);
});
