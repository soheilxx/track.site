// Converts the PNG captures of the cross-browser matrix to WebP ≤ 150 KB (evidence rule of docs/qa/2026-09-05/README.md).
// Usage (from apps/web, sharp is a dependency there): node ../../docs/qa/2026-09-05/followup/browsers/to-webp.mjs <src dir> <dest dir> [max px height]
// Quality steps down from 82 until the file fits; a capture that still does not fit is downscaled (width kept ≥ 375 px).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("C:/Users/Soheil/Downloads/track.site/apps/web/package.json");
const sharp = require("sharp");

const [src, dest, maxHeightArg] = process.argv.slice(2);
const LIMIT = 150 * 1024;
const maxHeight = Number(maxHeightArg ?? 2600);
fs.mkdirSync(dest, { recursive: true });

const files = fs.readdirSync(src).filter((f) => f.endsWith(".png"));
const rows = [];
for (const file of files) {
  const input = path.join(src, file);
  const meta = await sharp(input).metadata();
  let width = meta.width;
  let height = Math.min(meta.height, maxHeight);
  let buffer = null;
  let quality = 82;
  let scale = 1;
  for (let attempt = 0; attempt < 12; attempt++) {
    let pipeline = sharp(input).extract({ left: 0, top: 0, width: meta.width, height: Math.min(meta.height, maxHeight) });
    if (scale < 1) pipeline = pipeline.resize({ width: Math.max(375, Math.round(meta.width * scale)) });
    buffer = await pipeline.webp({ quality, effort: 5 }).toBuffer();
    if (buffer.length <= LIMIT) break;
    if (quality > 40) quality -= 10;
    else scale *= 0.85;
  }
  const out = path.join(dest, file.replace(/\.png$/, ".webp"));
  fs.writeFileSync(out, buffer);
  const outMeta = await sharp(buffer).metadata();
  width = outMeta.width;
  height = outMeta.height;
  rows.push({ file: path.basename(out), sourcePx: [meta.width, meta.height], outputPx: [width, height], bytes: buffer.length, quality, scale: Number(scale.toFixed(3)), fits: buffer.length <= LIMIT });
}
fs.writeFileSync(path.join(dest, "_conversion.json"), JSON.stringify(rows, null, 2));
for (const r of rows) console.log(`${r.file}: ${r.sourcePx.join("x")} → ${r.outputPx.join("x")} q${r.quality} ${r.bytes} B ${r.fits ? "ok" : "OVER LIMIT"}`);
