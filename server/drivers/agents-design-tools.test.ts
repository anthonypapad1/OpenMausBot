import { describe, expect, it, vi } from "vitest";

import { isReadOnlyAgentTool } from "../agent-tool-policy.ts";
import { callTool, type ToolCallContext } from "./agents-call.ts";
import { availableTools } from "./agents-catalog.ts";
import { catalogProfileFromEnv } from "./agents-catalog-profile.ts";
import { DESIGN_TOOL_NAMES } from "./agents-design-tools.ts";

const context = (answer: { ok: boolean; body: Record<string, unknown> }) => ({ client: { apiResponse: vi.fn(async () => answer) } }) as unknown as ToolCallContext;
const listed = (env: Record<string, string>) => availableTools(catalogProfileFromEnv({ OMB_BOT_ID: "bot", ...env })).map((tool) => tool.name);

describe("the design tools", () => {
  it("are listed to every bot, image provider or not, and leave with the bot's Images switch", () => {
    const envs: Array<Record<string, string>> = [{}, { OMB_CHIEF_OF_STAFF: "1" }, { OMB_ROOM_TURN: "1" }, { OMB_TOOLS_OFF: "meetings,data,pages,email" }];
    for (const env of envs) {
      expect(listed(env)).toEqual(expect.arrayContaining([...DESIGN_TOOL_NAMES]));
    }
    expect(listed({ OMB_TOOLS_OFF: "images" }).filter((name) => DESIGN_TOOL_NAMES.has(name))).toEqual([]);
  });

  it("mark only the listing read-only", () => {
    expect([...DESIGN_TOOL_NAMES].filter(isReadOnlyAgentTool)).toEqual(["design_templates_list"]);
  });

  it("post to the tool's own internal route and hand back the preview as an image beside the text", async () => {
    const asked = context({ ok: true, body: { text: '{"path":"/w/marketing/a.png"}', preview: { mime: "image/jpeg", data: "AAAA" } } });
    await expect(callTool("design_render", { template: "sample-card", format: "square" }, asked)).resolves.toEqual({
      text: '{"path":"/w/marketing/a.png"}',
      passthrough: { content: [{ type: "text", text: '{"path":"/w/marketing/a.png"}' }, { type: "image", data: "AAAA", mimeType: "image/jpeg" }] },
    });
    expect(asked.client.apiResponse).toHaveBeenCalledWith("/api/internal/design/design_render", { method: "POST", body: JSON.stringify({ template: "sample-card", format: "square" }) });
    const refused = context({ ok: false, body: { error: "design_render was not run: sample-card needs address." } });
    await expect(callTool("design_render", {}, refused)).resolves.toEqual({ text: "design_render was not run: sample-card needs address.", isError: true });
  });
});
