// Generates the temporary spec files of the cross-browser matrix in apps/web/e2e (task E2, 2026-09-05):
//   marketing-xb.tmp.spec.ts, app-xb.tmp.spec.ts, visual-xb.tmp.spec.ts  — byte-for-byte copies of the committed specs
//                                                                            with the hook below inserted after the imports
//   xbrowser-lac.tmp.spec.ts, xbrowser-mobile.tmp.spec.ts                 — the matrix's own specs (sources in this directory) + hook
// Usage: node docs/qa/2026-09-05/followup/browsers/make-tmp-specs.mjs [--remove]
// The hook (a) restricts the files to the `xb-*` projects of playwright.xbrowser.config.mjs, so the permanent
// playwright.config.ts projects skip them, and (b) in WebKit strips the response headers that make WebKit upgrade
// http://localhost requests to https (see summary.md, finding B1). Chromium and Firefox runs see unmodified responses.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WEB = "C:/Users/Soheil/Downloads/track.site/apps/web";
const E2E = path.join(WEB, "e2e");
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const HOOK = `
/*
 * Cross-browser matrix hook (task E2, docs/qa/2026-09-05/followup/browsers) — temporary file, deleted after the run.
 * The production build answers every route with \`Content-Security-Policy: …; upgrade-insecure-requests\` (and HSTS), baked
 * into .next/routes-manifest.json at build time. Chromium and Firefox treat http://localhost as a potentially trustworthy
 * origin and do not upgrade; WebKit does, so every stylesheet, script, font, same-origin link and form post is sent to
 * https://localhost:3013 and fails ("SSL connect error"; docs/qa/2026-09-05/followup/browsers/webkit-header-strip-probe.json).
 * In WebKit only, this hook strips that directive (and HSTS) from the responses of the server under test and answers an
 * already-upgraded request over http. Everything below the hook is the unmodified original spec.
 */
test.beforeEach(async ({ context, browserName }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("xb-"), "cross-browser matrix only (playwright.xbrowser.config.mjs)");
  if (browserName !== "webkit") return;
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    try {
      const response = await route.fetch({ url: url.replace(/^https:\\/\\/(localhost|127\\.0\\.0\\.1):3013\\//, "http://$1:3013/"), maxRedirects: 0 });
      const headers = { ...response.headers() };
      delete headers["strict-transport-security"];
      if (headers["content-security-policy"]) headers["content-security-policy"] = headers["content-security-policy"].replace(/;\\s*upgrade-insecure-requests/, "");
      await route.fulfill({ response, headers });
    } catch {
      // a request still in flight when the test ends (Next.js route prefetch): not a test failure
      await route.abort().catch(() => undefined);
    }
  });
});
test.afterEach(async ({ context, browserName }) => {
  if (browserName === "webkit") await context.unrouteAll({ behavior: "ignoreErrors" });
});
`;

const COPIES = [
  ["marketing.spec.ts", "marketing-xb.tmp.spec.ts"],
  ["app.spec.ts", "app-xb.tmp.spec.ts"],
  ["visual.spec.ts", "visual-xb.tmp.spec.ts"],
];
const OWN = [
  ["xbrowser-lac.tmp.spec.ts.src", "xbrowser-lac.tmp.spec.ts"],
  ["xbrowser-mobile.tmp.spec.ts.src", "xbrowser-mobile.tmp.spec.ts"],
];

function withHook(source) {
  const lines = source.split("\n");
  // insert after the import block (the last line that starts with `import ` or closes a multi-line import)
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\b/.test(lines[i]) || (last === i - 1 && /^\s*[\w{},\s*]+\bfrom\b/.test(lines[i]))) last = i;
  }
  return [...lines.slice(0, last + 1), HOOK, ...lines.slice(last + 1)].join("\n");
}

const remove = process.argv.includes("--remove");
for (const [, target] of [...COPIES, ...OWN]) {
  const file = path.join(E2E, target);
  if (remove) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`removed ${target}`);
    }
    continue;
  }
}
if (!remove) {
  // the committed spec files (HEAD), not the working tree: another task extends app.spec.ts in parallel during this run
  const head = execSync("git rev-parse --short HEAD", { cwd: WEB, encoding: "utf8" }).trim();
  for (const [source, target] of COPIES) {
    const original = execSync(`git show HEAD:apps/web/e2e/${source}`, { cwd: WEB, encoding: "utf8", maxBuffer: 1 << 24 });
    fs.writeFileSync(path.join(E2E, target), withHook(original));
    console.log(`wrote ${target} (${source} at ${head} + hook)`);
  }
  for (const [source, target] of OWN) {
    const original = fs.readFileSync(path.join(HERE, source), "utf8");
    fs.writeFileSync(path.join(E2E, target), withHook(original));
    console.log(`wrote ${target} (${source} + hook)`);
  }
}
