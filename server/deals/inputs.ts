// What each deal tool accepts. Strict engines fill every optional field, so a null or blank field means "not given",
// never "clear it": a field is cleared only by naming it in `clear`.
import { z } from "zod";

import {
  DEADLINE_STATUSES, DEAL_CLEARABLE, DEAL_LIST_FILTERS, DEAL_SIDES, DEAL_STATUSES, DOCUMENT_STATUSES, PARTY_CLEARABLE, PARTY_ROLES,
} from "../../shared/deals.ts";

export const DEAL_ID = /^[a-z]+-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const KIND = /^[a-z][a-z0-9_]{0,39}$/;

const given = (value: unknown) => (value === null || (typeof value === "string" && !value.trim()) ? undefined : value);
const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => trimmed(given(value)), schema.optional());

export function isCalendarDate(text: string): boolean {
  if (!DATE.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}

const text = (max: number) => z.string().min(1).max(max);
const id = z.string().regex(DEAL_ID, "must be an id from deals_list or deal_get");
const date = z.string().refine(isCalendarDate, "must be a real date written YYYY-MM-DD");
const time = z.string().regex(TIME, "must be a 24-hour time written HH:MM");
/** "$450,000" and "450000" read as 450000, since models copy prices as the contract writes them. */
const dollars = z.preprocess(
  (value) => (typeof value === "string" && /^\$?\s*[\d,]+(?:\.\d+)?$/.test(value) ? Number(value.replace(/[$,\s]/g, "")) : value),
  z.number().nonnegative().max(1_000_000_000).transform((value) => Math.round(value)),
);
const clear = <T extends readonly [string, ...string[]]>(fields: T) => optional(z.array(z.enum(fields)).max(fields.length));

export const dealsListInput = z.object({ status: optional(z.enum(DEAL_LIST_FILTERS)) }).strict();

export const dealGetInput = z.object({ deal_id: id }).strict();

export const dealSaveInput = z.object({
  deal_id: optional(id),
  address: optional(text(300)),
  side: optional(z.enum(DEAL_SIDES)),
  price: optional(dollars),
  status: optional(z.enum(DEAL_STATUSES)),
  contract_date: optional(date),
  closing_date: optional(date),
  transaction_url: optional(z.url({ protocol: /^https?$/, error: "must be a full link, like https://…" }).max(2000)),
  transaction_id: optional(text(200)),
  notes: optional(text(4000)),
  clear: clear(DEAL_CLEARABLE),
}).strict();

export const deadlineSaveInput = z.object({
  deal_id: id,
  deadline_id: optional(id),
  label: optional(text(200)),
  due_date: optional(date),
  due_time: optional(time),
  status: optional(z.enum(DEADLINE_STATUSES)),
  kind: optional(z.string().regex(KIND, "must be lowercase words joined by _, like inspection_objection")),
}).strict();

export const documentSaveInput = z.object({
  deal_id: id,
  document_id: optional(id),
  name: optional(text(200)),
  status: optional(z.enum(DOCUMENT_STATUSES)),
  required: optional(z.boolean()),
}).strict();

export const partySaveInput = z.object({
  deal_id: id,
  party_id: optional(id),
  role: optional(z.enum(PARTY_ROLES)),
  name: optional(text(200)),
  email: optional(z.email({ error: "must be an email address" }).max(254)),
  phone: optional(text(40)),
  clear: clear(PARTY_CLEARABLE),
}).strict();

export const activityAddInput = z.object({
  deal_id: id,
  summary: z.preprocess(trimmed, text(300).refine((value) => !value.includes("\n"), "must be one line")),
}).strict();

export type DealsListInput = z.infer<typeof dealsListInput>;
export type DealSaveInput = z.infer<typeof dealSaveInput>;
export type DeadlineSaveInput = z.infer<typeof deadlineSaveInput>;
export type DocumentSaveInput = z.infer<typeof documentSaveInput>;
export type PartySaveInput = z.infer<typeof partySaveInput>;
export type ActivityAddInput = z.infer<typeof activityAddInput>;

/** Each deal tool's input, by tool name. */
export const DEAL_TOOL_INPUTS = {
  deals_list: dealsListInput,
  deal_get: dealGetInput,
  deal_save: dealSaveInput,
  deal_deadline_save: deadlineSaveInput,
  deal_document_save: documentSaveInput,
  deal_party_save: partySaveInput,
  deal_activity_add: activityAddInput,
} as const;
export type DealToolName = keyof typeof DEAL_TOOL_INPUTS;

/** The first problem with a tool's input, in words a model can act on. */
export function inputProblem(tool: string, error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return `${tool} was not run: its input is not valid.`;
  if (issue.code === "unrecognized_keys") return `${tool} was not run: it does not take ${issue.keys.map((key) => JSON.stringify(key)).join(", ")}.`;
  const field = issue.path.join(".") || "input";
  const said = issue.code === "invalid_type" && issue.message.endsWith("received undefined") ? "is needed"
    : issue.code === "invalid_value" ? issue.message.replace(/^Invalid option: expected one of /, "must be one of ")
      : issue.message.replace(/^Invalid input: /, "");
  return `${tool} was not run: ${field} ${said}.`;
}
