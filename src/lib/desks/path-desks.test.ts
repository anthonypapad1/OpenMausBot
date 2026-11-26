import { describe, expect, it } from "vitest";

import { DESK_BOTS, requiredDocs } from "./desks";
import { COMMERCIAL_DESKS, firstRunMakesDesks, MY_MOVE_DESK, officeComplianceDesk, pathDesks, PROPERTY_DESKS } from "./path-desks";
import { EMPTY_INTAKE, WORK_PATHS, type WorkPath } from "@/lib/corso-intake";
import { READY_BOTS, readyBotTemplate, type ReadyBot } from "@/lib/ready-bots";
import { parseSkillMd } from "../../../shared/skill-md";
import type { NewBotDefaults } from "../../../shared/new-bot-defaults";
import { newBotDefaultsSchema } from "../../../server/new-bot-defaults";

const DEAL_TOOLS = ["deals_list", "deal_get", "deal_save", "deal_deadline_save", "deal_document_save", "deal_party_save", "deal_activity_add"];
/** The deal-list tools' argument names and values (shared/deals.ts, server/deals/inputs.ts), as desks.test.ts lists them. */
const DEAL_WORDS = [
  "deal_id", "deadline_id", "document_id", "party_id", "address", "side", "price", "status", "contract_date", "closing_date",
  "transaction_url", "transaction_id", "notes", "clear", "label", "due_date", "due_time", "kind", "name", "required", "role",
  "email", "phone", "summary", "notes_append",
  "buyer", "seller", "both", "pre_contract", "under_contract", "closed", "cancelled", "open", "all", "done", "waived",
  "missing", "received", "signed", "needs_signature", "lender", "title", "listing_agent", "buyer_agent", "other",
  "inspection_objection", "inspection_resolution", "appraisal", "loan", "earnest_money", "closing",
];
/** Those, the deadline kinds these Desks add (the tools keep any snake_case kind), and the tools they name. */
const ALLOWED = new Set([
  ...DEAL_TOOLS, ...DEAL_WORDS, "association", "disclosure", "inspection", "insurance", "possession",
  "due_diligence", "survey", "estoppel",
  "escalation", "renewal_notice", "termination_option", "lease_expiration", "rent_commencement",
  "design_templates_list", "design_render", "request_sign_in", "fill_login",
]);

const path = (one: WorkPath) => ({ ...EMPTY_INTAKE, path: one });
const NEW_DESKS: ReadyBot[] = [...COMMERCIAL_DESKS, ...PROPERTY_DESKS, MY_MOVE_DESK, officeComplianceDesk()];
const skillName = (text: string) => {
  const parsed = parseSkillMd(text);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.name;
};
const everything = (bot: ReadyBot) => [bot.soul, ...(bot.skills ?? []), ...Object.values(bot.notes ?? {})].join("\n");
const defaults = (): NewBotDefaults => ({
  profile: { name: "Suggested", modelSelection: { instanceId: "claude", model: "opus" }, approvalMode: "ask" },
  memory: {}, skills: [], routines: [],
});

