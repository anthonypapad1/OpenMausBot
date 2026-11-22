// The internal calls behind design_templates_list and design_render (server/drivers/agents-design-tools.ts). Runs
// inside index.ts's /api/internal/ block after the capability bearer is checked; the bot is the capability's. A render
// reads its images from the bot's own folders, the person's attachments or a public https address, runs in a Chrome of
// its own (server/design/render.ts) and saves into marketing/ in the bot's working folder: it changes nothing else, so,
// like generate_image, it asks the person nothing first.
import { mkdir } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join, posix, relative, sep } from "node:path";
import { z } from "zod";

import { writeFileAtomic } from "../atomic.ts";
import { fontAssets } from "../design/fonts.ts";
import { claimPath, designFileName, localDate, MARKETING_FOLDER } from "../design/output.ts";
import { renderDesign, type RenderAsset, type Rendered, type RenderRequest, type RendererOptions } from "../design/render.ts";
import { IMAGES_TOTAL_MAX_BYTES, readSourceImage, SourceRefusal, type SourceRoots } from "../design/sources.ts";
import {
  DESIGN_FORMAT_NAMES, DESIGN_FORMATS, DESIGN_OUTPUTS, FIELD_MAX_LENGTH, fieldValues, fillTemplate, imageSlots, imageUrl, loadTemplates, MAX_PHOTOS,
  TemplateError, type DesignTemplate,
} from "../design/templates.ts";
import type { json as sendJson } from "../harness/http.ts";
import type { BotFolders } from "../pages/bundle.ts";
import { PASS } from "./table.ts";

const TOOL_PATH = /^\/api\/internal\/design\/(design_templates_list|design_render)$/;
const SOURCE = z.string().trim().min(1).max(2000);

export const DESIGN_RENDER_INPUT = z.object({
  template: z.string().trim().min(1).max(60),
  format: z.enum(DESIGN_FORMAT_NAMES as [string, ...string[]]),
  fields: z.record(z.string(), z.unknown()).optional(),
  photos: z.array(SOURCE).max(MAX_PHOTOS).optional(),
  logo: SOURCE.optional(),
  headshot: SOURCE.optional(),
  output: z.enum(DESIGN_OUTPUTS).optional(),
}).strict();

export interface DesignToolContext {
  method: string;
  path: string;
  res: ServerResponse;
  json: typeof sendJson;
  readBody: () => Promise<unknown>;
  folders: BotFolders;
}

export interface DesignToolDeps {
  /** The person's attachments: a render may use a photo they attached, as a browser upload may. */
  attachments: string;
  /** Where a Local VM's workspace sits inside the VM, so its paths and the saved file's path read the bot's way. */
  vmGuestRoot: string;
  timeZone(): string;
  /** The Chrome the bots' browser runs (chromeLauncher.binary()); throws, in words, while it is not ready. */
  chrome(): Promise<{ path: string }>;
  render?: (request: RenderRequest, options: RendererOptions) => Promise<Rendered>;
  templates?: () => DesignTemplate[];
  now?: () => Date;
}

type Answer = { status: number; body: { text: string; preview?: { mime: string; data: string } } | { error: string } };
const refuse = (status: number, error: string): Answer => ({ status, body: { error: `design_render was not run: ${error}` } });

/** What a bot sees of the templates: enough to choose one and fill it in. */
export function templateListing(templates: readonly DesignTemplate[]) {
  return templates.filter((template) => !template.internal).map((template) => ({
    id: template.id,
    name: template.name,
    purpose: template.purpose,
    formats: template.formats.map((format) => ({ format, size: DESIGN_FORMATS[format].label, output: DESIGN_FORMATS[format].output })),
    fields: template.fields.map((field) => ({
      name: field.name, required: field.required, description: field.description,
      ...(field.default ? { default: field.default } : {}), ...(field.kind === "color" ? { kind: "color" } : {}),
      maxLength: field.maxLength ?? FIELD_MAX_LENGTH,
    })),
    photos: template.photos,
    ...(template.logo ? { logo: template.logo } : {}),
    ...(template.headshot ? { headshot: template.headshot } : {}),
  }));
}

