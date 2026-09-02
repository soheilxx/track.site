import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderIntegrationMatrix } from "../src/matrix.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = path.join(root, "docs", "integrations-matrix.md");
writeFileSync(out, renderIntegrationMatrix());
console.error(`wrote ${out}`);