describe("the Desks each first-run path gets", () => {
  it("picks a Desk set per path", () => {
    const names = Object.fromEntries(WORK_PATHS.map((one) => [one, pathDesks(path(one)).map((bot) => bot.name)]));
    expect(names).toEqual({
      residential: ["Deal Desk", "Listing Desk", "Inbox Desk", "Compliance Desk", "Marketing Desk"],
      commercial: ["Deal Desk", "Lease Desk", "Marketing Desk", "Inbox Desk"],
      property: ["Lease Desk", "Maintenance Desk", "Owner Desk", "Inbox Desk"],
      consumer: ["My Move Desk"],
      brokerage: ["Office Compliance Desk", "Inbox Desk", "Deal Desk", "Listing Desk", "Marketing Desk"],
    });
  });

  it("makes every picked path's Desks, residential's five included, and none when the question was skipped", () => {
    expect(pathDesks(EMPTY_INTAKE)).toBe(DESK_BOTS);
    expect(pathDesks(path("residential"))).toBe(DESK_BOTS);
    expect(firstRunMakesDesks(EMPTY_INTAKE)).toBe(false);
    for (const one of WORK_PATHS) expect(firstRunMakesDesks(path(one)), one).toBe(true);
  });

  it("gives the brokerage the residential Desks themselves", () => {
    const brokerage = pathDesks(path("brokerage"));
    for (const id of ["inbox-desk", "deal-desk", "listing-desk", "marketing-desk"]) expect(brokerage).toContain(DESK_BOTS.find((bot) => bot.id === id));
  });

  it("stay out of the gallery, so its real estate Desks are unchanged", () => {
    for (const bot of NEW_DESKS) expect(READY_BOTS.map((ready) => ready.id)).not.toContain(bot.id);
    expect(new Set(NEW_DESKS.map((bot) => bot.id)).size).toBe(NEW_DESKS.length);
  });

  it("are named <Thing> Desk, never a transaction coordinator", () => {
    for (const bot of NEW_DESKS) {
      expect(bot.name, bot.id).toMatch(/^[A-Z][\w ]* Desk$/);
      expect(`${bot.name} ${bot.title} ${bot.description}`).not.toMatch(/transaction coordinator/i);
    }
  });

  it("share every Desk's rules: ask first, log, logins through the Vault, and never name their tools", () => {
    for (const bot of NEW_DESKS) {
      expect(bot.soul, bot.id).toContain("Always ask before you send an email, sign anything, or change anything in an outside system");
      expect(bot.soul).toContain("deal_activity_add");
      expect(bot.soul).toContain("use fill_login if the person saved one in Settings → Vault; otherwise call request_sign_in");
      expect(bot.soul).toContain("Never ask for a password or code in chat.");
      expect(bot.soul).toMatch(/Talk about what you did, not how: never name your tools or internal steps to /);
    }
    for (const bot of PROPERTY_DESKS) expect(bot.soul).toContain("AppFolio, Buildium, Rent Manager");
  });

  it("each bring valid skills, and only name skills they have", () => {
    for (const bot of NEW_DESKS) {
      const names = (bot.skills ?? []).map(skillName);
      expect(names.length, bot.id).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
      const named = [...everything(bot).matchAll(/`?([a-z]+(?:-[a-z]+)+)`? skill\b/g)].map((match) => match[1]);
      for (const name of named) expect(names, `${bot.id} names ${name}`).toContain(name);
    }
  });

  it("call only the deal-list tools, by their own argument names and values", () => {
    for (const bot of NEW_DESKS) {
      for (const [, word] of everything(bot).matchAll(/`([a-z_]+)`/g)) expect(ALLOWED.has(word!), `${bot.id} uses \`${word}\``).toBe(true);
      const tools = (everything(bot).match(/\bdeals?_[a-z_]+\b/g) ?? []).filter((word) => !DEAL_WORDS.includes(word));
      for (const tool of tools) expect(DEAL_TOOLS, `${bot.id} calls ${tool}`).toContain(tool);
    }
    for (const kind of ALLOWED) expect(kind).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it("make templates the server accepts, their routines paused", () => {
    for (const bot of NEW_DESKS) {
      const template = readyBotTemplate(defaults(), bot);
      expect(newBotDefaultsSchema.safeParse(template).success, bot.id).toBe(true);
      expect(template.skills.map((skill) => skill.name)).toEqual((bot.skills ?? []).map(skillName));
      for (const routine of template.routines) expect(routine.enabled).toBe(false);
    }
  });

  it("keep My Move Desk to explaining and preparing: no legal advice, never their agent", () => {
    expect(MY_MOVE_DESK.soul).toContain("Never give legal advice, and never act as their agent");
    expect(MY_MOVE_DESK.soul).toContain("point them back to their agent or attorney");
    const skill = MY_MOVE_DESK.skills![0]!;
    for (const part of ["Their contract, in plain English", "Their deadlines", "Their checklist", "Questions for their agent or lender", "The move"]) expect(skill).toContain(part);
    expect(skill).toContain("You are not their agent, their attorney or their lender");
  });

  it("seed Office Compliance Desk with the brokerage's own checklist, else the Colorado default", () => {
    const own = pathDesks({ ...path("brokerage"), checklist: "  - Listing agreement\n- Wire fraud advisory  " })[0]!;
    expect(own.id).toBe("office-compliance-desk");
    expect(own.notes!["memory/required-docs.md"]).toMatch(/^---\ntitle: Required documents\n/);
    expect(own.notes!["memory/required-docs.md"]).toContain("- Listing agreement\n- Wire fraud advisory\n");
    expect(pathDesks(path("brokerage"))[0]!.notes!["memory/required-docs.md"]).toBe(requiredDocs);
    expect(own.notes!["memory/office.md"]).toContain("E&O renewal date:");
  });
});
