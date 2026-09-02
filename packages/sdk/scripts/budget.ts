import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** CI gate: the core tracker must stay at or below 30 KB gzip. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "dist", "tracker.js");
if (!existsSync(file)) {
  console.error("dist/tracker.js missing; run the build first");
  process.exit(1);
}
const raw = readFileSync(file);
const gz = gzipSync(raw, { level: 9 }).length;
const limit = 30 * 1024;
console.error(`tracker.js: ${raw.length} bytes raw, ${gz} bytes gzip (limit ${limit})`);
if (gz > limit) {
  console.error("SDK bundle budget exceeded");
  process.exit(1);
}
