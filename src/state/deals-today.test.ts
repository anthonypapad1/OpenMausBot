// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DealTodayView } from "../../shared/deals";
import { api } from "./api";
import { currentDealsToday, DEALS_TODAY_POLL_MS, refreshDealsToday, setDealsToday, useDealsTodayLoader } from "./deals-today";

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
    useDealsTodayLoader(enabled);
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
