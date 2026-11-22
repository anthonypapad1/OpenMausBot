import { describe, expect, it, vi } from "vitest";

import { isReadOnlyAgentTool } from "../agent-tool-policy.ts";
import { callTool, type ToolCallContext } from "./agents-call.ts";
import { availableTools } from "./agents-catalog.ts";
import { catalogProfileFromEnv } from "./agents-catalog-profile.ts";
import { DEAL_TOOL_NAMES } from "./agents-deal-tools.ts";

const context = (answer: { ok: boolean; body: Record<string, unknown> }) => ({ client: { apiResponse: vi.fn(async () => answer) } }) as unknown as ToolCallContext;

describe("the deal tools", () => {
  it("are listed to every bot, Chief or not, in a chat or a room, with every tool group off", () => {
    for (const env of [{}, { OMB_CHIEF_OF_STAFF: "1" }, { OMB_ROOM_TURN: "1" }, { OMB_TEAM_PEOPLE: "1" }, { OMB_TOOLS_OFF: "meetings,data,pages,images,email" }]) {
      const tools = availableTools(catalogProfileFromEnv({ OMB_BOT_ID: "bot", ...env })).map((tool) => tool.name);
      expect(tools).toEqual(expect.arrayContaining([...DEAL_TOOL_NAMES]));
    }
  });

  it("mark only the two reads read-only", () => {
    expect([...DEAL_TOOL_NAMES].filter(isReadOnlyAgentTool)).toEqual(["deals_list", "deal_get"]);
  });

  it("post the call's arguments to the tool's own internal route, and hand back its answer or its refusal as an error", async () => {
    const asked = context({ ok: true, body: { text: '{"id":"deal-0123456789ab"}' } });
    await expect(callTool("deal_save", { address: "1847 Larkspur Ln" }, asked)).resolves.toEqual({ text: '{"id":"deal-0123456789ab"}' });
    expect(asked.client.apiResponse).toHaveBeenCalledWith("/api/internal/deals/deal_save", { method: "POST", body: JSON.stringify({ address: "1847 Larkspur Ln" }) });
    const refused = context({ ok: false, body: { error: "deal_get was not run: deal_id is needed." } });
    await expect(callTool("deal_get", {}, refused)).resolves.toEqual({ text: "deal_get was not run: deal_id is needed.", isError: true });
  });
});
