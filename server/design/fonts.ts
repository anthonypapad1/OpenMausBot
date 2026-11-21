// The font families a template may name besides the system's own: the ones the app already ships for its UI
// (@fontsource-variable, see src/styles.css), served to the render from memory. scripts/bundle-server.mjs copies these
// files to dist-server/design/fonts/; a checkout reads them from node_modules.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RENDER_ORIGIN } from "./origin.ts";

export interface BundledFont { family: string; file: string; style: "normal" | "italic"; package: string }

/** Latin subsets, variable weight 100–900. Keep in step with the copy in scripts/bundle-server.mjs. */
export const BUNDLED_FONTS: readonly BundledFont[] = [
  { family: "Inter", file: "inter-latin-wght-normal.woff2", style: "normal", package: "inter" },
  { family: "Inter", file: "inter-latin-wght-italic.woff2", style: "italic", package: "inter" },
  { family: "Geist", file: "geist-latin-wght-normal.woff2", style: "normal", package: "geist" },
  { family: "Geist", file: "geist-latin-wght-italic.woff2", style: "italic", package: "geist" },
  { family: "Geist Mono", file: "geist-mono-latin-wght-normal.woff2", style: "normal", package: "geist-mono" },
];

export const fontUrl = (font: BundledFont) => `${RENDER_ORIGIN}/fonts/${font.file}`;

/** Where `font`'s file is: under design/fonts beside the bundled server, else the checkout's node_modules. */
export function fontPath(font: BundledFont): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "design", "fonts", font.file),
    join(here, "..", "..", "node_modules", "@fontsource-variable", font.package, "files", font.file),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** The @font-face rules for every bundled font this install has. */
export function fontFaceCss(): string {
  return BUNDLED_FONTS.filter((font) => fontPath(font))
    .map((font) => `@font-face { font-family: "${font.family}"; font-style: ${font.style}; font-weight: 100 900; font-display: block; src: url("${fontUrl(font)}") format("woff2"); }`)
    .join("\n");
}

/** The bundled fonts' bytes by the URL a page asks for them at. */
export function fontAssets(): Map<string, { mime: string; bytes: Buffer }> {
  const assets = new Map<string, { mime: string; bytes: Buffer }>();
  for (const font of BUNDLED_FONTS) {
    const path = fontPath(font);
    if (path) assets.set(fontUrl(font), { mime: "font/woff2", bytes: readFileSync(path) });
  }
  return assets;
}
