// Listing-marketing templates: one self-contained HTML file per template id beside manifest.json, filled in here and
// turned into a PNG or PDF by render.ts. The contract template authors follow (placeholders, data-if, the format class,
// fonts) is written out in the PR that added this folder and is held by templates.test.ts; validateTemplate refuses a
// template that breaks it, so a bad template fails the tests rather than a bot's render.
// scripts/bundle-server.mjs copies templates/ to dist-server/design/templates/, where templateFolder() looks second.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { fontFaceCss } from "./fonts.ts";
import { RENDER_ORIGIN } from "./origin.ts";

/** Each size a template can be made in: CSS pixels, and the file a bot gets when it names no output. */
export const DESIGN_FORMATS = {
  square: { width: 1080, height: 1080, output: "png", label: "1080×1080 social post" },
  portrait: { width: 1080, height: 1350, output: "png", label: "1080×1350 social post" },
  story: { width: 1080, height: 1920, output: "png", label: "1080×1920 story" },
  // US Letter at CSS's 96 px per inch: 8.5 × 11 in.
  flyer: { width: 816, height: 1056, output: "pdf", label: "US Letter flyer" },
} as const;
export type DesignFormat = keyof typeof DESIGN_FORMATS;
export const DESIGN_FORMAT_NAMES = Object.keys(DESIGN_FORMATS) as DesignFormat[];
export const DESIGN_OUTPUTS = ["png", "pdf"] as const;
export type DesignOutput = (typeof DESIGN_OUTPUTS)[number];

export const imageUrl = (slot: string) => `${RENDER_ORIGIN}/images/${slot}`;

export const MAX_PHOTOS = 12;
export const FIELD_MAX_LENGTH = 300;
const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
/** A colour or simple CSS token (#1f3d2b, rgb(31, 61, 43), teal): nothing that can close a declaration or a block. */
export const COLOR_VALUE = /^[#a-zA-Z0-9(),.%\s-]{0,40}$/;
const PHOTO_SLOT = /^photo([1-9][0-9]?)$/;
const EXTRA_SLOTS = ["logo", "headshot"] as const;
export type ExtraSlot = (typeof EXTRA_SLOTS)[number];

const fieldSchema = z.object({
  name: z.string().regex(FIELD_NAME),
  required: z.boolean(),
  description: z.string().min(1).max(200),
  maxLength: z.number().int().min(1).max(FIELD_MAX_LENGTH).optional(),
  /** Used when the bot leaves the field empty; data-if counts a defaulted field as filled. */
  default: z.string().min(1).max(FIELD_MAX_LENGTH).optional(),
  /** color: a CSS value for a custom property, held to COLOR_VALUE; the only kind a <style> block or style="" may use. */
  kind: z.enum(["text", "color"]).optional(),
}).strict();

const entrySchema = z.object({
  id: z.string().regex(TEMPLATE_ID),
  name: z.string().min(1).max(60),
  purpose: z.string().min(1).max(300),
  formats: z.array(z.enum(DESIGN_FORMAT_NAMES as [DesignFormat, ...DesignFormat[]])).min(1),
  photos: z.object({ min: z.number().int().min(0).max(MAX_PHOTOS), max: z.number().int().min(0).max(MAX_PHOTOS) }).strict(),
  logo: z.enum(["required", "optional"]).optional(),
  headshot: z.enum(["required", "optional"]).optional(),
  fields: z.array(fieldSchema).max(30),
}).strict();

const manifestSchema = z.object({ templates: z.array(entrySchema).min(1) }).strict();

export type TemplateEntry = z.infer<typeof entrySchema>;
export interface DesignTemplate extends TemplateEntry { html: string }

export class TemplateError extends Error {}

/** The HTML-escaped text: safe between tags and inside a quoted attribute alike. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** The image slots a template fills: photo1…photoN, then logo and headshot when it declares them. */
export function imageSlots(entry: TemplateEntry): string[] {
  return [
    ...Array.from({ length: entry.photos.max }, (_, index) => `photo${index + 1}`),
    ...EXTRA_SLOTS.filter((slot) => entry[slot]),
  ];
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["style", "script", "textarea", "title"]);
const TAG = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const DATA_IF = /\sdata-if\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;

/** `html` without each element whose data-if names something `isSet` says is empty, the element's contents included. */
export function removeUnset(html: string, isSet: (name: string) => boolean): string {
  let out = html;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(out); match; match = TAG.exec(out)) {
    const [whole, closing, rawName, attributes = ""] = match;
    if (!rawName || closing) continue;
    const name = rawName.toLowerCase();
    if (RAW_TEXT.has(name)) {
      const end = out.toLowerCase().indexOf(`</${name}`, TAG.lastIndex);
      if (end < 0) throw new TemplateError(`<${name}> is never closed.`);
      TAG.lastIndex = end;
      continue;
    }
    const condition = DATA_IF.exec(attributes);
    if (!condition) continue;
    const field = (condition[1] ?? condition[2] ?? condition[3] ?? "").trim();
    if (isSet(field)) continue;
    const start = match.index;
    const end = VOID_ELEMENTS.has(name) || /\/\s*$/.test(attributes) ? start + whole.length : closingEnd(out, name, start + whole.length);
    out = out.slice(0, start) + out.slice(end);
    TAG.lastIndex = start;
  }
  return out;
}

