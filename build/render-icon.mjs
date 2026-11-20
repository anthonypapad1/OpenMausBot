// Renders build/icon.svg into every app icon file electron-builder reads:
// icon-1024.png, icon.iconset/ and icon.icns (macOS, via iconutil), icon.ico (Windows).
// Linux reads icon.svg itself. Run on a Mac after editing the SVG: `node build/render-icon.mjs`.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(path.join(buildDir, "icon.svg"), "utf8");
const png = (size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

writeFileSync(path.join(buildDir, "icon-1024.png"), png(1024));

// iconutil requires exactly these names: each point size at 1x and 2x.
const iconset = path.join(buildDir, "icon.iconset");
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset);
for (const points of [16, 32, 128, 256, 512]) {
  writeFileSync(path.join(iconset, `icon_${points}x${points}.png`), png(points));
  writeFileSync(path.join(iconset, `icon_${points}x${points}@2x.png`), png(points * 2));
}
execFileSync("iconutil", ["--convert", "icns", "--output", path.join(buildDir, "icon.icns"), iconset], { stdio: "inherit" });

// ICO with PNG-compressed entries (supported since Windows Vista). A width/height byte of 0 means 256.
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = icoSizes.map(png);
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
const entries = Buffer.alloc(16 * images.length);
let offset = header.length + entries.length;
images.forEach((image, index) => {
  const entry = 16 * index;
  entries.writeUInt8(icoSizes[index] % 256, entry);
  entries.writeUInt8(icoSizes[index] % 256, entry + 1);
  entries.writeUInt16LE(1, entry + 4);
  entries.writeUInt16LE(32, entry + 6);
  entries.writeUInt32LE(image.length, entry + 8);
  entries.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(path.join(buildDir, "icon.ico"), Buffer.concat([header, entries, ...images]));
