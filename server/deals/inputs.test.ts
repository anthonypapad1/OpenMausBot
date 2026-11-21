import { describe, expect, it } from "vitest";

import { DEAL_TOOL_DEFINITIONS } from "../drivers/agents-deal-tools.ts";
import { DEAL_TOOL_INPUTS, inputProblem, isCalendarDate, type DealToolName } from "./inputs.ts";

const ID = "deal-0123456789ab";
const problem = (tool: DealToolName, input: unknown) => {
  const parsed = DEAL_TOOL_INPUTS[tool].safeParse(input);
  return parsed.success ? null : inputProblem(tool, parsed.error);
};

describe("deal tool inputs", () => {
  it("name the same fields the tools/list schemas offer, so a field a bot is shown is never refused as unknown", () => {
    for (const tool of DEAL_TOOL_DEFINITIONS) {
      const shape = DEAL_TOOL_INPUTS[tool.name as DealToolName].shape;
      expect(Object.keys(tool.inputSchema.properties).sort(), tool.name).toEqual(Object.keys(shape).sort());
    }
    expect(DEAL_TOOL_DEFINITIONS.map((tool) => tool.name).sort()).toEqual(Object.keys(DEAL_TOOL_INPUTS).sort());
  });

  it("read a null or blank optional field as left out, as strict engines fill every field", () => {
    expect(DEAL_TOOL_INPUTS.deal_save.parse({ deal_id: ID, address: "  ", price: null, side: "", notes: "", clear: null })).toEqual({ deal_id: ID });
    expect(DEAL_TOOL_INPUTS.deals_list.parse({ status: null })).toEqual({});
    expect(DEAL_TOOL_INPUTS.deal_party_save.parse({ deal_id: ID, email: "", phone: " 303-555-0142 " })).toEqual({ deal_id: ID, phone: "303-555-0142" });
  });

  it("take a price as the contract writes it, in whole dollars", () => {
    expect(DEAL_TOOL_INPUTS.deal_save.parse({ price: "$450,000" }).price).toBe(450_000);
    expect(DEAL_TOOL_INPUTS.deal_save.parse({ price: 450_000.4 }).price).toBe(450_000);
    expect(problem("deal_save", { price: -1 })).toMatch(/^deal_save was not run: price /);
    expect(problem("deal_save", { price: "about 400k" })).toMatch(/price/);
  });

  it("refuse impossible dates and times, unknown enums, unknown fields and multi-line summaries, naming the field", () => {
    expect(problem("deal_deadline_save", { deal_id: ID, due_date: "2026-02-29" })).toBe("deal_deadline_save was not run: due_date must be a real date written YYYY-MM-DD.");
    expect(problem("deal_deadline_save", { deal_id: ID, due_date: "03/08/2026" })).toMatch(/due_date must be a real date/);
    expect(problem("deal_deadline_save", { deal_id: ID, due_time: "5pm" })).toMatch(/due_time must be a 24-hour time/);
    expect(problem("deal_deadline_save", { deal_id: ID, kind: "Inspection Objection" })).toMatch(/kind must be lowercase words/);
    expect(problem("deal_save", { side: "landlord" })).toBe('deal_save was not run: side must be one of "buyer"|"seller"|"both".');
    expect(problem("deal_save", { address: "x", city: "Boulder" })).toBe('deal_save was not run: it does not take "city".');
    expect(problem("deal_save", { clear: ["address"] })).toMatch(/clear\.0/);
    expect(problem("deal_deadline_save", { deal_id: ID, clear: ["label"] })).toMatch(/clear\.0/);
    expect(problem("deal_deadline_save", { deal_id: ID, clear: ["due_time"] })).toBeNull();
    expect(problem("deal_save", { notes_append: "x".repeat(2001) })).toMatch(/notes_append/);
    expect(problem("deal_activity_add", { deal_id: ID, summary: "one\ntwo" })).toMatch(/summary must be one line/);
    expect(problem("deal_activity_add", { deal_id: ID })).toBe("deal_activity_add was not run: summary is needed.");
    expect(problem("deal_get", {})).toBe("deal_get was not run: deal_id is needed.");
    expect(problem("deal_get", { deal_id: "1847 Larkspur" })).toMatch(/deal_id must be an id from deals_list/);
  });

  it("keep transaction links to http(s) and emails to addresses", () => {
    expect(problem("deal_save", { transaction_url: "https://example.com/ctm/1001" })).toBeNull();
    expect(problem("deal_save", { transaction_url: "javascript:alert(1)" })).toMatch(/transaction_url must be a full link/);
    expect(problem("deal_save", { transaction_url: "ctm 1001" })).toMatch(/transaction_url/);
    expect(problem("deal_party_save", { deal_id: ID, email: "jordan at example" })).toMatch(/email must be an email address/);
  });

  it("know a calendar date", () => {
    expect(["2028-02-29", "2026-12-31", "2026-01-01"].map(isCalendarDate)).toEqual([true, true, true]);
    expect(["2026-02-29", "2026-13-01", "2026-04-31", "2026-4-1", ""].map(isCalendarDate)).toEqual([false, false, false, false, false]);
  });
});
