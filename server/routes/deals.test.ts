import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { openDealStore, type DealStore } from "../deals/store.ts";
import type { RequestAuth } from "../request-auth.ts";
import { callRoute } from "./call-route.ts";
import { createDealRoutes, createDealToolRoutes, dayInWords } from "./deals.ts";
import { PASS } from "./table.ts";

const owner: RequestAuth = { kind: "loopback", scopes: ["admin", "client"] };
const NOON_MARCH_8_DENVER = Date.parse("2026-03-08T19:00:00Z");

let store: DealStore;
afterEach(() => store?.close());

async function tool(name: string, body: unknown, botId = "bot-deal", at = NOON_MARCH_8_DENVER, timeZone = "America/Denver") {
  const routes = createDealToolRoutes({ store, botName: (id) => (id === "bot-deal" ? "Deal Desk" : id), timeZone: () => timeZone, now: () => at });
  let reply: { status: number; body: Record<string, unknown> } | null = null;
  const out = await routes({
    method: "POST", path: `/api/internal/deals/${name}`, res: {} as ServerResponse, botId, readBody: async () => body,
    json: (_res, status, sent) => { reply = { status, body: sent as Record<string, unknown> }; },
  });
  return { out, reply: reply as { status: number; body: Record<string, unknown> } | null };
}

describe("the deal tools' internal calls", () => {
  it("save a deal and its rows, and sign activity with the calling bot, never a name the bot gives", async () => {
    store = openDealStore(":memory:", { now: () => NOON_MARCH_8_DENVER });
    const saved = await tool("deal_save", { address: "1847 Larkspur Ln, Boulder, CO", price: "$875,000", closing_date: "2026-03-20" });
    expect(saved.reply?.status).toBe(200);
    const deal = JSON.parse(String(saved.reply!.body.text));
    expect(deal).toMatchObject({ address: "1847 Larkspur Ln, Boulder, CO", price: 875_000 });
    expect((await tool("deal_deadline_save", { deal_id: deal.id, label: "Appraisal", due_date: "2026-03-10", kind: "appraisal" })).reply?.status).toBe(200);
    expect((await tool("deal_party_save", { deal_id: deal.id, role: "lender", name: "Front Range Lending" })).reply?.status).toBe(200);
    expect((await tool("deal_document_save", { deal_id: deal.id, name: "Disclosure", status: "needs_signature" })).reply?.status).toBe(200);
    expect((await tool("deal_activity_add", { deal_id: deal.id, summary: "Ordered the appraisal." })).reply?.status).toBe(200);

    const read = JSON.parse(String((await tool("deal_get", { deal_id: deal.id })).reply!.body.text));
    expect(read.recentActivity).toEqual([expect.objectContaining({ botId: "bot-deal", botName: "Deal Desk", summary: "Ordered the appraisal." })]);
    expect(read.parties).toHaveLength(1);
    expect(JSON.parse(String((await tool("deals_list", {})).reply!.body.text)).deals).toHaveLength(1);
  });

  it("say every date's weekday and distance from the person's today, so a bot never works one out", async () => {
    store = openDealStore(":memory:", { now: () => NOON_MARCH_8_DENVER });
    const deal = JSON.parse(String((await tool("deal_save", { address: "1248 Magnolia Blvd", contract_date: "2026-03-07", closing_date: "2026-04-03" })).reply!.body.text));
    expect(deal).toMatchObject({ today: "Sunday, March 8, 2026", contractWhen: "Saturday, March 7, 2026 (yesterday)", closingWhen: "Friday, April 3, 2026 (in 26 days)" });
    const due = JSON.parse(String((await tool("deal_deadline_save", { deal_id: deal.id, label: "Inspection objection", due_date: "2026-03-09" })).reply!.body.text));
    expect(due.dueWhen).toBe("Monday, March 9, 2026 (tomorrow)");
    const list = JSON.parse(String((await tool("deals_list", {})).reply!.body.text));
    expect(list.today).toBe("Sunday, March 8, 2026");
    expect(JSON.stringify(list)).toContain("Monday, March 9, 2026 (tomorrow)");
    const read = JSON.parse(String((await tool("deal_get", { deal_id: deal.id })).reply!.body.text));
    expect(read.deal.closingWhen).toBe("Friday, April 3, 2026 (in 26 days)");
    expect(read.deadlines[0]).toMatchObject({ dueDate: "2026-03-09", dueWhen: "Monday, March 9, 2026 (tomorrow)" });
    // 05:30 UTC on the 9th is still the 8th in Denver, but already the 9th in UTC.
    const late = Date.parse("2026-03-09T05:30:00Z");
    expect(JSON.parse(String((await tool("deal_get", { deal_id: deal.id }, "bot-deal", late)).reply!.body.text)).deadlines[0].dueWhen).toBe("Monday, March 9, 2026 (tomorrow)");
    expect(JSON.parse(String((await tool("deal_get", { deal_id: deal.id }, "bot-deal", late, "UTC")).reply!.body.text)).deadlines[0].dueWhen).toBe("Monday, March 9, 2026 (today)");
  });

  it("names weekdays right across months, leap days and the years either side", () => {
    store = openDealStore(":memory:");
    expect(dayInWords("2026-11-23", "2026-11-22")).toBe("Monday, November 23, 2026 (tomorrow)");
    expect(dayInWords("2026-12-18", "2026-11-22")).toBe("Friday, December 18, 2026 (in 26 days)");
    expect(dayInWords("2028-02-29", "2028-02-27")).toBe("Tuesday, February 29, 2028 (in 2 days)");
    expect(dayInWords("2027-01-01", "2026-12-31")).toBe("Friday, January 1, 2027 (tomorrow)");
    expect(dayInWords("2026-11-19", "2026-11-22")).toBe("Thursday, November 19, 2026 (3 days ago)");
    expect(dayInWords("2026-02-30", "2026-02-01")).toBeNull();
    expect(dayInWords("soon", "2026-02-01")).toBeNull();
  });

  it("answer a refused input or a missing deal with an error the bot can act on, and change nothing", async () => {
    store = openDealStore(":memory:");
    expect((await tool("deal_save", { address: "x", side: "landlord" })).reply).toEqual({ status: 400, body: { error: 'deal_save was not run: side must be one of "buyer"|"seller"|"both".' } });
    expect((await tool("deal_get", { deal_id: "deal-000000000000" })).reply).toEqual({ status: 404, body: { error: "deal_get was not run: There is no deal deal-000000000000. Find its id with deals_list." } });
    expect((await tool("deal_save", {})).reply?.body.error).toBe("deal_save was not run: address is needed to add one.");
    expect((await tool("deal_activity_add", { deal_id: "deal-000000000000", summary: "Hi" })).reply?.status).toBe(404);
    expect(store.list("all")).toEqual([]);
  });

  it("pass on any other internal path or method", async () => {
    store = openDealStore(":memory:");
    const routes = createDealToolRoutes({ store, botName: () => "", timeZone: () => "UTC" });
    const call = (method: string, path: string) => routes({ method, path, res: {} as ServerResponse, json: () => {}, botId: "b", readBody: async () => ({}) });
    expect(await call("GET", "/api/internal/deals/deals_list")).toBe(PASS);
    expect(await call("POST", "/api/internal/deals/deal_delete")).toBe(PASS);
    expect(await call("POST", "/api/internal/notifications")).toBe(PASS);
  });
});

