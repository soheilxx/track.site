import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderIntegrationMatrix } from "../src/matrix.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../docs/integrations-matrix.md");
const rendered = renderIntegrationMatrix();
if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== rendered) {
    console.error(`docs/integrations-matrix.md is out of date: run \`pnpm --filter @track-site/connectors matrix\` and commit the result`);
    process.exit(1);
  }
  console.error("docs/integrations-matrix.md is in sync with the connectors");
} else {
  writeFileSync(out, rendered);
  console.error(`wrote ${out}`);
}
