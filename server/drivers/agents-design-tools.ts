// Listing marketing from Corso's own templates: design_templates_list says what there is, design_render fills one in
// and saves a PNG or PDF into marketing/ in the bot's working folder. The internal route (server/routes/design-tools.ts)
// checks each input in full; the template contract is in server/design/templates.ts.
import { DESIGN_FORMAT_NAMES, DESIGN_OUTPUTS, MAX_PHOTOS } from "../design/templates.ts";
import type { ToolCallContext, ToolCallResult } from "./agents-call.ts";
import type { Json } from "./agents-client.ts";

export const DESIGN_TOOL_NAMES: ReadonlySet<string> = new Set(["design_templates_list", "design_render"]);

export async function callDesignTool(name: string, args: Json, context: ToolCallContext): Promise<ToolCallResult> {
  const { ok, body } = await context.client.apiResponse(`/api/internal/design/${name}`, { method: "POST", body: JSON.stringify(args) });
  if (!ok) return { text: String(body.error ?? "The design could not be made. Try again shortly."), isError: true };
  const text = String(body.text ?? "");
  const preview = body.preview as { mime?: unknown; data?: unknown } | undefined;
  // The preview goes back as an image the model can look at, beside the saved file's details.
  if (typeof preview?.data === "string" && typeof preview.mime === "string") {
    return { text, passthrough: { content: [{ type: "text", text }, { type: "image", data: preview.data, mimeType: preview.mime }] } };
  }
  return { text };
}

const IMAGE = { type: "string", minLength: 1, maxLength: 2000, description: "A file in your working folder or one the person attached (a path), or an https image address." };

export const DESIGN_TOOL_DEFINITIONS = [
  {
    name: "design_templates_list",
    description: "Corso's listing-marketing templates (Just Listed, Open House, Just Sold, flyers): each one's id, purpose, formats, fields and how many photos it takes. Read it before design_render.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "design_render",
    description: "Fill in one of Corso's marketing templates and save it as a PNG (social formats) or PDF (flyer) in marketing/ in your working folder, made on this computer at no cost. Returns the file's path and a small preview to check before sharing.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        template: { type: "string", description: "Its id, from design_templates_list." },
        format: { type: "string", enum: DESIGN_FORMAT_NAMES, description: "square 1080×1080, portrait 1080×1350, story 1080×1920, flyer US Letter; the template lists the ones it has." },
        fields: { type: "object", additionalProperties: { type: "string" }, description: "The template's fields by name, as plain text." },
        photos: { type: "array", maxItems: MAX_PHOTOS, items: IMAGE, description: "In the order the template places them." },
        logo: IMAGE,
        headshot: IMAGE,
        output: { type: "string", enum: DESIGN_OUTPUTS, description: "Default png, or pdf for a flyer." },
      },
      required: ["template", "format"],
    },
  },
];
