import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { seedDemoDeals } from "./demo.ts";
import { dealSaveInput, deadlineSaveInput } from "./inputs.ts";
import { addDays, DealStoreError, localDay, openDealStore, type DealStore } from "./store.ts";

const DENVER = "America/Denver";
/** 2026-03-08 12:00 in Denver (MDT starts at 02:00 that day). */
const NOON_MARCH_8 = Date.parse("2026-03-08T18:00:00Z");

let opened: DealStore[] = [];
const open = (now = () => NOON_MARCH_8) => {
  const store = openDealStore(":memory:", { now });
  opened.push(store);
  return store;
};
afterEach(() => {
  for (const store of opened) store.close();
  opened = [];
});

describe("the deal list's rows", () => {
  it("adds a deal with defaults, then changes only the fields given and empties only the ones named in clear", () => {
    let clock = 1_000;
    const store = open(() => clock);
    const deal = store.saveDeal(dealSaveInput.parse({ address: "1847 Larkspur Ln, Boulder, CO", price: "$875,000", notes: "Relocating" }));
    expect(deal).toMatchObject({ address: "1847 Larkspur Ln, Boulder, CO", side: "buyer", status: "under_contract", price: 875_000, notes: "Relocating", createdAt: 1_000, updatedAt: 1_000 });
    expect(deal.id).toMatch(/^deal-[0-9a-f]{12}$/);
    clock = 2_000;
    // What a strict engine sends when asked only to move the status: every other field null or blank.
    const moved = store.saveDeal(dealSaveInput.parse({ deal_id: deal.id, status: "closed", address: "", price: null, notes: "", clear: [] }));
    expect(moved).toMatchObject({ address: deal.address, price: 875_000, notes: "Relocating", status: "closed", createdAt: 1_000, updatedAt: 2_000 });
    const cleared = store.saveDeal(dealSaveInput.parse({ deal_id: deal.id, clear: ["price", "notes"] }));
    expect(cleared).toMatchObject({ price: null, notes: "", status: "closed" });
  });

  it("refuses an add without its required fields and a change to an id that is not there, in words naming the fix", () => {
    const store = open();
    expect(() => store.saveDeal({})).toThrow(/address is needed/);
    expect(() => store.saveDeal({ deal_id: "deal-000000000000" })).toThrow(DealStoreError);
    const deal = store.saveDeal({ address: "622 W Pine St" });
    const other = store.saveDeal({ address: "3310 Ridge View Dr" });
    expect(() => store.saveDeadline({ deal_id: deal.id, label: "Closing" })).toThrow(/due_date is needed/);
    const deadline = store.saveDeadline({ deal_id: deal.id, label: "Closing", due_date: "2026-04-01" });
    let refusal: unknown;
    try { store.saveDeadline({ deal_id: other.id, deadline_id: deadline.id, status: "done" }); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(DealStoreError);
    expect((refusal as DealStoreError).status).toBe(404);
    expect((refusal as DealStoreError).message).toMatch(/deal_get/);
    expect(store.get(deal.id)!.deadlines[0]!.status).toBe("open");
  });

  it("keeps parties, deadlines, documents and activity under their deal, read back in order", () => {
    let clock = 10;
    const store = open(() => clock++);
    const deal = store.saveDeal({ address: "1847 Larkspur Ln" });
    const buyer = store.saveParty({ deal_id: deal.id, role: "buyer", name: "Jordan Avery", email: "jordan@example.com", phone: "303-555-0142" });
    store.saveParty({ deal_id: deal.id, party_id: buyer.id, clear: ["phone"] });
    store.saveDeadline({ deal_id: deal.id, label: "Closing", due_date: "2026-04-01", due_time: "10:00", kind: "closing" });
    const objection = store.saveDeadline({ deal_id: deal.id, label: "Inspection objection", due_date: "2026-03-10" });
    store.saveDeadline(deadlineSaveInput.parse({ deal_id: deal.id, deadline_id: objection.id, status: "done", due_time: "" }));
    const disclosure = store.saveDocument({ deal_id: deal.id, name: "Lead-based paint disclosure" });
    store.saveDocument({ deal_id: deal.id, document_id: disclosure.id, status: "signed", required: false });
    store.addActivity({ deal_id: deal.id, summary: "Read the contract.", botId: "b1", botName: "Deal Desk" });
    store.addActivity({ deal_id: deal.id, summary: "Flagged the disclosure.", botId: "b2", botName: "Compliance Desk" });

    const detail = store.get(deal.id)!;
    expect(detail.parties).toEqual([expect.objectContaining({ name: "Jordan Avery", email: "jordan@example.com", phone: null })]);
    expect(detail.deadlines.map((row) => [row.label, row.status, row.kind])).toEqual([["Inspection objection", "done", "other"], ["Closing", "open", "closing"]]);
    expect(detail.documents).toEqual([expect.objectContaining({ status: "signed", required: false })]);
    expect(detail.recentActivity.map((row) => row.botName)).toEqual(["Compliance Desk", "Deal Desk"]);
    expect(detail.deal.updatedAt).toBe(detail.recentActivity[0]!.at);
    expect(store.get("deal-000000000000")).toBeNull();
  });

  it("lists open deals by default, soonest closing first, each with its next open deadline", () => {
    const store = open();
    const later = store.saveDeal({ address: "Later", closing_date: "2026-05-01" });
    const sooner = store.saveDeal({ address: "Sooner", closing_date: "2026-04-01" });
    const undated = store.saveDeal({ address: "Undated", status: "pre_contract" });
    store.saveDeal({ address: "Done", status: "closed" });
    store.saveDeadline({ deal_id: sooner.id, label: "Met", due_date: "2026-03-01", status: "done" });
    store.saveDeadline({ deal_id: sooner.id, label: "Appraisal", due_date: "2026-03-12" });
    store.saveDeadline({ deal_id: sooner.id, label: "Loan", due_date: "2026-03-20" });
    expect(store.list().map((deal) => deal.address)).toEqual(["Sooner", "Later", "Undated"]);
    expect(store.list()[0]!.nextDeadline?.label).toBe("Appraisal");
    expect(store.list()[1]!.nextDeadline).toBeNull();
    expect(store.list("all")).toHaveLength(4);
    expect(store.list("closed").map((deal) => deal.address)).toEqual(["Done"]);
    expect(store.list("pre_contract").map((deal) => deal.id)).toEqual([undated.id]);
    expect(later.id).not.toBe(sooner.id);
  });

  it("keeps its rows in deals.db in the data folder, readable only by this account, across a reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-deals-"));
    try {
      const first = openDealStore(dir);
      const deal = first.saveDeal({ address: "1847 Larkspur Ln" });
      first.close();
      expect(existsSync(join(dir, "deals.db"))).toBe(true);
      if (process.platform !== "win32") expect(statSync(join(dir, "deals.db")).mode & 0o777).toBe(0o600);
      const again = openDealStore(dir);
      expect(again.get(deal.id)?.deal.address).toBe("1847 Larkspur Ln");
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the calendar day", () => {
  it("is the day in the given zone, not the server's or UTC's", () => {
    // 2026-03-09 05:30 UTC is still the 8th in Denver and already the 9th in Tokyo.
    const at = Date.parse("2026-03-09T05:30:00Z");
    expect(localDay(at, DENVER)).toBe("2026-03-08");
    expect(localDay(at, "UTC")).toBe("2026-03-09");
    expect(localDay(at, "Asia/Tokyo")).toBe("2026-03-09");
  });

  it("adds whole days across month ends, leap days and daylight-saving changes", () => {
    expect(addDays("2026-03-08", 7)).toBe("2026-03-15");
    expect(addDays("2026-02-25", 7)).toBe("2026-03-04");
    expect(addDays("2028-02-25", 7)).toBe("2028-03-03");
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("today on the deal list", () => {
  it("puts overdue and today's open deadlines, then unsigned documents, in needsYou; the next 7 days in comingUp", () => {
    const store = open();
    const deal = store.saveDeal({ address: "1847 Larkspur Ln", closing_date: "2026-03-20" });
    const add = (label: string, due_date: string, extra: Record<string, string> = {}) => store.saveDeadline({ deal_id: deal.id, label, due_date, ...extra });
    add("Overdue", "2026-03-06");
    add("Today, timed", "2026-03-08", { due_time: "17:00" });
    add("Today, morning", "2026-03-08", { due_time: "09:00" });
    add("Today, untimed", "2026-03-08");
    add("Done today", "2026-03-08", { status: "done" });
    add("Waived overdue", "2026-03-01", { status: "waived" });
    add("Tomorrow", "2026-03-09");
    add("A week out", "2026-03-15");
    add("Eight days out", "2026-03-16");
    store.saveDocument({ deal_id: deal.id, name: "Disclosure", status: "needs_signature" });
    store.saveDocument({ deal_id: deal.id, name: "Contract", status: "signed" });

    const view = store.today(DENVER);
    expect(view.today).toBe("2026-03-08");
    expect(view.timeZone).toBe(DENVER);
    expect(view.needsYou.map((item) => (item.type === "deadline" ? `${item.deadline.label}${item.overdue ? " (overdue)" : ""}` : `doc ${item.document.name}`))).toEqual([
      "Overdue (overdue)", "Today, morning", "Today, timed", "Today, untimed", "doc Disclosure",
    ]);
    expect(view.comingUp.map((item) => [item.deadline.label, item.daysAway])).toEqual([["Tomorrow", 1], ["A week out", 7]]);
    for (const item of [...view.needsYou, ...view.comingUp]) expect(item).toMatchObject({ dealId: deal.id, address: "1847 Larkspur Ln" });
  });

  it("works the day out in the person's zone: late evening in Denver is still today there", () => {
    const store = open();
    const deal = store.saveDeal({ address: "622 W Pine St" });
    store.saveDeadline({ deal_id: deal.id, label: "Title objection", due_date: "2026-03-08" });
    store.saveDeadline({ deal_id: deal.id, label: "Closing", due_date: "2026-03-09" });
    const lateEvening = Date.parse("2026-03-09T05:30:00Z");
    expect(store.today(DENVER, lateEvening).needsYou.map((item) => item.type === "deadline" && item.deadline.label)).toEqual(["Title objection"]);
    expect(store.today(DENVER, lateEvening).comingUp.map((item) => item.deadline.label)).toEqual(["Closing"]);
    const utc = store.today("UTC", lateEvening);
    expect(utc.today).toBe("2026-03-09");
    expect(utc.needsYou.map((item) => item.type === "deadline" && [item.deadline.label, item.overdue])).toEqual([["Title objection", true], ["Closing", false]]);
  });

  it("leaves closed and cancelled deals out of needsYou and comingUp, but keeps their activity", () => {
    const store = open();
    const closed = store.saveDeal({ address: "Closed", status: "closed" });
    const cancelled = store.saveDeal({ address: "Cancelled", status: "cancelled" });
    for (const deal of [closed, cancelled]) {
      store.saveDeadline({ deal_id: deal.id, label: "Forgotten", due_date: "2026-03-07" });
      store.saveDeadline({ deal_id: deal.id, label: "Soon", due_date: "2026-03-10" });
      store.saveDocument({ deal_id: deal.id, name: "Unsigned", status: "needs_signature" });
    }
    store.addActivity({ deal_id: closed.id, summary: "Closed and funded.", botId: "b1", botName: "Deal Desk" });
    const view = store.today(DENVER);
    expect(view.needsYou).toEqual([]);
    expect(view.comingUp).toEqual([]);
    expect(view.recentActivity).toEqual([expect.objectContaining({ dealId: closed.id, address: "Closed", activity: expect.objectContaining({ summary: "Closed and funded." }) })]);
  });

  it("shows the latest 10 activity rows across deals, newest first", () => {
    let clock = 0;
    const store = open(() => ++clock);
    const one = store.saveDeal({ address: "One" });
    const two = store.saveDeal({ address: "Two" });
    for (let i = 1; i <= 12; i++) store.addActivity({ deal_id: i % 2 ? one.id : two.id, summary: `Step ${i}`, botId: "b", botName: "Deal Desk" });
    const rows = store.today(DENVER).recentActivity;
    expect(rows.map((row) => row.activity.summary)).toEqual(Array.from({ length: 10 }, (_, i) => `Step ${12 - i}`));
    expect(rows[0]).toMatchObject({ dealId: two.id, address: "Two" });
  });

  it("gives the demo deals something in every section of the Today page", () => {
    const store = open();
    const ids = seedDemoDeals(store, "2026-03-08");
    expect(ids).toHaveLength(3);
    const view = store.today(DENVER);
    expect(view.needsYou.some((item) => item.type === "deadline" && item.overdue)).toBe(true);
    expect(view.needsYou.some((item) => item.type === "document")).toBe(true);
    expect(view.comingUp.length).toBeGreaterThan(1);
    expect(view.recentActivity).toHaveLength(4);
  });
});