/** Where the element named `name` that opened just before `from` closes, counting nested ones of the same name. */
function closingEnd(html: string, name: string, from: number): number {
  const tags = new RegExp(TAG.source, "g");
  tags.lastIndex = from;
  let depth = 1;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    if (match[2]?.toLowerCase() !== name) continue;
    if (match[1]) depth -= 1;
    else if (!/\/\s*$/.test(match[3] ?? "")) depth += 1;
    if (depth === 0) return match.index + match[0].length;
  }
  throw new TemplateError(`A <${name} data-if> is never closed.`);
}

const FORBIDDEN_MARKUP: ReadonlyArray<[RegExp, string]> = [
  [/<\s*(script|link|iframe|frame|object|embed|base|form|video|audio)\b/i, "has a <$1> tag: templates are static HTML and CSS"],
  [/<meta[^>]+http-equiv/i, "sets a meta http-equiv"],
  [/\son[a-z]+\s*=/i, "has an on… event attribute"],
  [/@import\b/i, "uses @import: put the CSS in the file"],
];
// An inline SVG's namespace is a name, never fetched.
const SVG_NAMESPACE = /\sxmlns(?::[a-z]+)?\s*=\s*["']http:\/\/www\.w3\.org\/[^"']*["']/gi;
const EXTERNAL = /(?:\b[a-z][a-z0-9+.-]*:)?\/\/[a-z0-9]/i;

/** What is wrong with a template, as lines an author can fix; empty when it keeps the contract. */
export function templateProblems(entry: TemplateEntry, html: string): string[] {
  const problems: string[] = [];
  const say = (line: string) => problems.push(`${entry.id}: ${line}`);
  if (entry.photos.min > entry.photos.max) say("photos.min is above photos.max.");
  if (!/<html[\s>]/i.test(html)) say("has no <html> tag, which carries the format class.");
  if (!/<head[\s>]/i.test(html)) say("has no <head> tag, where the fonts go.");
  for (const [pattern, words] of FORBIDDEN_MARKUP) {
    const found = pattern.exec(html);
    if (found) say(`${words.replace("$1", found[1]?.toLowerCase() ?? "")}.`);
  }
  if (EXTERNAL.test(html.replace(SVG_NAMESPACE, ""))) say("names an outside address: a template may load only what the render passes in.");
  const names = new Set<string>();
  for (const field of entry.fields) {
    if (PHOTO_SLOT.test(field.name) || (EXTRA_SLOTS as readonly string[]).includes(field.name)) say(`field ${field.name} is an image slot's name.`);
    if (names.has(field.name)) say(`field ${field.name} is declared twice.`);
    if (field.kind === "color" && field.default !== undefined && !COLOR_VALUE.test(field.default)) say(`field ${field.name}'s default is not a plain colour.`);
    names.add(field.name);
  }
  const slots = new Set(imageSlots(entry));
  const used = new Set([...html.matchAll(PLACEHOLDER)].map((found) => found[1]!));
  for (const name of used) if (!names.has(name) && !slots.has(name)) say(`{{${name}}} is neither a declared field nor one of its image slots (${[...slots].join(", ") || "none"}).`);
  for (const name of [...names, ...slots]) if (!used.has(name)) say(`declares ${name} but never uses {{${name}}}.`);
  const colors = new Set(entry.fields.filter((field) => field.kind === "color").map((field) => field.name));
  for (const css of styleContexts(html)) {
    for (const found of css.matchAll(PLACEHOLDER)) {
      if (!colors.has(found[1]!)) say(`{{${found[1]}}} is inside CSS, where only a field of kind "color" may go.`);
    }
  }
  try {
    let unknown: string | null = null;
    removeUnset(html, (name) => {
      if (!names.has(name) && !slots.has(name)) unknown ??= name;
      return false;
    });
    if (unknown !== null) say(`data-if="${unknown}" names neither a field nor an image slot.`);
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    say(error.message);
  }
  return problems;
}

const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi;
const STYLE_ATTRIBUTE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const EMPTY_IN_CSS = ")";

/** Every <style> block's text and every style="" attribute's value in `html`. */
function styleContexts(html: string): string[] {
  return [
    ...[...html.matchAll(STYLE_BLOCK)].map((found) => found[2]!),
    ...[...html.matchAll(STYLE_ATTRIBUTE)].map((found) => found[1] ?? found[2]!),
  ];
}

