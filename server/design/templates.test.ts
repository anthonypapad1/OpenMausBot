import { describe, expect, it } from "vitest";

import { fontAssets, fontFaceCss } from "./fonts.ts";
import { RENDER_ORIGIN } from "./origin.ts";
import { escapeHtml, fieldValues, fillTemplate, loadTemplates, removeUnset, templateProblems, type DesignTemplate, type TemplateEntry } from "./templates.ts";

const entry = (overrides: Partial<TemplateEntry> = {}): TemplateEntry => ({
  id: "test-card",
  name: "Test card",
  purpose: "Tests.",
  formats: ["square", "flyer"],
  photos: { min: 0, max: 1 },
  fields: [
    { name: "headline", required: false, description: "Top line.", default: "Just Listed" },
    { name: "address", required: true, description: "Street address." },
    { name: "brand_color", required: false, description: "Brand colour.", kind: "color" },
  ],
  ...overrides,
});

const html = `<!doctype html><html lang="en"><head><style>:root { --brand: #1f3d2b; --brand: {{brand_color}}; }</style></head>
<body><div data-if="photo1"><img src="{{photo1}}" alt=""></div><h1 data-if="headline">{{headline}}</h1><p data-if="address">{{address}}</p></body></html>`;
const template = (source = html, overrides: Partial<TemplateEntry> = {}): DesignTemplate => ({ ...entry(overrides), html: source });

describe("the shipped manifest", () => {
  it("loads, and every template keeps the contract", () => {
    const templates = loadTemplates();
    expect(templates.map((one) => one.id)).toContain("sample-card");
    const sample = templates.find((one) => one.id === "sample-card")!;
    expect(sample.formats).toEqual(["square"]);
    expect(sample.photos).toEqual({ min: 1, max: 1 });
    expect(sample.fields.map((field) => field.name)).toEqual(["headline", "address"]);
  });

  it("has the app's UI fonts to serve, as @font-face rules at the render origin", () => {
    expect(fontFaceCss()).toContain('font-family: "Inter"');
    expect(fontFaceCss()).toContain('font-family: "Geist"');
    expect([...fontAssets().keys()].every((url) => url.startsWith(`${RENDER_ORIGIN}/fonts/`))).toBe(true);
  });
});

describe("templateProblems", () => {
  it("passes a template that keeps the contract", () => {
    expect(templateProblems(entry(), html)).toEqual([]);
  });

  it("names a placeholder that is neither a field nor an image slot", () => {
    expect(templateProblems(entry(), html.replace("{{address}}", "{{adress}}")).join("\n")).toMatch(/\{\{adress\}\} is neither/);
  });

  it("names a declared field or photo the HTML never uses", () => {
    const problems = templateProblems(entry({ photos: { min: 0, max: 2 } }), html).join("\n");
    expect(problems).toMatch(/declares photo2 but never uses/);
  });

  it("refuses scripts, event attributes, outside addresses and @import", () => {
    expect(templateProblems(entry(), html.replace("</body>", "<script>1</script></body>")).join()).toMatch(/<script> tag/);
    expect(templateProblems(entry(), html.replace("<h1 ", '<h1 onclick="x()" ')).join()).toMatch(/event attribute/);
    expect(templateProblems(entry(), html.replace("alt=\"\"", 'alt="" srcset="https://example.com/a.jpg"')).join()).toMatch(/outside address/);
    expect(templateProblems(entry(), html.replace("<style>", "<style>@import 'x.css';")).join()).toMatch(/@import/);
  });

  it("allows an inline SVG's namespace", () => {
    expect(templateProblems(entry(), html.replace("</body>", '<svg xmlns="http://www.w3.org/2000/svg"></svg></body>'))).toEqual([]);
  });

  it("lets only a colour field into CSS, in <style> and style=\"\" alike", () => {
    expect(templateProblems(entry(), html.replace("{{brand_color}}", "{{address}}")).join()).toMatch(/\{\{address\}\} is inside CSS/);
    const inline = html.replace('<h1 data-if="headline">', '<h1 data-if="headline" style="color: {{headline}}">');
    expect(templateProblems(entry(), inline).join()).toMatch(/\{\{headline\}\} is inside CSS/);
  });

  it("names a data-if that points at nothing, and one never closed", () => {
    expect(templateProblems(entry(), html.replace('data-if="address"', 'data-if="price"')).join()).toMatch(/data-if="price"/);
    expect(templateProblems(entry(), html.replace("{{address}}</p>", "{{address}}")).join()).toMatch(/never closed/);
  });

  it("refuses a field named like an image slot and a colour default that is not a colour", () => {
    const fields = [...entry().fields, { name: "logo", required: false, description: "x" }];
    expect(templateProblems(entry({ fields }), html).join()).toMatch(/field logo is an image slot/);
    const bad = entry({ fields: entry().fields.map((field) => field.kind === "color" ? { ...field, default: "red; } body { display: none" } : field) });
    expect(templateProblems(bad, html).join()).toMatch(/default is not a plain colour/);
  });
});

