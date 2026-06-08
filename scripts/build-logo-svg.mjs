/**
 * Build path-based logo SVGs from Source Serif 4 Semibold (600).
 * Run: node scripts/build-logo-svg.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const fontPath = path.join(
  root,
  "assets/fonts/source-serif-4-latin-600-normal.woff",
);

const fontBuffer = fs.readFileSync(fontPath);
const font = opentype.parse(
  fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength,
  ),
);

const GLYPH_SIZE = 1000;
const glyph = font.getPath("A", 0, 0, GLYPH_SIZE);
const bb = glyph.getBoundingBox();
const glyphWidth = bb.x2 - bb.x1;
const glyphHeight = bb.y2 - bb.y1;

function buildMarkSvg({ size, fill, background }) {
  const padding = size * 0.14;
  const avail = size - padding * 2;
  const scale = avail / glyphHeight;
  const tx = (size - glyphWidth * scale) / 2 - bb.x1 * scale;
  const ty = (size - glyphHeight * scale) / 2 - bb.y1 * scale;
  const d = glyph.toPathData(2);

  const bg = background
    ? `  <rect width="${size}" height="${size}" fill="${background}" />\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Armin">
${bg}  <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)})">
    <path d="${d}" fill="${fill}" />
  </g>
</svg>
`;
}

const brandSvg = buildMarkSvg({
  size: 512,
  fill: "#100f0f",
});
const iconSvg = buildMarkSvg({
  size: 1024,
  fill: "#24837b",
  background: "#fffcf0",
});

fs.writeFileSync(path.join(root, "assets/brand/armin-a.svg"), brandSvg);
fs.writeFileSync(path.join(root, "assets/icons/icon.svg"), iconSvg);

console.log("wrote assets/brand/armin-a.svg");
console.log("wrote assets/icons/icon.svg");