/** The template's field values from a bot's `fields`: trimmed, defaults filled in, or the first problem in words a bot
 * can fix (an unknown field, a missing required one, one too long, a colour that is not a plain colour). */
export function fieldValues(template: TemplateEntry, given: Readonly<Record<string, unknown>>): { values: Record<string, string> } | { error: string } {
  const known = new Map(template.fields.map((field) => [field.name, field]));
  const unknown = Object.keys(given).find((name) => !known.has(name));
  const list = template.fields.map((field) => field.name).join(", ");
  if (unknown !== undefined) return { error: `${template.id} has no field ${unknown.slice(0, 60)}; its fields are ${list}.` };
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    const raw = given[field.name];
    if (raw !== undefined && raw !== null && typeof raw !== "string") return { error: `${field.name} must be text.` };
    const value = (raw ?? "").trim() || field.default || "";
    const limit = field.maxLength ?? FIELD_MAX_LENGTH;
    if (!value && field.required) return { error: `${template.id} needs ${field.name}: ${field.description}` };
    if (value.length > limit) return { error: `${field.name} is ${value.length} characters; ${template.id} fits ${limit}. Shorten it.` };
    if (field.kind === "color" && !COLOR_VALUE.test(value)) return { error: `${field.name} must be a plain colour such as #1f3d2b or rgb(31, 61, 43).` };
    if (value) values[field.name] = value;
  }
  return { values };
}

/** The templates folder: beside this module in a checkout, under design/ beside the bundled server. */
export function templateFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const found = [join(here, "templates"), join(here, "design", "templates")].find((folder) => existsSync(join(folder, "manifest.json")));
  if (!found) throw new TemplateError("The marketing templates are missing from this install.");
  return found;
}

/** Every template in `folder`, checked against the contract; throws with every problem when any breaks it. */
export function loadTemplates(folder: string = templateFolder()): DesignTemplate[] {
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")));
  if (!parsed.success) throw new TemplateError(`manifest.json: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const problems: string[] = [];
  const ids = new Set<string>();
  const templates = parsed.data.templates.flatMap((entry) => {
    if (ids.has(entry.id)) problems.push(`${entry.id}: declared twice.`);
    ids.add(entry.id);
    const file = join(folder, `${entry.id}.html`);
    if (!existsSync(file)) {
      problems.push(`${entry.id}: ${entry.id}.html is missing.`);
      return [];
    }
    const html = readFileSync(file, "utf8");
    problems.push(...templateProblems(entry, html));
    return [{ ...entry, html }];
  });
  if (problems.length) throw new TemplateError(problems.join("\n"));
  return templates;
}

export interface FillInput {
  format: DesignFormat;
  /** From fieldValues: defaults already in; a missing or empty one counts as unset. */
  fields: Readonly<Record<string, string>>;
  /** The slots that have an image. */
  images: ReadonlySet<string>;
}

/** The page to render: unset data-if elements removed, every placeholder filled (text escaped, images as their render
 * URLs), the format class on <html> and the bundled fonts first in <head>. */
export function fillTemplate(template: DesignTemplate, input: FillInput): string {
  const slots = new Set(imageSlots(template));
  const isSet = (name: string) => slots.has(name) ? input.images.has(name) : Boolean(input.fields[name]);
  const kept = removeUnset(template.html, isSet);
  // Inside CSS only colour fields stand (templateProblems). An empty one is written as a lone ")", which CSS Syntax makes
  // an invalid declaration: the browser drops it and the template's earlier declaration of the same property stands.
  const css = (text: string) => text.replace(PLACEHOLDER, (_, name: string) => input.fields[name] ?? EMPTY_IN_CSS);
  const styled = kept
    .replace(STYLE_BLOCK, (_, open: string, body: string, close: string) => `${open}${css(body)}${close}`)
    .replace(STYLE_ATTRIBUTE, (whole: string, double: string | undefined, single: string | undefined) => whole.replace((double ?? single)!, css((double ?? single)!)));
  const filled = styled.replace(PLACEHOLDER, (_, name: string) => slots.has(name)
    ? (input.images.has(name) ? imageUrl(name) : "")
    : escapeHtml(input.fields[name] ?? ""));
  const formatClass = `format-${input.format}`;
  const classed = filled.replace(/<html\b([^>]*)>/i, (whole, attributes: string) => {
    const existing = /\sclass\s*=\s*(["'])(.*?)\1/i.exec(attributes);
    return existing
      ? whole.replace(existing[0], ` class=${existing[1]}${formatClass} ${existing[2]}${existing[1]}`)
      : `<html class="${formatClass}"${attributes}>`;
  });
  const { width, height } = DESIGN_FORMATS[input.format];
  const page = `<style>@page { size: ${width}px ${height}px; margin: 0; }\n${fontFaceCss()}</style>`;
  return classed.replace(/<head\b[^>]*>/i, (head) => `${head}\n${page}`);
}
