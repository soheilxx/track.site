#!/usr/bin/env node
/**
 * Static-panel comparison for the Living AI Core (docs/15-living-ai-core.md §4, owner supplement
 * §9: "Der Median aus drei mobilen Lighthouse-Läufen verschlechtert sich gegenüber der statischen
 * Chatversion um höchstens drei Performance-Punkte").
 *
 * For every motion setting in --configs the per-user preference is saved through the real settings
 * form (`/app/settings`, "AI motion", audited server action) with the stored owner session, then
 * Lighthouse (mobile preset: mobile form factor, simulated 4× CPU / 1.6 Mbps throttling, mobile UA)
 * audits `/app` N times per viewport variant:
 *
 *   docked  screen emulation widened to 1280 × 800 (DPR 2, mobile/touch emulation kept) — at this
 *           width the Track AI panel is docked and open by default, so the core is mounted and the
 *           compared thing (static tier vs. animated tier) is actually on screen;
 *   phone   Lighthouse's default 412 × 823 emulation — the panel is a closed bottom sheet, the core
 *           is not mounted, so no difference between the settings is expected (control).
 *
 * Which tier the core selects under each variant is verified separately with Playwright under the
 * same emulation (`living-core-budget.mjs --mode tier`), because a Lighthouse report carries no DOM.
 * The preference is restored to `system` at the end (also on failure). Session cookies are passed
 * as an extra header and redacted from the reports afterwards (same as scripts/qa/lighthouse.mjs).
 *
 * Usage (from apps/web):
 *   node scripts/qa/living-core-lighthouse.mjs --base http://localhost:3012 --out <dir> [--runs 3] [--configs off,system,full] [--variants docked,phone] [--cli <lighthouse/cli/index.js>] [--summarize-only]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

export const SHELL = process.env.CHROME_PATH ?? "C:/Users/Soheil/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe";
const AUTH_FILE = path.resolve("e2e/.auth/owner.json");
const DEFAULT_CLI = "C:/Users/Soheil/AppData/Local/npm-cache/_npx/ffe2131771d88588/node_modules/lighthouse/cli/index.js";

const LABELS = { system: "System default", full: "Full", reduced: "Reduced", off: "Off" };
const VARIANTS = {
  docked: { flags: ["--screenEmulation.mobile=true", "--screenEmulation.width=1280", "--screenEmulation.height=800", "--screenEmulation.deviceScaleFactor=2"], viewport: { width: 1280, height: 800 }, mobile: true, dpr: 2 },
  phone: { flags: [], viewport: { width: 412, height: 823 }, mobile: true, dpr: 1.75 },
};

function parseArgs(argv) {
  const a = { base: "http://localhost:3012", out: null, runs: 3, configs: ["off", "system", "full"], variants: ["docked", "phone"], cli: DEFAULT_CLI, summarizeOnly: false, page: "/app" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--base") a.base = v();
    else if (k === "--out") a.out = v();
    else if (k === "--runs") a.runs = Number(v());
    else if (k === "--configs") a.configs = v().split(",").filter(Boolean);
    else if (k === "--variants") a.variants = v().split(",").filter(Boolean);
    else if (k === "--cli") a.cli = v();
    else if (k === "--page") a.page = v();
    else if (k === "--summarize-only") a.summarizeOnly = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.out) throw new Error("--out is required");
  return a;
}

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out);
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, "run.log");
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(logFile, `${line}\n`);
  process.stdout.write(`${line}\n`);
};

// ---------- preference through the real settings form -------------------------------------------

async function setPreference(value) {
  const browser = await chromium.launch({ headless: true, executablePath: SHELL });
  const context = await browser.newContext({ storageState: AUTH_FILE, viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const page = await context.newPage();
  try {
    await page.goto(new URL("/app/settings", args.base).toString(), { waitUntil: "load" });
    const form = page.getByTestId("ai-motion-form");
    await form.waitFor({ state: "visible", timeout: 30000 });
    await form.getByLabel(LABELS[value], { exact: true }).check();
    await form.getByRole("button", { name: "Save motion setting" }).click();
    await form.getByText("Motion setting saved.").waitFor({ state: "attached", timeout: 15000 });
    await page.reload({ waitUntil: "load" });
    const attr = await page.locator("html").getAttribute("data-ai-motion");
    if (attr !== value) throw new Error(`data-ai-motion after save is ${attr}, expected ${value}`);
    log(`preference saved: ai_motion=${value} (html[data-ai-motion]="${attr}" after reload)`);
    return attr;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function verifyTier(config, variantId) {
  const v = VARIANTS[variantId];
  const browser = await chromium.launch({ headless: true, executablePath: SHELL, args: ["--use-angle=d3d11"] });
  const context = await browser.newContext({ storageState: AUTH_FILE, viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.mobile, hasTouch: v.mobile, locale: "en-US" });
  const page = await context.newPage();
  try {
    await page.goto(new URL(args.page, args.base).toString(), { waitUntil: "load" });
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => {
      const core = document.querySelector('[data-testid="living-ai-core"]');
      const panel = document.querySelector('[data-testid="assistant-panel"]');
      return { panelMounted: Boolean(panel), coreMounted: Boolean(core), tier: core ? core.getAttribute("data-tier") : null, pref: core ? core.getAttribute("data-pref") : null, state: core ? core.getAttribute("data-state") : null, canvas: document.querySelector("canvas.lac-gl") !== null, htmlMotion: document.documentElement.getAttribute("data-ai-motion"), viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, coarse: matchMedia("(pointer: coarse)").matches } };
    });
    log(`tier check ${config}/${variantId}: ${JSON.stringify(r)}`);
    return r;
  } finally {
    await context.close();
    await browser.close();
  }
}

// ---------- lighthouse ---------------------------------------------------------------------------

function writeAuthHeaders() {
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
  const now = Date.now() / 1000;
  const cookies = (state.cookies ?? []).filter((c) => !c.expires || c.expires < 0 || c.expires > now);
  if (cookies.length === 0) throw new Error(`no unexpired cookies in ${AUTH_FILE}`);
  const headerFile = path.join(outDir, ".auth-headers.json");
  fs.writeFileSync(headerFile, JSON.stringify({ Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") }));
  return headerFile;
}

function scrubExtraHeaders(outBase) {
  const jsonFile = `${outBase}.report.json`;
  const htmlFile = `${outBase}.report.html`;
  if (!fs.existsSync(jsonFile)) return;
  const lhr = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  const headers = lhr.configSettings?.extraHeaders;
  if (!headers || typeof headers !== "object") return;
  const secrets = Object.values(headers).filter((v) => typeof v === "string" && v.length > 0);
  lhr.configSettings.extraHeaders = Object.fromEntries(Object.keys(headers).map((k) => [k, "<redacted>"]));
  fs.writeFileSync(jsonFile, JSON.stringify(lhr));
  if (fs.existsSync(htmlFile)) {
    let html = fs.readFileSync(htmlFile, "utf8");
    for (const s of secrets) {
      html = html.split(s).join("<redacted>");
      html = html.split(JSON.stringify(s).slice(1, -1)).join("<redacted>");
    }
    fs.writeFileSync(htmlFile, html);
  }
}

function runLighthouse({ url, outBase, variantFlags, headerFile }) {
  const lhArgs = [url, "--output=json", "--output=html", `--output-path=${outBase}`, "--only-categories=performance", "--form-factor=mobile", "--chrome-flags=--headless=new --no-sandbox --use-angle=d3d11", "--quiet", ...variantFlags];
  if (headerFile) lhArgs.push(`--extra-headers=${headerFile}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.resolve(args.cli), ...lhArgs], { env: { ...process.env, CHROME_PATH: SHELL }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  scrubExtraHeaders(outBase);
  let report = null;
  try {
    const lhr = JSON.parse(fs.readFileSync(`${outBase}.report.json`, "utf8"));
    if (lhr.categories && !lhr.runtimeError) report = lhr;
    else if (lhr.runtimeError) log(`runtimeError: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
  } catch {
    // no report
  }
  log(`${path.basename(outBase)} exit=${result.status} report=${report ? "ok" : "missing"} ${seconds}s${report ? ` perf=${Math.round(report.categories.performance.score * 100)} lcp=${Math.round(report.audits["largest-contentful-paint"].numericValue)} tbt=${Math.round(report.audits["total-blocking-time"].numericValue)}` : ""}`);
  if (!report) log(`  stderr tail: ${(result.stderr ?? "").trim().split("\n").slice(-4).join(" | ").slice(0, 400)}`);
  return Boolean(report);
}

function cleanupChromeTemp() {
  const tmp = os.tmpdir();
  let removed = 0;
  for (const name of fs.readdirSync(tmp)) {
    if (!/^lighthouse\.\d+$/.test(name)) continue;
    try {
      fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
      removed++;
    } catch {
      // still locked
    }
  }
  if (removed) log(`removed ${removed} leftover chrome-launcher temp profile(s)`);
}

// ---------- summary ------------------------------------------------------------------------------

const METRICS = { lcp: "largest-contentful-paint", tbt: "total-blocking-time", cls: "cumulative-layout-shift", si: "speed-index", fcp: "first-contentful-paint" };
const median = (values) => {
  const v = values.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const fmtMs = (v) => (v == null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const fmtCls = (v) => (v == null ? "n/a" : v.toFixed(3));
const sign = (v, digits = 0) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${digits ? v.toFixed(digits) : Math.round(v)}`);

function summarize() {
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".report.json"));
  const runs = [];
  for (const f of files) {
    const m = f.match(/^app--([a-z]+)--([a-z]+)--run(\d+)\.report\.json$/);
    if (!m) continue;
    const lhr = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
    const metrics = {};
    for (const [k, id] of Object.entries(METRICS)) metrics[k] = typeof lhr.audits?.[id]?.numericValue === "number" ? lhr.audits[id].numericValue : null;
    const mainThread = lhr.audits?.["mainthread-work-breakdown"]?.numericValue ?? null;
    const bootup = lhr.audits?.["bootup-time"]?.numericValue ?? null;
    runs.push({ file: f, config: m[1], variant: m[2], run: Number(m[3]), perf: lhr.categories?.performance?.score != null ? Math.round(lhr.categories.performance.score * 100) : null, metrics, mainThreadMs: mainThread, bootupMs: bootup, runtimeError: lhr.runtimeError ?? null, warnings: lhr.runWarnings ?? [], screen: lhr.configSettings?.screenEmulation, throttling: lhr.configSettings?.throttlingMethod, formFactor: lhr.configSettings?.formFactor, lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime });
  }
  runs.sort((a, b) => a.variant.localeCompare(b.variant) || a.config.localeCompare(b.config) || a.run - b.run);
  const groups = {};
  for (const r of runs) {
    const key = `${r.variant}/${r.config}`;
    (groups[key] ??= { variant: r.variant, config: r.config, runs: [] }).runs.push(r);
  }
  for (const g of Object.values(groups)) {
    const ok = g.runs.filter((r) => !r.runtimeError);
    g.median = { perf: median(ok.map((r) => r.perf)), lcp: median(ok.map((r) => r.metrics.lcp)), tbt: median(ok.map((r) => r.metrics.tbt)), cls: median(ok.map((r) => r.metrics.cls)), si: median(ok.map((r) => r.metrics.si)), fcp: median(ok.map((r) => r.metrics.fcp)), mainThreadMs: median(ok.map((r) => r.mainThreadMs)), bootupMs: median(ok.map((r) => r.bootupMs)) };
  }
  const tierFile = path.join(outDir, "tier-checks.json");
  const tiers = fs.existsSync(tierFile) ? JSON.parse(fs.readFileSync(tierFile, "utf8")) : {};
  const summary = { generatedAt: new Date().toISOString(), lighthouseVersion: runs[0]?.lighthouseVersion ?? null, page: args.page, runsPerGroup: args.runs, groups, tiers, deltas: {} };
  for (const variant of new Set(runs.map((r) => r.variant))) {
    const base = groups[`${variant}/off`];
    if (!base) continue;
    for (const config of ["system", "full", "reduced"]) {
      const g = groups[`${variant}/${config}`];
      if (!g) continue;
      summary.deltas[`${variant}/${config}-vs-off`] = { perf: g.median.perf != null && base.median.perf != null ? g.median.perf - base.median.perf : null, lcp: g.median.lcp != null && base.median.lcp != null ? g.median.lcp - base.median.lcp : null, tbt: g.median.tbt != null && base.median.tbt != null ? g.median.tbt - base.median.tbt : null, cls: g.median.cls != null && base.median.cls != null ? g.median.cls - base.median.cls : null, withinThreePoints: g.median.perf != null && base.median.perf != null ? base.median.perf - g.median.perf <= 3 : null };
    }
  }
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  const lines = [];
  lines.push("# Lighthouse static-panel comparison — Living AI Core");
  lines.push("");
  lines.push(`Generated ${summary.generatedAt} from the \`app--<setting>--<variant>--runN.report.json\` files in this directory (Lighthouse ${summary.lighthouseVersion ?? "?"}, mobile form factor, simulated throttling, performance category only, stored owner session). Scores are \`categories.performance.score × 100\`, metrics \`audits.<id>.numericValue\`; the median of the ${args.runs} runs of a group is the middle value. Variant \`docked\` = mobile emulation widened to 1280 × 800 @ DPR 2 (panel docked and open, core mounted); \`phone\` = default 412 × 823 @ DPR 1.75 (panel closed, core not mounted — control). Chrome: \`${SHELL}\` with \`--headless=new --use-angle=d3d11\`.`);
  lines.push("");
  lines.push("## Medians per setting and variant");
  lines.push("");
  lines.push("| Variant | Setting | Tier verified (Playwright, same emulation) | Perf (runs) | LCP | TBT | CLS | Speed Index | FCP | Main-thread work | Script boot-up |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const g of Object.values(groups)) {
    const t = tiers[`${g.config}/${g.variant}`];
    const tierText = t ? (t.coreMounted ? `${t.tier} (pref ${t.pref}, canvas ${t.canvas})` : "core not mounted (panel closed)") : "not checked";
    lines.push(`| ${g.variant} | ${g.config} | ${tierText} | **${g.median.perf ?? "n/a"}** (${g.runs.map((r) => r.perf ?? "err").join("/")}) | ${fmtMs(g.median.lcp)} | ${fmtMs(g.median.tbt)} | ${fmtCls(g.median.cls)} | ${fmtMs(g.median.si)} | ${fmtMs(g.median.fcp)} | ${fmtMs(g.median.mainThreadMs)} | ${fmtMs(g.median.bootupMs)} |`);
  }
  lines.push("");
  lines.push("## Delta against the static panel (setting `off`), medians");
  lines.push("");
  lines.push("| Comparison | Perf points | LCP | TBT | CLS | Target (≤ 3 points worse) |");
  lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
  for (const [k, d] of Object.entries(summary.deltas)) {
    lines.push(`| ${k} | ${sign(d.perf)} | ${d.lcp == null ? "n/a" : sign(d.lcp)} ms | ${d.tbt == null ? "n/a" : sign(d.tbt)} ms | ${d.cls == null ? "n/a" : sign(d.cls, 3)} | ${d.withinThreePoints == null ? "n/a" : d.withinThreePoints ? "pass" : "FAIL"} |`);
  }
  lines.push("");
  lines.push("## Per-run values");
  lines.push("");
  lines.push("| Report | Perf | LCP | TBT | CLS | SI | FCP | Main-thread | Boot-up | Screen | Warnings |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const r of runs) {
    lines.push(`| \`${r.file}\` | ${r.perf ?? "err"} | ${fmtMs(r.metrics.lcp)} | ${fmtMs(r.metrics.tbt)} | ${fmtCls(r.metrics.cls)} | ${fmtMs(r.metrics.si)} | ${fmtMs(r.metrics.fcp)} | ${fmtMs(r.mainThreadMs)} | ${fmtMs(r.bootupMs)} | ${r.screen ? `${r.screen.width}×${r.screen.height}@${r.screen.deviceScaleFactor}${r.screen.mobile ? " mobile" : ""}` : "?"} | ${r.runtimeError ? `runtimeError ${r.runtimeError.code}` : r.warnings.map((w) => w.slice(0, 60)).join("; ")} |`);
  }
  lines.push("");
  fs.writeFileSync(path.join(outDir, "summary.md"), lines.join("\n"));
  return summary;
}

// ---------- main ---------------------------------------------------------------------------------

if (!args.summarizeOnly) {
  if (!fs.existsSync(args.cli)) throw new Error(`lighthouse cli not found: ${args.cli}`);
  log(`living-core lighthouse: base=${args.base} cli=${args.cli} chrome=${SHELL} runs=${args.runs} configs=${args.configs.join(",")} variants=${args.variants.join(",")}`);
  const headerFile = writeAuthHeaders();
  const tierChecks = {};
  let failures = 0;
  try {
    for (const config of args.configs) {
      await setPreference(config);
      for (const variantId of args.variants) {
        tierChecks[`${config}/${variantId}`] = await verifyTier(config, variantId);
        fs.writeFileSync(path.join(outDir, "tier-checks.json"), JSON.stringify(tierChecks, null, 2));
        for (let i = 1; i <= args.runs; i++) {
          const ok = runLighthouse({ url: new URL(args.page, args.base).toString(), outBase: path.join(outDir, `app--${config}--${variantId}--run${i}`), variantFlags: VARIANTS[variantId].flags, headerFile });
          if (!ok) failures++;
        }
      }
    }
  } finally {
    if (fs.existsSync(headerFile)) fs.unlinkSync(headerFile);
    cleanupChromeTemp();
    try {
      await setPreference("system");
      log("preference restored to system");
    } catch (e) {
      log(`FAILED to restore the preference: ${String(e).slice(0, 200)}`);
    }
  }
  log(`runs finished with ${failures} failure(s)`);
}
const s = summarize();
log(`summary written: ${Object.keys(s.groups).length} group(s), ${Object.keys(s.deltas).length} delta(s)`);
