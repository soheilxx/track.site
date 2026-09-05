/**
 * Converts every PNG in the given directories to WebP (≤ 150 KB, quality lowered until it fits) and removes the PNG.
 * Usage: node docs/qa/2026-09-05/followup/keyboard/webp.mjs <dir> [<dir> …]   (sharp from apps/web)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const sharp = createRequire(path.join(root, "apps/web/package.json"))("sharp");
const MAX = 150 * 1024;

for (const dir of process.argv.slice(2)) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".png"))) {
    const src = path.join(dir, file);
    const out = src.replace(/\.png$/, ".webp");
    let quality = 82;
    let buf = await sharp(src).webp({ quality }).toBuffer();
    while (buf.length > MAX && quality > 30) {
      quality -= 8;
      buf = await sharp(src).webp({ quality }).toBuffer();
    }
    fs.writeFileSync(out, buf);
    fs.unlinkSync(src);
    process.stdout.write(`${path.relative(root, out).replace(/\\/g, "/")} ${(buf.length / 1024).toFixed(1)} KB (q${quality})\n`);
  }
}
