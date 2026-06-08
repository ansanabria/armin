/**
 * Rasterize assets/icons/icon.svg into platform app-icon files.
 * Run: node scripts/build-logo-svg.mjs && node scripts/generate-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
import png2icons from "png2icons";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const iconsDir = path.join(root, "assets", "icons");

const svgPath = path.join(iconsDir, "icon.svg");
const svg = fs.readFileSync(svgPath, "utf8");

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
  });
  return resvg.render().asPng();
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngBuffers = new Map();

for (const size of sizes) {
  const png = renderPng(size);
  const out = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(out, png);
  pngBuffers.set(size, png);
  console.log(`wrote ${path.relative(root, out)}`);
}

fs.writeFileSync(path.join(iconsDir, "icon.png"), pngBuffers.get(1024));
console.log("wrote assets/icons/icon.png");

const ico = await pngToIco(
  [16, 24, 32, 48, 64, 128, 256].map((size) =>
    path.join(iconsDir, `icon-${size}.png`),
  ),
);
fs.writeFileSync(path.join(iconsDir, "icon.ico"), ico);
console.log("wrote assets/icons/icon.ico");

const icns = png2icons.createICNS(pngBuffers.get(1024), png2icons.BILINEAR, 0);
if (!icns) {
  throw new Error("Failed to generate icon.icns");
}
fs.writeFileSync(path.join(iconsDir, "icon.icns"), icns);
console.log("wrote assets/icons/icon.icns");

fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "public/favicon.png"), pngBuffers.get(32));
console.log("wrote public/favicon.png");
