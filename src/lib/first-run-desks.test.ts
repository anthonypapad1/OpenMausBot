import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotCreationDraft } from "./bot-creation-draft";

const f = vi.hoisted(() => ({ drafts: [] as BotCreationDraft[], fail: null as unknown, announced: [] as Array<{ id: string; options: unknown }> }));
vi.mock("./create-configured-bot", () => ({
  createConfiguredBot: vi.fn(async (draft: BotCreationDraft) => {
    if (f.fail && f.drafts.length === 1) throw f.fail;
    f.drafts.push(draft);
    return { bot: { id: `bot-${f.drafts.length}`, name: draft.bot.name }, warnings: [] };
  }),
}));
vi.mock("./new-bot", async (original) => ({
  ...(await original<typeof import("./new-bot")>()),
  announceNewBot: (_dispatch: unknown, bot: { id: string }, _warnings: unknown, options: unknown) => { f.announced.push({ id: bot.id, options }); },
}));
const { createFirstRunDesks } = await import("./first-run-desks");
const { COMMERCIAL_DESKS, MY_MOVE_DESK } = await import("./desks/path-desks");

const defaults = {
  defaults: { profile: { modelSelection: { instanceId: "", model: "" }, approvalMode: "auto", computer: "local" }, memory: { "MEMORY.md": "- Mine" }, skills: [], routines: [] },
  modelSelection: { instanceId: "claude", model: "opus" },
  suggestedName: "Bot",
};
const request = vi.fn(async (path: string) => (path === "/api/bot-defaults" ? structuredClone(defaults) : {})) as never;

beforeEach(() => {
  f.drafts = [];
  f.fail = null;
  f.announced = [];
});

describe("the first run's Desks", () => {
  it("makes each Desk from the New bot defaults, on Ask, without leaving the chat", async () => {
    const dispatch = vi.fn();
    expect(await createFirstRunDesks(COMMERCIAL_DESKS, [{ name: "Corso" }], dispatch, request)).toEqual(["bot-1", "bot-2", "bot-3", "bot-4"]);
    expect(f.drafts.map((draft) => draft.bot.name)).toEqual(["Deal Desk", "Lease Desk", "Marketing Desk", "Inbox Desk"]);
    const lease = f.drafts[1]!;
    expect(lease.bot.soul).toBe(COMMERCIAL_DESKS[1]!.soul);
    expect(lease.bot.approvalMode, "auto here needs the person's own OK").toBe("ask");
    expect(lease.bot.modelSelection).toEqual({ instanceId: "claude", model: "opus" });
    expect(lease.template.skills.map((skill) => skill.name)).toEqual(["lease-abstract", "deal-emails"]);
    expect(lease.template.memory["MEMORY.md"]).toContain("- Mine");
    expect(f.announced[0]!.options).toMatchObject({ preserveSelection: true, source: "template", role: "commercial-deal-desk" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("holds Corso's count of the person's bots until the last Desk is made", async () => {
    const { botCountSettled } = await import("./default-bot");
    let settled = false;
    const making = createFirstRunDesks(COMMERCIAL_DESKS, [], vi.fn(), request);
    void botCountSettled().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await making;
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(f.drafts).toHaveLength(4);
  });

  it("leaves a Desk the person already has", async () => {
    await createFirstRunDesks(COMMERCIAL_DESKS, [{ name: "deal desk" }, { name: "Inbox Desk" }], vi.fn(), request);
    expect(f.drafts.map((draft) => draft.bot.name)).toEqual(["Lease Desk", "Marketing Desk"]);
    expect(await createFirstRunDesks([MY_MOVE_DESK], [{ name: "My Move Desk" }], vi.fn(), request)).toEqual([]);
  });

  it("stops quietly at the plan's bot limit, and says so on any other failure", async () => {
    const dispatch = vi.fn();
    const { BOT_LIMIT_CODE } = await import("../../shared/bot-limit");
    f.fail = { body: { code: BOT_LIMIT_CODE } };
    expect(await createFirstRunDesks(COMMERCIAL_DESKS, [], dispatch, request)).toEqual(["bot-1"]);
    expect(dispatch).not.toHaveBeenCalled();
    f.drafts = [];
    f.fail = new Error("no AI");
    expect(await createFirstRunDesks(COMMERCIAL_DESKS, [], dispatch, request)).toEqual(["bot-1"]);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "error", message: expect.stringContaining("no AI") });
  });
});