export async function runDesignRender(raw: unknown, folders: BotFolders, templates: readonly DesignTemplate[], deps: DesignToolDeps): Promise<Answer> {
  const parsed = DESIGN_RENDER_INPUT.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return refuse(400, `${issue?.path.join(".") || "input"}: ${issue?.message ?? "invalid"}. It takes template, format, fields, photos, logo, headshot and output.`);
  }
  const input = parsed.data;
  const template = templates.find((one) => one.id === input.template);
  if (!template) return refuse(404, `there is no template ${input.template}; the templates are ${templates.map((one) => one.id).join(", ")}.`);
  const format = input.format as keyof typeof DESIGN_FORMATS;
  if (!template.formats.includes(format)) return refuse(400, `${template.id} comes in ${template.formats.join(", ")}, not ${format}.`);
  const output = input.output ?? DESIGN_FORMATS[format].output;
  const values = fieldValues(template, input.fields ?? {});
  if ("error" in values) return refuse(400, values.error);
  const photos = input.photos ?? [];
  const { min, max } = template.photos;
  if (photos.length < min || photos.length > max) return refuse(400, `${template.id} takes ${min === max ? min : `${min} to ${max}`} photo${max === 1 ? "" : "s"}; ${photos.length} were given.`);
  const sources: Array<[string, string]> = photos.map((photo, index) => [`photo${index + 1}`, photo]);
  for (const slot of ["logo", "headshot"] as const) {
    const given = input[slot];
    if (given && !template[slot]) return refuse(400, `${template.id} has no place for a ${slot}; leave it out.`);
    if (!given && template[slot] === "required") return refuse(400, `${template.id} needs a ${slot}.`);
    if (given) sources.push([slot, given]);
  }

  const { roots, vmWorkspace } = await folders();
  const workFolder = vmWorkspace ?? roots[0];
  if (!workFolder) return refuse(409, "you have no working folder to save the design in.");
  const where: SourceRoots = { roots: [...roots, deps.attachments], vm: vmWorkspace ? { guestRoot: deps.vmGuestRoot, hostRoot: vmWorkspace } : null };
  const assets = new Map<string, RenderAsset>(fontAssets());
  let total = 0;
  for (const [slot, source] of sources) {
    try {
      const image = await readSourceImage(source, where);
      total += image.bytes.length;
      if (total > IMAGES_TOTAL_MAX_BYTES) return refuse(413, `the images come to over ${IMAGES_TOTAL_MAX_BYTES / 1024 / 1024} MB together. Use smaller copies.`);
      assets.set(imageUrl(slot), image);
    } catch (error) {
      if (error instanceof SourceRefusal) return refuse(400, `${slot}: ${error.message}`);
      throw error;
    }
  }

  let chrome: { path: string };
  try {
    chrome = await deps.chrome();
  } catch (error) {
    return refuse(503, error instanceof Error ? error.message : String(error));
  }
  const filled = new Set(sources.map(([slot]) => slot).filter((slot) => imageSlots(template).includes(slot)));
  const html = fillTemplate(template, { format, fields: values.values, images: filled });
  const { width, height } = DESIGN_FORMATS[format];
  // A flyer as a PNG is for print or a sharp share: twice its CSS size. Social sizes are already their posting size.
  const scale = output === "png" && format === "flyer" ? 2 : 1;
  let rendered: Rendered;
  try {
    rendered = await (deps.render ?? renderDesign)(
      { html, assets, width, height, output, scale },
      { executablePath: chrome.path },
    );
  } catch (error) {
    return refuse(502, `the design could not be rendered (${error instanceof Error ? error.message : String(error)}). Try again shortly.`);
  }

  const folder = join(workFolder, MARKETING_FOLDER);
  await mkdir(folder, { recursive: true });
  const name = designFileName({ date: localDate((deps.now ?? (() => new Date()))(), deps.timeZone()), address: values.values.address, template: template.id, format, output });
  const path = claimPath(folder, name);
  writeFileAtomic(path, rendered.bytes);
  const shownPath = vmWorkspace ? posix.join(deps.vmGuestRoot, ...relative(vmWorkspace, path).split(sep)) : path;
  const summary = {
    path: shownPath, template: template.id, format, output, bytes: rendered.bytes.length,
    ...(output === "png" ? { pixels: `${width * scale}×${height * scale}` } : { page: format === "flyer" ? "US Letter" : `${width}×${height} px` }),
    ...(rendered.refused.length ? { refused: rendered.refused } : {}),
    note: "The preview below is a small copy of the saved file. Check it before you share; attach the file with attach_file when the person should get it.",
  };
  return { status: 201, body: { text: JSON.stringify(summary), preview: { mime: "image/jpeg", data: rendered.preview.toString("base64") } } };
}

export function createDesignToolRoutes(deps: DesignToolDeps) {
  let loaded: DesignTemplate[] | null = null;
  const templates = () => (loaded ??= (deps.templates ?? loadTemplates)());
  return async (ctx: DesignToolContext): Promise<typeof PASS | void> => {
    const tool = ctx.method === "POST" ? TOOL_PATH.exec(ctx.path)?.[1] : undefined;
    if (!tool) return PASS;
    const body = await ctx.readBody();
    let list: DesignTemplate[];
    try {
      list = templates();
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      return void ctx.json(ctx.res, 500, { error: `The marketing templates could not be read: ${error.message}` });
    }
    if (tool === "design_templates_list") return void ctx.json(ctx.res, 200, { text: JSON.stringify({ templates: templateListing(list) }) });
    const answer = await runDesignRender(body, ctx.folders, list, deps);
    ctx.json(ctx.res, answer.status, answer.body);
  };
}
