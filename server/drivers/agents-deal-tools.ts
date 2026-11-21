// The shared deal list's tools: every bot reads and writes the same deals, parties, deadlines, documents and activity.
// The internal route (server/routes/deals.ts) checks each input in full and keeps the rows; these schemas say the shape.
import {
  DEADLINE_CLEARABLE, DEADLINE_KINDS, DEADLINE_STATUSES, DEAL_CLEARABLE, DEAL_LIST_FILTERS, DEAL_SIDES, DEAL_STATUSES, DOCUMENT_STATUSES, PARTY_CLEARABLE, PARTY_ROLES,
} from "../../shared/deals.ts";
import type { ToolCallContext, ToolCallResult } from "./agents-call.ts";
import type { Json } from "./agents-client.ts";

export const DEAL_TOOL_NAMES: ReadonlySet<string> = new Set([
  "deals_list", "deal_get", "deal_save", "deal_deadline_save", "deal_document_save", "deal_party_save", "deal_activity_add",
]);

export async function callDealTool(name: string, args: Json, context: ToolCallContext): Promise<ToolCallResult> {
  const { ok, body } = await context.client.apiResponse(`/api/internal/deals/${name}`, { method: "POST", body: JSON.stringify(args) });
  return ok ? { text: String(body.text ?? "") } : { text: String(body.error ?? "The deal list could not be reached. Try again shortly."), isError: true };
}

const DATE = { type: "string", description: "YYYY-MM-DD" };
const dealId = { type: "string", description: "From deals_list." };
const ownId = { type: "string", description: "From deal_get, to change one. Omit to add." };
const clear = (fields: readonly string[]) => ({ type: "array", items: { type: "string", enum: fields }, description: "Fields to empty." });

export const DEAL_TOOL_DEFINITIONS = [
  {
    name: "deals_list",
    description: "The shared deal list every bot works from: each deal with its next open deadline.",
    inputSchema: { type: "object", additionalProperties: false, properties: { status: { type: "string", enum: DEAL_LIST_FILTERS, description: "Default open." } } },
  },
  {
    name: "deal_get",
    description: "One deal with its parties, deadlines, documents and recent activity.",
    inputSchema: { type: "object", additionalProperties: false, properties: { deal_id: dealId }, required: ["deal_id"] },
  },
  {
    name: "deal_save",
    description: "Add a deal to the shared deal list, or change one: only the fields given change. Add to its notes with notes_append; notes replaces them all.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        deal_id: { type: "string", description: "Omit to add a deal." },
        address: { type: "string", maxLength: 300 },
        side: { type: "string", enum: DEAL_SIDES },
        price: { type: "number", minimum: 0, description: "Dollars." },
        status: { type: "string", enum: DEAL_STATUSES },
        contract_date: DATE,
        closing_date: DATE,
        transaction_url: { type: "string", maxLength: 2000, description: "The deal's link in the transaction system, such as CTM eContracts." },
        transaction_id: { type: "string", maxLength: 200 },
        notes: { type: "string", maxLength: 4000, description: "Replaces every note, other bots' too." },
        notes_append: { type: "string", maxLength: 2000, description: "Added as a new line." },
        clear: clear(DEAL_CLEARABLE),
      },
    },
  },
  {
    name: "deal_deadline_save",
    description: "Add or change a deal's deadline; mark it done or waived once met.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        deal_id: dealId,
        deadline_id: ownId,
        label: { type: "string", maxLength: 200 },
        due_date: DATE,
        due_time: { type: "string", description: "HH:MM, 24-hour." },
        status: { type: "string", enum: DEADLINE_STATUSES },
        kind: { type: "string", description: `Such as ${DEADLINE_KINDS.join(", ")}.` },
        clear: clear(DEADLINE_CLEARABLE),
      },
      required: ["deal_id"],
    },
  },
  {
    name: "deal_document_save",
    description: "Add or change a deal's document and where it stands.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        deal_id: dealId,
        document_id: ownId,
        name: { type: "string", maxLength: 200 },
        status: { type: "string", enum: DOCUMENT_STATUSES },
        required: { type: "boolean", description: "On the broker's checklist. Default true." },
      },
      required: ["deal_id"],
    },
  },
  {
    name: "deal_party_save",
    description: "Add or change a person on a deal.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        deal_id: dealId,
        party_id: ownId,
        role: { type: "string", enum: PARTY_ROLES },
        name: { type: "string", maxLength: 200 },
        email: { type: "string", maxLength: 254 },
        phone: { type: "string", maxLength: 40 },
        clear: clear(PARTY_CLEARABLE),
      },
      required: ["deal_id"],
    },
  },
  {
    name: "deal_activity_add",
    description: "Note on a deal, in one line, what you just did for it. Every bot and the person see it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { deal_id: dealId, summary: { type: "string", maxLength: 300 } },
      required: ["deal_id", "summary"],
    },
  },
];
