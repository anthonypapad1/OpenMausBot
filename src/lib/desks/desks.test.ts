import { describe, expect, it } from "vitest";

import { DESK_BOTS } from "./desks";
import { READY_BOT_CATEGORIES, READY_BOTS, readyBot, readyBotTemplate } from "@/lib/ready-bots";
import { parseSkillMd } from "../../../shared/skill-md";
import type { NewBotDefaults } from "../../../shared/new-bot-defaults";
import { newBotDefaultsSchema } from "../../../server/new-bot-defaults";

const DEAL_TOOLS = ["deals_list", "deal_get", "deal_save", "deal_deadline_save", "deal_document_save", "deal_party_save", "deal_activity_add"];

/** The deal-list tools' argument names and values (shared/deals.ts, server/deals/inputs.ts). */
const DEAL_ARGUMENTS = [
  "deal_id", "deadline_id", "document_id", "party_id", "address", "side", "price", "status", "contract_date", "closing_date",
  "transaction_url", "transaction_id", "notes", "clear", "label", "due_date", "due_time", "kind", "name", "required", "role",
  "email", "phone", "summary",
];
const DEAL_VALUES = [
  "buyer", "seller", "both", "pre_contract", "under_contract", "closed", "cancelled", "open", "all", "done", "waived",
  "missing", "received", "signed", "needs_signature", "lender", "title", "listing_agent", "buyer_agent", "other",
  "inspection_objection", "inspection_resolution", "appraisal", "loan", "earnest_money", "closing",
];
/** Deadline kinds the contract skill adds beyond the ones the tools suggest; the tools keep any snake_case kind. */
const MORE_KINDS = ["association", "disclosure", "survey", "inspection", "insurance", "due_diligence", "possession"];

const defaults = (): NewBotDefaults => ({
  profile: { name: "Suggested", modelSelection: { instanceId: "claude", model: "opus" }, approvalMode: "ask" },
  memory: { "MEMORY.md": "- The person's own default note" },
  skills: [],
  routines: [],
});

const skillName = (text: string) => {
  const parsed = parseSkillMd(text);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.name;
};

const everything = (bot: (typeof DESK_BOTS)[number]) => [bot.soul, ...(bot.skills ?? []), ...Object.values(bot.notes ?? {})].join("\n");

