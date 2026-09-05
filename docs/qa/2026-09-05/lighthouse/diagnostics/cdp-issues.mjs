// Collects DevTools "Issues" (CDP Audits domain) and console errors per page, to name the exact cause
// behind Lighthouse's `inspector-issues` / `errors-in-console` audits. Uses Playwright's chromium
// (headless shell). Run from apps/web so @playwright/test resolves.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/Soheil/Downloads/track.site/apps/web/package.json");
const { chromium } = require("@playwright/test");

const base = "http://localhost:3002";
const pages = ["/en", "/en/pricing", "/en/tracking-knowledge", "/en/tracking-knowledge/consent-mode-v2-guide", "/en/integrations", "/en/login", "/de"];
const authFile = "C:/Users/Soheil/Downloads/track.site/apps/web/e2e/.auth/owner.json";
const out = {};

const browser = await chromium.launch({ headless: true });
async function inspect(path, storageState) {
  const context = await browser.newContext({ storageState, viewport: { width: 412, height: 823 }, isMobile: true, deviceScaleFactor: 1.75 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const issues = [];
  const consoleMsgs = [];
  cdp.on("Audits.issueAdded", (e) => {
    const d = e.issue.details ?? {};
    const csp = d.contentSecurityPolicyIssueDetails;
    issues.push({
      code: e.issue.code,
      ...(csp
        ? { blockedURL: csp.blockedURL, violatedDirective: csp.violatedDirective, isReportOnly: csp.isReportOnly, violationType: csp.contentSecurityPolicyViolationType, source: csp.sourceCodeLocation }
        : { details: JSON.stringify(d).slice(0, 400) }),
    });
  });
  await cdp.send("Audits.enable");
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300), location: m.location()?.url });
  });
  page.on("pageerror", (err) => consoleMsgs.push({ type: "pageerror", text: String(err).slice(0, 300) }));
  const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const lcpInfo = await page.evaluate(() => {
    const html = document.documentElement;
    return { lang: html.lang, scrollWidth: html.scrollWidth, clientWidth: html.clientWidth, title: document.title };
  });
  out[path] = { status: res?.status(), url: page.url(), ...lcpInfo, issues, console: consoleMsgs };
  await context.close();
}

for (const p of pages) await inspect(p);
await inspect("/app", authFile);
await browser.close();
fs.writeFileSync(process.argv[2] ?? "cdp-issues.json", JSON.stringify(out, null, 2));
for (const [p, v] of Object.entries(out)) {
  console.log(`== ${p} status=${v.status} lang=${v.lang} issues=${v.issues.length} console=${v.console.length}`);
  for (const i of v.issues) console.log("   issue:", JSON.stringify(i).slice(0, 400));
  for (const c of v.console) console.log("   console:", JSON.stringify(c).slice(0, 300));
}
