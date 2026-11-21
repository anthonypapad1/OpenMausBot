// Renders in a real Chrome when one is named: OMB_CDP_CHROME=<path> or OMB_CDP_E2E=1 (server/browser/cdp/testing/real-chrome.ts).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";

import { CHROME, FIRST_LAUNCH_MS } from "../browser/cdp/testing/real-chrome.ts";
import { runDesignRender } from "../routes/design-tools.ts";
import { renderDesign } from "./render.ts";
import { loadTemplates } from "./templates.ts";

/** A solid-colour PNG, `width` × `height`. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, index) => [r, g, b][index % 3]!)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
}

/** Width and height, and the first pixel's colour, of an 8-bit RGB(A) PNG. */
function readPng(png: Buffer): { width: number; height: number; first: number[] } {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), channels = png[25] === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { width, height, first: [...raw.subarray(1, 1 + channels).subarray(0, 3)] };
}

const base = mkdtempSync(join(tmpdir(), "corso-design-render-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe.skipIf(!CHROME)("rendering in a real Chrome", () => {
  it("makes the sample card as a 1080×1080 PNG with its photo, and a Letter PDF of it", async () => {
    const work = join(base, "work");
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "front.png"), solidPng(64, 64, [200, 30, 30]));
    const deps = { attachments: join(base, "attachments"), vmGuestRoot: "/home/cua/workspace", timeZone: () => "America/Denver", chrome: async () => ({ path: CHROME! }) };
    const folders = async () => ({ roots: [work], vmWorkspace: null });
    const templates = loadTemplates();
    const answer = await runDesignRender({ template: "sample-card", format: "square", fields: { headline: "Just <b>Listed</b>", address: "1847 Larkspur Ln" }, photos: ["front.png"] }, folders, templates, deps);
    expect(answer.status).toBe(201);
    const body = answer.body as { text: string; preview: { data: string } };
    const png = readPng(readFileSync(JSON.parse(body.text).path));
    expect([png.width, png.height]).toEqual([1080, 1080]);
    // The photo fills the top of the card.
    expect(png.first).toEqual([200, 30, 30]);
    expect(Buffer.from(body.preview.data, "base64").subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    const pdf = await runDesignRender({ template: "sample-card", format: "square", output: "pdf", fields: { headline: "Just Listed", address: "1847 Larkspur Ln" }, photos: ["front.png"] }, folders, templates, deps);
    const file = readFileSync(JSON.parse((pdf.body as { text: string }).text).path);
    expect(file.toString("latin1", 0, 5)).toBe("%PDF-");
  }, FIRST_LAUNCH_MS);

  it("renders every shipped template in every size it offers, with every field filled", async () => {
    const work = join(base, "every");
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "photo.png"), solidPng(64, 64, [30, 90, 60]));
    const deps = { attachments: join(base, "attachments"), vmGuestRoot: "/home/cua/workspace", timeZone: () => "America/Denver", chrome: async () => ({ path: CHROME! }) };
    const folders = async () => ({ roots: [work], vmWorkspace: null });
    const templates = loadTemplates();
    for (const template of templates) {
      const fields = Object.fromEntries(template.fields.map((field) => [field.name, field.kind === "color" ? "#23395b" : "x".repeat(Math.min(field.maxLength ?? 20, 20))]));
      const images = { photos: Array.from({ length: template.photos.max }, () => "photo.png"), ...(template.logo ? { logo: "photo.png" } : {}), ...(template.headshot ? { headshot: "photo.png" } : {}) };
      for (const format of template.formats) {
        const answer = await runDesignRender({ template: template.id, format, fields, ...images }, folders, templates, deps);
        expect(answer.status, `${template.id} ${format}: ${JSON.stringify(answer.body)}`).toBe(201);
      }
    }
  }, FIRST_LAUNCH_MS * 4);

  it("prints a flyer on one US Letter page", async () => {
    const html = '<html><head></head><body style="margin:0;background:#123456">Flyer</body></html>';
    const { bytes } = await renderDesign({ html, assets: new Map(), width: 816, height: 1056, output: "pdf" }, { executablePath: CHROME! });
    const text = bytes.toString("latin1");
    expect(text).toMatch(/\/MediaBox \[0 0 612 792\]/);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
  }, FIRST_LAUNCH_MS);

  it("loads nothing it was not given, runs no script, and lets an empty colour fall back to the earlier declaration", async () => {
    const html = `<html><head><style>:root { --brand: #00ff00; --brand: ); } body { margin: 0; background: var(--brand); }</style></head>
      <body><div style="position:absolute;right:0;bottom:0"><img width="1" height="1" src="https://example.com/a.png"><img width="1" height="1" src="https://render.corso.invalid/images/photo9"></div><script>document.body.style.background = "#ff00ff"</script></body></html>`;
    const rendered = await renderDesign({ html, assets: new Map(), width: 100, height: 100, output: "png" }, { executablePath: CHROME! });
    expect(readPng(rendered.bytes).first).toEqual([0, 255, 0]);
    expect(rendered.refused).toEqual(["https://render.corso.invalid/images/photo9"]);
  }, FIRST_LAUNCH_MS);
});
