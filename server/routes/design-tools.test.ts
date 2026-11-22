import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { RenderRequest } from "../design/render.ts";
import { loadTemplates } from "../design/templates.ts";
import { runDesignRender, templateListing, type DesignToolDeps } from "./design-tools.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f7a43b0000000049454e44ae426082", "hex");
const base = mkdtempSync(join(tmpdir(), "corso-design-route-"));
const work = join(base, "work");
const attachments = join(base, "attachments");
mkdirSync(work, { recursive: true });
mkdirSync(attachments, { recursive: true });
writeFileSync(join(work, "front.png"), PNG);
afterAll(() => rmSync(base, { recursive: true, force: true }));

const templates = loadTemplates();
const folders = async () => ({ roots: [work], vmWorkspace: null });

function deps(overrides: Partial<DesignToolDeps> = {}) {
  const render = vi.fn(async (_request: RenderRequest) => ({ bytes: Buffer.from("rendered"), preview: Buffer.from("small"), refused: [] }));
  return {
    render,
    deps: {
      attachments, vmGuestRoot: "/home/cua/workspace", timeZone: () => "America/Denver",
      chrome: async () => ({ path: "/chrome" }), render, now: () => new Date("2026-11-21T18:00:00Z"), ...overrides,
    } satisfies DesignToolDeps,
  };
}

const sample = { template: "sample-card", format: "square", fields: { headline: "Just Listed", address: "1847 Larkspur Ln" }, photos: ["front.png"] };
const error = (answer: Awaited<ReturnType<typeof runDesignRender>>) => ("error" in answer.body ? answer.body.error : null);

describe("design_render", () => {
  it("renders, saves into marketing/ under a readable name, and hands back the path and the preview", async () => {
    const { render, deps: given } = deps();
    const answer = await runDesignRender(sample, folders, templates, given);
    expect(answer.status).toBe(201);
    const body = answer.body as { text: string; preview: { mime: string; data: string } };
    const summary = JSON.parse(body.text);
    expect(summary.path).toBe(join(work, "marketing", "2026-11-21-1847-larkspur-ln-sample-card-square.png"));
    expect(readFileSync(summary.path, "utf8")).toBe("rendered");
    expect(body.preview).toEqual({ mime: "image/jpeg", data: Buffer.from("small").toString("base64") });
    const request = render.mock.calls[0]![0];
    expect([request.width, request.height, request.output]).toEqual([1080, 1080, "png"]);
    expect(request.html).toContain('class="format-square"');
    expect([...request.assets.keys()]).toContain("https://render.corso.invalid/images/photo1");
    const again = JSON.parse(((await runDesignRender(sample, folders, templates, given)).body as { text: string }).text);
    expect(again.path).toBe(join(work, "marketing", "2026-11-21-1847-larkspur-ln-sample-card-square-2.png"));
  });

  it("refuses an unknown template or a format the template lacks, naming what there is", async () => {
    const { deps: given, render } = deps();
    expect(error(await runDesignRender({ ...sample, template: "nope" }, folders, templates, given))).toMatch(/no template nope; the templates are sample-card/);
    expect(error(await runDesignRender({ ...sample, format: "story" }, folders, templates, given))).toMatch(/comes in square, not story/);
    expect(error(await runDesignRender({ ...sample, format: "poster" }, folders, templates, given))).toMatch(/format/);
    expect(render).not.toHaveBeenCalled();
  });

  it("refuses a missing required field, an unknown one, the wrong photo count and a logo the template has no place for", async () => {
    const { deps: given } = deps();
    expect(error(await runDesignRender({ ...sample, fields: { headline: "x" } }, folders, templates, given))).toMatch(/needs address/);
    expect(error(await runDesignRender({ ...sample, fields: { ...sample.fields, price: "1" } }, folders, templates, given))).toMatch(/has no field price/);
    expect(error(await runDesignRender({ ...sample, photos: [] }, folders, templates, given))).toMatch(/takes 1 photo; 0 were given/);
    expect(error(await runDesignRender({ ...sample, logo: "front.png" }, folders, templates, given))).toMatch(/no place for a logo/);
  });

  it("refuses an unreadable photo, saying which", async () => {
    const { deps: given } = deps();
    expect(error(await runDesignRender({ ...sample, photos: ["../front.png"] }, folders, templates, given))).toMatch(/^design_render was not run: photo1: .*climbs out/);
    expect(error(await runDesignRender({ ...sample, photos: ["http://example.com/a.jpg"] }, folders, templates, given))).toMatch(/photo1: .*not https/);
  });

  it("passes on, in words, a browser that is not ready yet", async () => {
    const { deps: given } = deps({ chrome: async () => { throw new Error("Getting the browser ready. Try again in a moment."); } });
    const answer = await runDesignRender(sample, folders, templates, given);
    expect(answer.status).toBe(503);
    expect(error(answer)).toMatch(/Getting the browser ready/);
    expect(existsSync(join(work, "marketing", "nothing"))).toBe(false);
  });

  it("saves a Local VM turn's file in its workspace and names it the VM's way", async () => {
    const vm = join(base, "vm");
    mkdirSync(vm, { recursive: true });
    writeFileSync(join(vm, "front.png"), PNG);
    const { deps: given } = deps();
    const answer = await runDesignRender({ ...sample, photos: ["/home/cua/workspace/front.png"] }, async () => ({ roots: [work], vmWorkspace: vm }), templates, given);
    expect(JSON.parse((answer.body as { text: string }).text).path).toBe("/home/cua/workspace/marketing/2026-11-21-1847-larkspur-ln-sample-card-square.png");
    expect(existsSync(join(vm, "marketing", "2026-11-21-1847-larkspur-ln-sample-card-square.png"))).toBe(true);
  });
});

describe("design_templates_list", () => {
  it("says each template's formats, fields and photos", () => {
    expect(templateListing(templates).find((one) => one.id === "sample-card")).toEqual({
      id: "sample-card",
      name: "Sample card",
      purpose: expect.any(String),
      formats: [{ format: "square", size: "1080×1080 social post", output: "png" }],
      fields: [
        { name: "headline", required: true, description: expect.any(String), maxLength: 60 },
        { name: "address", required: true, description: expect.any(String), maxLength: 120 },
      ],
      photos: { min: 1, max: 1 },
    });
  });
});
