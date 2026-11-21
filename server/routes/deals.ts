// The shared deal list over HTTP: the app's GET /api/deals routes, and the internal calls behind the deal tools, which
// run inside index.ts's /api/internal/ block after the capability bearer is checked (the bot is the capability's).
// Every write touches only deals.db in the data folder, so, like memory_update, none asks the person first.
import type { ServerResponse } from "node:http";
import type { z } from "zod";

import { DEAL_LIST_FILTERS, type DealListFilter } from "../../shared/deals.ts";
import { DealStoreError, isTimeZone, type DealStore } from "../deals/store.ts";
import { DEAL_ID, DEAL_TOOL_INPUTS, inputProblem, type DealToolName } from "../deals/inputs.ts";
import type { json as sendJson } from "../harness/http.ts";
import { PASS, type RouteHandler } from "./table.ts";

const DEAL_PATH = /^\/api\/deals\/([^/]+)$/;
const TOOL_PATH = /^\/api\/internal\/deals\/([a-z_]+)$/;

const isFilter = (value: string): value is DealListFilter => (DEAL_LIST_FILTERS as readonly string[]).includes(value);
const isTool = (value: string): value is DealToolName => Object.hasOwn(DEAL_TOOL_INPUTS, value);

export function createDealRoutes(deps: { store: DealStore; timeZone(): string }): RouteHandler {
  return async (ctx) => {
    if (ctx.path !== "/api/deals" && !ctx.path.startsWith("/api/deals/")) return PASS;
    if (ctx.method !== "GET") return PASS;
    if (ctx.path === "/api/deals") {
      const status = ctx.url.searchParams.get("status") || "open";
      if (!isFilter(status)) return void ctx.json(ctx.res, 400, { error: `status is one of ${DEAL_LIST_FILTERS.join(", ")}` });
      return void ctx.json(ctx.res, 200, { deals: deps.store.list(status) });
    }
    if (ctx.path === "/api/deals/today") {
      const timeZone = ctx.url.searchParams.get("tz") || deps.timeZone();
      if (!isTimeZone(timeZone)) return void ctx.json(ctx.res, 400, { error: "tz is an IANA time zone, like America/Denver" });
      return void ctx.json(ctx.res, 200, deps.store.today(timeZone));
    }
    const id = DEAL_PATH.exec(ctx.path)?.[1];
    if (!id) return PASS;
    const detail = DEAL_ID.test(id) ? deps.store.get(id) : null;
    if (!detail) return void ctx.json(ctx.res, 404, { error: "deal not found" });
    return void ctx.json(ctx.res, 200, detail);
  };
}

export interface DealToolContext {
  method: string;
  path: string;
  res: ServerResponse;
  json: typeof sendJson;
  botId: string;
  readBody: () => Promise<unknown>;
}

type Bot = { id: string; name: string };
type ToolRun = { [K in DealToolName]: (store: DealStore, input: z.infer<(typeof DEAL_TOOL_INPUTS)[K]>, bot: Bot) => unknown };

const RUN: ToolRun = {
  deals_list: (store, input) => ({ deals: store.list(input.status) }),
  deal_get: (store, input) => {
    const detail = store.get(input.deal_id);
    if (!detail) throw new DealStoreError(404, `There is no deal ${input.deal_id}. Find its id with deals_list.`);
    return detail;
  },
  deal_save: (store, input) => store.saveDeal(input),
  deal_deadline_save: (store, input) => store.saveDeadline(input),
  deal_document_save: (store, input) => store.saveDocument(input),
  deal_party_save: (store, input) => store.saveParty(input),
  deal_activity_add: (store, input, bot) => store.addActivity({ ...input, botId: bot.id, botName: bot.name }),
};

/** Runs one deal tool for `bot`'s turn: `{ text }`, or `{ error }` in words the bot can act on. */
export function runDealTool(store: DealStore, tool: DealToolName, body: unknown, bot: Bot): { status: number; body: { text: string } | { error: string } } {
  const parsed = DEAL_TOOL_INPUTS[tool].safeParse(body ?? {});
  if (!parsed.success) return { status: 400, body: { error: inputProblem(tool, parsed.error) } };
  try {
    // A correlated union: parsed.data is the input of this very tool.
    return { status: 200, body: { text: JSON.stringify(RUN[tool](store, parsed.data as never, bot)) } };
  } catch (error) {
    if (error instanceof DealStoreError) return { status: error.status, body: { error: `${tool} was not run: ${error.message}` } };
    throw error;
  }
}

export function createDealToolRoutes(deps: { store: DealStore; botName(botId: string): string }) {
  return async (ctx: DealToolContext): Promise<typeof PASS | void> => {
    const tool = ctx.method === "POST" ? TOOL_PATH.exec(ctx.path)?.[1] : undefined;
    if (!tool || !isTool(tool)) return PASS;
    const answer = runDealTool(deps.store, tool, await ctx.readBody(), { id: ctx.botId, name: deps.botName(ctx.botId) });
    return void ctx.json(ctx.res, answer.status, answer.body);
  };
}
