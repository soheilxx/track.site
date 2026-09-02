// Copies the built browser SDK into public/cdn/v1 so Next.js (and the CDN host) serve it as a static asset.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../../packages/sdk/dist");
const dest = path.resolve(here, "../public/cdn/v1");
mkdirSync(dest, { recursive: true });
let copied = 0;
for (const f of ["tracker.js", "tracker.js.map", "build-info.json"]) {
  const from = path.join(src, f);
  if (existsSync(from)) {
    copyFileSync(from, path.join(dest, f));
    copied++;
  }
}
if (copied === 0) console.error("warning: packages/sdk/dist is empty; run pnpm --filter @track-site/sdk build first");
else console.error(`sdk synced (${copied} files) -> public/cdn/v1`);