describe("removeUnset", () => {
  it("removes an unset element with everything inside it, nested same-name elements included", () => {
    const source = '<div data-if="a"><div><div>in</div></div></div><div>kept</div>';
    expect(removeUnset(source, () => false)).toBe("<div>kept</div>");
    expect(removeUnset(source, () => true)).toBe(source);
  });

  it("removes a void element alone and leaves set siblings", () => {
    expect(removeUnset('<img data-if="logo" src="x"><p data-if="b">b</p>', (name) => name === "b")).toBe('<p data-if="b">b</p>');
  });

  it("does not read tags inside <style>", () => {
    const source = '<style>p > a { color: red }</style><p data-if="a">x</p>';
    expect(removeUnset(source, () => false)).toBe("<style>p > a { color: red }</style>");
  });
});

describe("fieldValues", () => {
  it("fills defaults, trims, and drops what is empty", () => {
    expect(fieldValues(entry(), { address: "  1847 Larkspur Ln " })).toEqual({ values: { headline: "Just Listed", address: "1847 Larkspur Ln" } });
  });

  it("refuses an unknown field, a missing required one, one too long and a colour that could break out", () => {
    expect(fieldValues(entry(), { address: "x", price: "1" })).toEqual({ error: expect.stringMatching(/has no field price; its fields are headline, address, brand_color/) });
    expect(fieldValues(entry(), {})).toEqual({ error: expect.stringMatching(/needs address/) });
    expect(fieldValues(entry(), { address: "x".repeat(301) })).toEqual({ error: expect.stringMatching(/fits 300/) });
    expect(fieldValues(entry(), { address: "x", brand_color: "red; } body { display:none" })).toEqual({ error: expect.stringMatching(/plain colour/) });
    expect(fieldValues(entry(), { address: "x", brand_color: "rgb(31, 61, 43)" })).toEqual({ values: { headline: "Just Listed", address: "x", brand_color: "rgb(31, 61, 43)" } });
  });
});

describe("fillTemplate", () => {
  it("inserts a field as escaped text, never as markup", () => {
    const page = fillTemplate(template(), { format: "square", fields: { address: '<script>alert("x")</script>' }, images: new Set() });
    expect(page).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(page).not.toContain("<script>");
    expect(escapeHtml(`a&b'c`)).toBe("a&amp;b&#39;c");
  });

  it("removes unset data-if elements, counting a defaulted field as set", () => {
    const values = fieldValues(entry(), { address: "1847 Larkspur Ln" });
    if ("error" in values) throw new Error(values.error);
    const page = fillTemplate(template(), { format: "square", fields: values.values, images: new Set() });
    expect(page).not.toContain("<img");
    expect(page).toContain('<h1 data-if="headline">Just Listed</h1>');
  });

  it("gives photos their render address, the format class to <html>, fonts and page size to <head>, and colours to CSS", () => {
    const page = fillTemplate(template(), { format: "flyer", fields: { address: "x", brand_color: "#123456" }, images: new Set(["photo1"]) });
    expect(page).toContain(`<img src="${RENDER_ORIGIN}/images/photo1"`);
    expect(page).toContain('<html class="format-flyer" lang="en">');
    expect(page).toMatch(/<head>\n<style>@page \{ size: 816px 1056px; margin: 0; \}/);
    expect(page).toContain("--brand: #1f3d2b; --brand: #123456;");
    const empty = fillTemplate(template(), { format: "square", fields: { address: "x" }, images: new Set() });
    // A lone ")" makes the declaration invalid, so the earlier --brand stands (checked in a real Chrome by render.test.ts).
    expect(empty).toContain("--brand: #1f3d2b; --brand: );");
  });

  it("keeps a class the template already gives <html>", () => {
    const page = fillTemplate(template(html.replace('<html lang="en">', '<html class="dark" lang="en">')), { format: "square", fields: { address: "x" }, images: new Set() });
    expect(page).toContain('<html class="format-square dark" lang="en">');
  });
});