describe("GET /api/deals", () => {
  const routes = () => createDealRoutes({ store, timeZone: () => "America/Denver" });
  const get = (path: string) => callRoute(routes(), { method: "GET", path, auth: owner });

  it("lists open deals by default and filters by status", async () => {
    store = openDealStore(":memory:");
    store.saveDeal({ address: "Open" });
    store.saveDeal({ address: "Closed", status: "closed" });
    expect(((await get("/api/deals")).body.deals as Array<{ address: string }>).map((deal) => deal.address)).toEqual(["Open"]);
    expect(((await get("/api/deals?status=all")).body.deals as unknown[])).toHaveLength(2);
    expect(((await get("/api/deals?status=closed")).body.deals as Array<{ address: string }>).map((deal) => deal.address)).toEqual(["Closed"]);
    expect((await get("/api/deals?status=sold")).status).toBe(400);
  });

  it("reads one deal, and answers 404 for an unknown or malformed id", async () => {
    store = openDealStore(":memory:");
    const deal = store.saveDeal({ address: "1847 Larkspur Ln" });
    store.saveParty({ deal_id: deal.id, role: "buyer", name: "Jordan Avery" });
    const read = await get(`/api/deals/${deal.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ deal: { id: deal.id }, parties: [{ name: "Jordan Avery" }], deadlines: [], documents: [], recentActivity: [] });
    expect((await get("/api/deals/deal-000000000000")).status).toBe(404);
    expect((await get("/api/deals/..%2Fsecrets")).status).toBe(404);
  });

  it("answers today in the server's zone, or in a tz the app passes, and refuses a zone Intl does not know", async () => {
    // 2026-03-09 05:30 UTC: still the 8th in Denver.
    store = openDealStore(":memory:", { now: () => Date.parse("2026-03-09T05:30:00Z") });
    const deal = store.saveDeal({ address: "622 W Pine St" });
    store.saveDeadline({ deal_id: deal.id, label: "Title objection", due_date: "2026-03-08" });
    const denver = await get("/api/deals/today");
    expect(denver.body).toMatchObject({ today: "2026-03-08", timeZone: "America/Denver", needsYou: [{ type: "deadline", dealId: deal.id, address: "622 W Pine St", overdue: false }], comingUp: [], recentActivity: [] });
    expect((await get("/api/deals/today?tz=UTC")).body).toMatchObject({ today: "2026-03-09", needsYou: [{ overdue: true }] });
    expect((await get("/api/deals/today?tz=Mars/Olympus")).status).toBe(400);
  });

  it("passes on writes and other paths", async () => {
    store = openDealStore(":memory:");
    expect((await callRoute(routes(), { method: "POST", path: "/api/deals", body: {}, auth: owner })).status).toBe(404);
    expect((await get("/api/dealsx")).status).toBe(404);
    expect((await get("/api/deals/a/b")).status).toBe(404);
  });
});
