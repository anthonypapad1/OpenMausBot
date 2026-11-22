// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import type { DealTodayView } from "../../../shared/deals";
import { TodayPage, type TodayPageProps } from "./TodayView";

const MORNING = Date.UTC(2026, 10, 20, 15, 0);
const LARKSPUR = "1847 Larkspur Ln, Boulder, CO 80304", RIDGE = "3310 Ridge View Dr, Colorado Springs, CO 80904";
const deadline = (id: string, label: string, dueDate: string, dueTime: string | null = null) =>
  ({ id, dealId: "d1", label, dueDate, dueTime, status: "open" as const, kind: "other", updatedAt: 0 });
const busy: DealTodayView = {
  today: "2026-11-20",
  timeZone: "America/Denver",
  needsYou: [
    { type: "document", dealId: "d1", address: LARKSPUR, document: { id: "doc", dealId: "d1", name: "Lead-based paint disclosure", status: "needs_signature", required: true, updatedAt: 0 } },
    { type: "deadline", dealId: "d1", address: LARKSPUR, side: "buyer", dealStatus: "under_contract", overdue: true, deadline: deadline("k1", "Inspection objection", "2026-11-19", "17:00") },
  ],
  comingUp: [
    { dealId: "d1", address: LARKSPUR, side: "buyer", dealStatus: "under_contract", daysAway: 3, deadline: deadline("k2", "Closing", "2026-11-23", "10:00") },
    { dealId: "d3", address: RIDGE, side: "seller", dealStatus: "pre_contract", daysAway: 4, deadline: { ...deadline("k3", "Listing photos", "2026-11-24"), dealId: "d3" } },
  ],
  recentActivity: [{ dealId: "d1", address: LARKSPUR, activity: { id: "a1", dealId: "d1", botId: "b1", botName: "Deal Desk", summary: "Read the contract and added its deadlines.", at: MORNING - 12 * 60_000 } }],
};
const calm: DealTodayView = { ...busy, needsYou: [], comingUp: [], recentActivity: [] };
const dealDesk = { id: "deal", name: "Deal Desk", color: "green", threadId: "main" } as unknown as Bot;

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLocale("en");
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function draw(props: Partial<TodayPageProps>) {
  root ??= createRoot(host);
  const all: TodayPageProps = { view: busy, failed: false, bots: [dealDesk], now: MORNING, onOpenBot: vi.fn(), onRetry: vi.fn(), ...props };
  await act(async () => root!.render(createElement(TodayPage, all)));
  return all;
}
const text = (selector: string) => host.querySelector(selector)?.textContent ?? "";

it("greets the person for the time of day where their deals are and counts what needs them", async () => {
  await draw({});
  expect(text("h1")).toBe("Good morning. 2 things need you today.");
  expect(text("header p")).toBe("Friday, November 20");
  await draw({ now: Date.UTC(2026, 10, 20, 21, 0) });
  expect(text("h1")).toBe("Good afternoon. 2 things need you today.");
  await draw({ view: { ...busy, needsYou: busy.needsYou.slice(1) } });
  expect(text("h1")).toBe("Good morning. 1 thing needs you today.");
});

it("says the person is all caught up when nothing needs them, with no Needs you section", async () => {
  await draw({ view: calm });
  expect(text("h1")).toBe("Good morning. You're all caught up.");
  expect(host.querySelector("#today-needs-you")).toBeNull();
  expect(text("#today-coming-up + p")).toBe("Nothing is due in the next 7 days.");
  expect(host.querySelector("[aria-labelledby='today-team']")?.textContent).toContain("What your bots do on your deals shows up here.");
});

it("puts the overdue deadline first, on the urgent tint, and opens Deal Desk's chat from its button", async () => {
  const props = await draw({});
  const cards = [...host.querySelectorAll<HTMLElement>("[data-today-card]")];
  expect(cards.map((card) => card.dataset.todayCard)).toEqual(["deadline:k1", "document:doc"]);
  expect(cards[0]!.dataset.urgent).toBe("true");
  expect(cards[0]!.textContent).toContain("Overdue · Thu, Nov 19, 5:00 PM");
  expect(cards[1]!.dataset.urgent).toBeUndefined();
  const ask = cards[0]!.querySelector("button")!;
  expect(ask.textContent).toBe("Ask Deal Desk");
  await act(async () => ask.click());
  expect(props.onOpenBot).toHaveBeenCalledWith(dealDesk);
});

it("shows no button on a card whose desk isn't one of the person's bots", async () => {
  await draw({});
  expect(host.querySelector("[data-today-card='document:doc'] button")).toBeNull();
  expect(host.querySelector("[data-today-card='document:doc'] [data-desk-avatar]")?.getAttribute("aria-label")).toBe("Compliance Desk");
});

it("lists the week's deadlines with their day and time, and what the team did with who did it and when", async () => {
  await draw({});
  const row = host.querySelector("[data-today-deadline='k2']")!;
  expect(row.querySelector("time")?.textContent).toBe("Mon23");
  expect(row.textContent).toContain("Closing · 10:00 AM");
  expect(row.textContent).toContain("1847 Larkspur Ln");
  expect(row.querySelector("[data-desk-avatar]")?.getAttribute("aria-label")).toBe("Deal Desk");
  expect(host.querySelector("[data-today-deadline='k3'] [data-desk-avatar]")?.getAttribute("aria-label")).toBe("Listing Desk");
  const activity = host.querySelector("[data-today-activity='a1']")!;
  expect(activity.querySelector("[data-desk-avatar]")?.getAttribute("data-desk-avatar")).toBe("DD");
  expect(activity.textContent).toContain("Read the contract and added its deadlines.");
  expect(activity.textContent).toContain("1847 Larkspur Ln · 12 minutes ago");
});

it("holds the greeting while the first read is on its way, and offers a retry when it fails", async () => {
  await draw({ view: null });
  expect(host.querySelector("[data-today-view]")?.getAttribute("data-today-view")).toBe("loading");
  expect(host.querySelector("[role='status']")).toBeNull();
  const props = await draw({ view: null, failed: true });
  expect(text("[role='status'] p")).toMatch(/^Couldn't load today's deals\. Check that \S+ is running and try again\.$/);
  await act(async () => host.querySelector<HTMLButtonElement>("[role='status'] button")!.click());
  expect(props.onRetry).toHaveBeenCalledOnce();
  await draw({ failed: true });
  expect(text("[role='status'] p")).toBe("Couldn't refresh today's deals. This is how they looked last time.");
  expect(host.querySelectorAll("[data-today-card]")).toHaveLength(2);
});