describe("Corso's four Desks", () => {
  it("lead the ready-made bots, in their own first category", () => {
    expect(DESK_BOTS.map((bot) => bot.name)).toEqual(["Deal Desk", "Listing Desk", "Inbox Desk", "Compliance Desk"]);
    expect(READY_BOTS.slice(0, 4).map((bot) => bot.id)).toEqual(["deal-desk", "listing-desk", "inbox-desk", "compliance-desk"]);
    expect(READY_BOT_CATEGORIES[0]).toBe("realestate");
    expect(READY_BOTS.filter((bot) => bot.category === "realestate")).toEqual(DESK_BOTS);
  });

  it("are never called a transaction coordinator", () => {
    for (const bot of DESK_BOTS) expect(`${bot.name} ${bot.title} ${bot.description}`).not.toMatch(/transaction coordinator/i);
  });

  it("ask before sending, signing or changing an outside system, and log what they did", () => {
    for (const bot of DESK_BOTS) {
      expect(bot.soul).toContain("Always ask before you send an email, sign anything, or change anything in an outside system");
      expect(bot.soul).toContain("deal_activity_add");
      expect(bot.soul).toMatch(/agent, or for the transaction coordinator/);
    }
  });

  it("each bring valid skills, and only name skills they have", () => {
    for (const bot of DESK_BOTS) {
      const names = (bot.skills ?? []).map(skillName);
      expect(names.length, bot.id).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
      const named = [...everything(bot).matchAll(/`?([a-z]+(?:-[a-z]+)+)`? skill\b/g)].map((match) => match[1]);
      for (const name of named) expect(names, `${bot.id} names ${name}`).toContain(name);
    }
  });

  it("call only the deal-list tools by their contract names", () => {
    for (const bot of DESK_BOTS) {
      const tools = (everything(bot).match(/\bdeals?_[a-z_]+\b/g) ?? []).filter((word) => !DEAL_ARGUMENTS.includes(word));
      for (const tool of tools) expect(DEAL_TOOLS, `${bot.id} calls ${tool}`).toContain(tool);
    }
    const contract = readyBot("deal-desk")!.skills!.find((text) => skillName(text) === "read-purchase-contract")!;
    for (const tool of ["deals_list", "deal_save", "deal_party_save", "deal_deadline_save", "deal_document_save", "deal_activity_add"]) expect(contract).toContain(tool);
  });

  it("use only the deal-list tools' own argument names and values", () => {
    const allowed = new Set([...DEAL_TOOLS, ...DEAL_ARGUMENTS, ...DEAL_VALUES, ...MORE_KINDS, "request_sign_in"]);
    for (const kind of MORE_KINDS) expect(kind).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    for (const bot of DESK_BOTS) {
      for (const [, word] of everything(bot).matchAll(/`([a-z_]+)`/g)) expect(allowed.has(word!), `${bot.id} uses \`${word}\``).toBe(true);
    }
  });

  it("suggest their schedules paused: Deal Desk and Inbox Desk in the morning, Compliance Desk daily", () => {
    const routine = (id: string) => readyBot(id)!.routines![0]!;
    expect(routine("deal-desk")).toMatchObject({ name: "Morning deal check", enabled: false, schedule: { type: "daily", time: "07:30", weekdays: [1, 2, 3, 4, 5] } });
    expect(routine("inbox-desk")).toMatchObject({ name: "Morning brief", enabled: false, schedule: { type: "daily", time: "07:00" } });
    expect(routine("compliance-desk")).toMatchObject({ name: "Daily compliance check", enabled: false, schedule: { type: "daily", weekdays: [1, 2, 3, 4, 5] } });
    expect(routine("listing-desk")).toMatchObject({ enabled: false, schedule: { type: "daily", weekdays: [1] } });
  });

  it("ask for the apps they work with, and connect none", () => {
    expect(Object.fromEntries(DESK_BOTS.map((bot) => [bot.id, bot.apps]))).toEqual({
      "deal-desk": ["gmail", "googlecalendar", "googledrive"],
      "listing-desk": ["gmail", "googlecalendar"],
      "inbox-desk": ["gmail", "outlook", "googlecalendar"],
      "compliance-desk": ["googledrive", "gmail"],
    });
  });

  it("make templates the server accepts, with their skills switched on beside the person's own", () => {
    for (const bot of DESK_BOTS) {
      const template = readyBotTemplate(defaults(), bot);
      expect(newBotDefaultsSchema.safeParse(template).success, bot.id).toBe(true);
      expect(template.skills.map((skill) => skill.name)).toEqual((bot.skills ?? []).map(skillName));
      for (const skill of template.skills) expect(skill).toMatchObject({ enabled: true, source: `corso:${skill.name}`, warnings: [] });
      expect(template.memory["MEMORY.md"]).toContain("The person's own default note");
      expect(template.profile).toMatchObject({ name: bot.name, approvalMode: "ask", modelSelection: { instanceId: "claude", model: "opus" } });
    }
  });

  it("keep a skill of the same name the person already has", () => {
    const own = { name: "deal-emails", description: "Mine", source: "local:mine", text: "---\nname: deal-emails\ndescription: Mine\n---\n", enabled: false, warnings: [] };
    const template = readyBotTemplate({ ...defaults(), skills: [own] }, readyBot("deal-desk")!);
    expect(template.skills.filter((skill) => skill.name === "deal-emails")).toEqual([own]);
  });

  it("seed Compliance Desk with an editable Colorado checklist that matches its skill's default", () => {
    const compliance = readyBot("compliance-desk")!;
    const note = compliance.notes!["memory/required-docs.md"]!;
    const skill = compliance.skills!.find((text) => skillName(text) === "compliance-checklist")!;
    const rows = [...note.matchAll(/^- (.+) · (required|optional) · (.+)$/gm)];
    expect(rows.length).toBe(17);
    for (const [, name, required, due] of rows) expect(skill).toContain(`| ${name} | ${required === "required" ? "yes" : "no"} | ${due} |`);
    expect(note).toMatch(/^---\ntitle: Required documents\n/);
  });
});
