#!/usr/bin/env node
/**
 * Lighthouse runner for the QA evidence pack (docs/qa/<date>/lighthouse).
 *
 * Runs the Lighthouse CLI N times per page (mobile preset with simulated throttling by default,
 * `--preset=desktop` for desktop entries), writes the raw JSON + HTML reports, then computes the
 * per-page medians of the four category scores and of the lab metrics (LCP, TBT as INP proxy, CLS,
 * Speed Index) and writes `summary.json` + `summary.md` including the top opportunities and the
 * failing audits of the categories that miss their target.
 *
 * Nothing in the summary is typed by hand: every number comes from `categories.*.score` and
 * `audits.*.numericValue` of the JSON files in the output directory.
 *
 * Usage (from apps/web):
 *   node scripts/qa/lighthouse.mjs \
 *     --base http://localhost:3002 \
 *     --out ../../docs/qa/2026-09-05/lighthouse \
 *     --runs 3 \
 *     --mobile home=/en,pricing=/en/pricing \
 *     --desktop home=/en \
 *     --auth-mobile app-overview=/app --auth-file e2e/.auth/owner.json --auth-runs 1
 *
 *   node scripts/qa/lighthouse.mjs --out ../../docs/qa/2026-09-05/lighthouse --summarize-only
 *
 * Options:
 *   --base <url>            origin of the running production server (required for runs)
 *   --out <dir>             output directory (created); JSON/HTML reports + summary.{json,md}
 *   --runs <n>              runs per mobile page (default 3); --desktop-runs <n> (default 1); --auth-runs <n> (default 1)
 *   --mobile id=path,...    pages to audit with the default mobile emulation (throttling on)
 *   --desktop id=path,...   pages to audit with --preset=desktop
 *   --auth-mobile id=path   pages that need the stored Playwright session (cookies from --auth-file)
 *   --auth-file <path>      Playwright storageState JSON (e2e/.auth/owner.json); unexpired cookies become a Cookie header
 *   --cli <path>            path to lighthouse/cli/index.js (default: `npx --yes lighthouse@latest`, needs a shell)
 *   --chrome <path>         Chrome binary (default: Playwright's chromium via @playwright/test)
 *   --summarize-only        do not run Lighthouse, only rebuild summary.{json,md} from the JSON files in --out
 *   --append <file.md>      Markdown appended verbatim to summary.md (hand-written findings; survives re-runs)
 *   --targets a11y=95,bp=95,seo=95,perf=95,lcp=2500,cls=0.1   pass/fail thresholds (defaults shown)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = { runs: 3, desktopRuns: 1, authRuns: 1, mobile: [], desktop: [], authMobile: [], targets: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--base": args.base = next(); break;
      case "--out": args.out = next(); break;
      case "--runs": args.runs = Number(next()); break;
      case "--desktop-runs": args.desktopRuns = Number(next()); break;
      case "--auth-runs": args.authRuns = Number(next()); break;
      case "--mobile": args.mobile.push(...parsePages(next())); break;
      case "--desktop": args.desktop.push(...parsePages(next())); break;
      case "--auth-mobile": args.authMobile.push(...parsePages(next())); break;
      case "--auth-file": args.authFile = next(); break;
      case "--cli": args.cli = next(); break;
      case "--chrome": args.chrome = next(); break;
      case "--summarize-only": args.summarizeOnly = true; break;
      case "--append": args.append = next(); break;
      case "--targets":
        for (const kv of next().split(",")) {
          const [k, v] = kv.split("=");
          args.targets[k] = Number(v);
        }
        break;
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  return args;
}

function parsePages(spec) {
  return spec.split(",").filter(Boolean).map((entry) => {
    const idx = entry.indexOf("=");
    if (idx < 0) throw new Error(`page spec must be id=path, got ${entry}`);
    return { id: entry.slice(0, idx), path: entry.slice(idx + 1) };
  });
}

function resolveChrome(explicit) {
  if (explicit) return explicit;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = require("@playwright/test");
  return pw.chromium.executablePath();
}

/** Builds a Lighthouse --extra-headers file from a Playwright storageState (unexpired cookies only). */
function writeAuthHeaders(authFile, outDir) {
  const state = JSON.parse(fs.readFileSync(authFile, "utf8"));
  const now = Date.now() / 1000;
  const cookies = (state.cookies ?? []).filter((c) => !c.expires || c.expires < 0 || c.expires > now);
  if (cookies.length === 0) throw new Error(`no unexpired cookies in ${authFile}`);
  const headerFile = path.join(outDir, ".auth-headers.json");
  fs.writeFileSync(headerFile, JSON.stringify({ Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") }));
  return { headerFile, cookieNames: cookies.map((c) => c.name) };
}

function runLighthouse({ url, outBase, preset, headerFile, cli, chrome, log }) {
  const lhArgs = [
    url,
    "--output=json",
    "--output=html",
    `--output-path=${outBase}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--chrome-flags=--headless=new --no-sandbox",
    "--quiet",
  ];
  if (preset === "desktop") lhArgs.push("--preset=desktop");
  if (headerFile) lhArgs.push(`--extra-headers=${headerFile}`);

  const env = { ...process.env, CHROME_PATH: chrome };
  const started = Date.now();
  let result;
  if (cli) {
    result = spawnSync(process.execPath, [cli, ...lhArgs], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } else {
    // npx needs a shell on Windows; quote every argument that contains spaces
    const quoted = lhArgs.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
    result = spawnSync(`npx --yes lighthouse@latest ${quoted}`, { env, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (headerFile) scrubExtraHeaders(outBase);
  // Success = a complete report was written. On Windows chrome-launcher often exits 1 *after* the
  // report is saved because `rmSync` of its temp profile hits EPERM (file still locked); that is a
  // cleanup problem, not a measurement problem, so the report decides.
  const reportFile = `${outBase}.report.json`;
  let report = null;
  try {
    const lhr = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    if (lhr.categories && !lhr.runtimeError) report = lhr;
    else if (lhr.runtimeError) log(`runtimeError in ${reportFile}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
  } catch {
    // no report
  }
  const line = `[${new Date().toISOString()}] ${preset} ${url} -> ${path.basename(outBase)} exit=${result.status} report=${report ? "ok" : "missing"} ${seconds}s`;
  log(line);
  if (result.status !== 0) {
    const tail = (result.stderr ?? "").trim().split("\n").slice(-6).join("\n");
    log(report ? `  (non-zero exit after the report was written; stderr tail: ${tail.split("\n")[0]?.slice(0, 200) ?? ""})` : `FAILED: ${url}\n${tail}\n${result.stdout?.slice(-1500) ?? ""}`);
  }
  return Boolean(report);
}

/**
 * Lighthouse copies `--extra-headers` into `configSettings.extraHeaders` of the LHR (and the HTML
 * report embeds the LHR), so an authenticated run would store the session cookie in the evidence
 * pack. Replace the header values in both files before anything else reads them.
 */
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
      html = html.split(JSON.stringify(s).slice(1, -1)).join("<redacted>"); // JSON-escaped form inside the embedded LHR
    }
    fs.writeFileSync(htmlFile, html);
  }
}

/** Removes the temp profiles chrome-launcher could not delete itself (see runLighthouse). */
function cleanupChromeTemp(log) {
  const tmp = os.tmpdir();
  let removed = 0;
  for (const name of fs.readdirSync(tmp)) {
    if (!/^lighthouse\.\d+$/.test(name)) continue;
    try {
      fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
      removed++;
    } catch {
      // still locked; left for the OS temp cleanup
    }
  }
  if (removed) log(`removed ${removed} leftover chrome-launcher temp profile(s) from ${tmp}`);
}

// ---------- summary -------------------------------------------------------------------------

const METRICS = {
  lcp: "largest-contentful-paint",
  tbt: "total-blocking-time",
  cls: "cumulative-layout-shift",
  si: "speed-index",
  fcp: "first-contentful-paint",
  inp: "interaction-to-next-paint",
};

function median(values) {
  const v = values.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function score100(cat) {
  return cat && typeof cat.score === "number" ? Math.round(cat.score * 100) : null;
}

function readRun(file) {
  const lhr = JSON.parse(fs.readFileSync(file, "utf8"));
  const base = path.basename(file).replace(/\.report\.json$/, "");
  const m = base.match(/^(.*)--(mobile|desktop)--run(\d+)$/);
  if (!m) return null;
  const metrics = {};
  for (const [key, auditId] of Object.entries(METRICS)) {
    const a = lhr.audits?.[auditId];
    metrics[key] = a && typeof a.numericValue === "number" ? a.numericValue : null;
  }
  return {
    file,
    html: file.replace(/\.report\.json$/, ".report.html"),
    id: m[1],
    preset: m[2],
    run: Number(m[3]),
    url: lhr.finalDisplayedUrl ?? lhr.requestedUrl,
    fetchTime: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
    runtimeError: lhr.runtimeError ?? null,
    runWarnings: lhr.runWarnings ?? [],
    throttlingMethod: lhr.configSettings?.throttlingMethod,
    formFactor: lhr.configSettings?.formFactor,
    scores: {
      performance: score100(lhr.categories?.performance),
      accessibility: score100(lhr.categories?.accessibility),
      "best-practices": score100(lhr.categories?.["best-practices"]),
      seo: score100(lhr.categories?.seo),
    },
    metrics,
    lhr,
  };
}

function opportunitySavings(audit) {
  const ms = audit.metricSavings ?? {};
  const candidates = [
    audit.details?.overallSavingsMs ?? 0,
    ms.LCP ?? 0,
    ms.FCP ?? 0,
    ms.TBT ?? 0,
    ms.INP ?? 0,
    (ms.CLS ?? 0) * 2500, // 0.1 CLS ~ 250 ms equivalent for ranking only
  ];
  return Math.max(...candidates);
}

function itemLabel(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.url === "string") return item.url;
  if (item.node?.selector) return `${item.node.selector}${item.node.snippet ? ` — ${item.node.snippet.slice(0, 120)}` : ""}`;
  if (item.node?.snippet) return item.node.snippet.slice(0, 120);
  if (item.source?.url) return `${item.source.url}:${item.source.line ?? ""}`;
  if (typeof item.source === "string") return item.source;
  if (item.entity) return String(item.entity);
  if (item.name) return String(item.name);
  return null;
}

function topOpportunities(lhr, n = 5) {
  const perfRefs = new Set((lhr.categories?.performance?.auditRefs ?? []).map((r) => r.id));
  const list = [];
  for (const [id, audit] of Object.entries(lhr.audits ?? {})) {
    if (!perfRefs.has(id)) continue;
    if (audit.scoreDisplayMode === "informative" || audit.scoreDisplayMode === "notApplicable" || audit.scoreDisplayMode === "manual") {
      if (!audit.metricSavings) continue;
    }
    if (audit.score === 1 && !audit.metricSavings) continue;
    const savings = opportunitySavings(audit);
    const hasSavings = Object.values(audit.metricSavings ?? {}).some((v) => v > 0) || (audit.details?.overallSavingsMs ?? 0) > 0;
    if (!hasSavings && (audit.score ?? 1) >= 0.9) continue;
    const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
    const resources = items
      .map((it) => {
        const label = itemLabel(it);
        const extra = [];
        if (typeof it.totalBytes === "number") extra.push(`${(it.totalBytes / 1024).toFixed(1)} KB`);
        if (typeof it.wastedBytes === "number") extra.push(`wasted ${(it.wastedBytes / 1024).toFixed(1)} KB`);
        if (typeof it.wastedMs === "number") extra.push(`wasted ${Math.round(it.wastedMs)} ms`);
        if (typeof it.total === "number" && id === "third-party-summary") extra.push(`${Math.round(it.total)} ms`);
        if (typeof it.duration === "number") extra.push(`${Math.round(it.duration)} ms`);
        if (typeof it.score === "number" && id === "layout-shifts") extra.push(`shift ${it.score.toFixed(3)}`);
        return label ? `${label}${extra.length ? ` (${extra.join(", ")})` : ""}` : null;
      })
      .filter(Boolean)
      .slice(0, 4);
    list.push({ id, title: audit.title, score: audit.score, displayValue: audit.displayValue ?? null, metricSavings: audit.metricSavings ?? null, savingsRank: savings, resources });
  }
  return list.sort((a, b) => b.savingsRank - a.savingsRank).slice(0, n);
}

function failingAudits(lhr, category) {
  const refs = lhr.categories?.[category]?.auditRefs ?? [];
  const out = [];
  for (const ref of refs) {
    const audit = lhr.audits?.[ref.id];
    if (!audit) continue;
    if (audit.scoreDisplayMode !== "binary" && audit.scoreDisplayMode !== "numeric") continue;
    if (typeof audit.score !== "number" || audit.score >= 1) continue;
    const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
    out.push({
      id: ref.id,
      weight: ref.weight,
      score: audit.score,
      title: audit.title,
      displayValue: audit.displayValue ?? null,
      items: items.map(itemLabel).filter(Boolean).slice(0, 5),
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

function summarize(outDir, targets, appendFile) {
  const t = { a11y: 95, bp: 95, seo: 95, perf: 95, lcp: 2500, cls: 0.1, ...targets };
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".report.json")).map((f) => path.join(outDir, f));
  const runs = files.map(readRun).filter(Boolean);
  const groups = new Map();
  for (const r of runs) {
    const key = `${r.id}--${r.preset}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const pages = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.run - b.run);
    const ok = list.filter((r) => !r.runtimeError);
    const scoresMedian = {};
    for (const c of ["performance", "accessibility", "best-practices", "seo"]) scoresMedian[c] = median(ok.map((r) => r.scores[c]));
    const metricsMedian = {};
    for (const k of Object.keys(METRICS)) metricsMedian[k] = median(ok.map((r) => r.metrics[k]));
    // representative run for opportunities: the run whose performance score is the median (closest to it)
    const rep = ok.length
      ? ok.reduce((best, r) => (Math.abs((r.scores.performance ?? 0) - (scoresMedian.performance ?? 0)) < Math.abs((best.scores.performance ?? 0) - (scoresMedian.performance ?? 0)) ? r : best), ok[0])
      : null;
    const checks = {
      accessibility: scoresMedian.accessibility != null ? scoresMedian.accessibility >= t.a11y : null,
      "best-practices": scoresMedian["best-practices"] != null ? scoresMedian["best-practices"] >= t.bp : null,
      seo: scoresMedian.seo != null ? scoresMedian.seo >= t.seo : null,
      performance: scoresMedian.performance != null ? scoresMedian.performance >= t.perf : null,
      lcp: metricsMedian.lcp != null ? metricsMedian.lcp <= t.lcp : null,
      cls: metricsMedian.cls != null ? metricsMedian.cls <= t.cls : null,
    };
    const failing = {};
    if (rep) {
      for (const c of ["accessibility", "best-practices", "seo"]) {
        if (checks[c] === false) failing[c] = failingAudits(rep.lhr, c);
      }
    }
    pages.push({
      key,
      id: list[0].id,
      preset: list[0].preset,
      url: list[0].url,
      runs: list.map(({ lhr: _lhr, ...rest }) => rest),
      medians: { scores: scoresMedian, metrics: metricsMedian },
      checks,
      representativeRun: rep ? path.basename(rep.file) : null,
      opportunities: rep ? topOpportunities(rep.lhr) : [],
      failingAudits: failing,
    });
  }
  pages.sort((a, b) => a.key.localeCompare(b.key));
  const summary = {
    generatedAt: new Date().toISOString(),
    lighthouseVersion: runs[0]?.lighthouseVersion ?? null,
    targets: t,
    pages,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  // --append: a hand-written analysis (findings with causes) kept in its own file so a re-run of the
  // summary never loses it; it is appended verbatim after the generated sections.
  const appendix = appendFile && fs.existsSync(appendFile) ? `\n${fs.readFileSync(appendFile, "utf8").trim()}\n` : "";
  fs.writeFileSync(path.join(outDir, "summary.md"), renderMarkdown(summary, outDir) + appendix);
  return summary;
}

const fmtMs = (v) => (v == null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const fmtCls = (v) => (v == null ? "n/a" : v.toFixed(3));
const fmtScore = (v) => (v == null ? "n/a" : String(v));
const mark = (ok) => (ok == null ? "n/a" : ok ? "pass" : "FAIL");

function renderMarkdown(summary, outDir) {
  const t = summary.targets;
  const lines = [];
  lines.push(`# Lighthouse summary — ${path.basename(path.dirname(outDir))}`);
  lines.push("");
  lines.push(`Generated ${summary.generatedAt} from the \`*.report.json\` files in this directory (Lighthouse ${summary.lighthouseVersion ?? "?"}). Scores are \`categories.<id>.score × 100\`, metrics are \`audits.<id>.numericValue\`; the median is taken per value over the runs of a page (for 3 runs: the middle value; for 1 run: that run). "TBT" stands in for INP: Lighthouse lab runs contain no user interaction, so \`interaction-to-next-paint\` has no value and Total Blocking Time is the closest lab proxy. The representative run named per page is the run whose performance score is closest to the median; its opportunities and failing audits are listed.`);
  lines.push("");
  lines.push(`Targets: accessibility ≥ ${t.a11y}, best practices ≥ ${t.bp}, SEO ≥ ${t.seo}, performance as close to ${t.perf} as realistic (reported against ${t.perf}), LCP ≤ ${fmtMs(t.lcp)}, CLS ≤ ${t.cls}. Mobile runs use Lighthouse's default mobile emulation with simulated throttling (Moto G Power class, 4× CPU slowdown, 150 ms RTT / 1.6 Mbps); desktop runs use \`--preset=desktop\`.`);
  lines.push("");
  lines.push("## Medians per page");
  lines.push("");
  lines.push("| Page | Preset | Runs | Perf (runs) | A11y (runs) | BP (runs) | SEO (runs) | LCP | TBT | CLS | Speed Index | Targets |");
  lines.push("| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |");
  for (const p of summary.pages) {
    const s = p.medians.scores;
    const m = p.medians.metrics;
    const runsOf = (c) => p.runs.map((r) => fmtScore(r.scores[c])).join("/");
    const verdicts = [
      `a11y ${mark(p.checks.accessibility)}`,
      `BP ${mark(p.checks["best-practices"])}`,
      `SEO ${mark(p.checks.seo)}`,
      `perf ${mark(p.checks.performance)}`,
      `LCP ${mark(p.checks.lcp)}`,
      `CLS ${mark(p.checks.cls)}`,
    ].join(", ");
    lines.push(
      `| ${p.id} (\`${new URL(p.url).pathname}\`) | ${p.preset} | ${p.runs.length} | **${fmtScore(s.performance)}** (${runsOf("performance")}) | **${fmtScore(s.accessibility)}** (${runsOf("accessibility")}) | **${fmtScore(s["best-practices"])}** (${runsOf("best-practices")}) | **${fmtScore(s.seo)}** (${runsOf("seo")}) | ${fmtMs(m.lcp)} | ${fmtMs(m.tbt)} | ${fmtCls(m.cls)} | ${fmtMs(m.si)} | ${verdicts} |`,
    );
  }
  lines.push("");
  lines.push("## Per-run values");
  lines.push("");
  lines.push("| Report | Perf | A11y | BP | SEO | LCP | TBT | CLS | SI | FCP | Warnings |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const p of summary.pages) {
    for (const r of p.runs) {
      const w = r.runtimeError ? `runtimeError: ${r.runtimeError.code}` : r.runWarnings.length ? r.runWarnings.map((x) => x.slice(0, 80)).join("; ") : "";
      lines.push(
        `| \`${path.basename(r.file)}\` | ${fmtScore(r.scores.performance)} | ${fmtScore(r.scores.accessibility)} | ${fmtScore(r.scores["best-practices"])} | ${fmtScore(r.scores.seo)} | ${fmtMs(r.metrics.lcp)} | ${fmtMs(r.metrics.tbt)} | ${fmtCls(r.metrics.cls)} | ${fmtMs(r.metrics.si)} | ${fmtMs(r.metrics.fcp)} | ${w} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Top opportunities per page (representative run)");
  lines.push("");
  for (const p of summary.pages) {
    lines.push(`### ${p.id} — ${p.preset} (\`${p.representativeRun ?? "n/a"}\`)`);
    lines.push("");
    if (p.opportunities.length === 0) {
      lines.push("No performance opportunity with estimated savings in this run.");
    } else {
      for (const o of p.opportunities) {
        const savings = o.metricSavings ? Object.entries(o.metricSavings).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${k === "CLS" ? v.toFixed(3) : `${Math.round(v)} ms`}`).join(", ") : "";
        lines.push(`- **${o.title}** (\`${o.id}\`, score ${o.score ?? "n/a"}${o.displayValue ? `, ${o.displayValue}` : ""}${savings ? `; est. savings ${savings}` : ""})`);
        for (const r of o.resources) lines.push(`  - ${r.replace(/\|/g, "\\|")}`);
      }
    }
    lines.push("");
  }
  const failingPages = summary.pages.filter((p) => Object.keys(p.failingAudits).length > 0);
  lines.push("## Failing audits of categories below target (representative run)");
  lines.push("");
  if (failingPages.length === 0) {
    lines.push("No page has an accessibility, best-practices or SEO median below its target.");
  } else {
    for (const p of failingPages) {
      for (const [cat, audits] of Object.entries(p.failingAudits)) {
        lines.push(`### ${p.id} — ${p.preset} — ${cat} (median ${fmtScore(p.medians.scores[cat])})`);
        lines.push("");
        for (const a of audits) {
          lines.push(`- **${a.title}** (\`${a.id}\`, weight ${a.weight}, score ${a.score}${a.displayValue ? `, ${a.displayValue}` : ""})`);
          for (const it of a.items) lines.push(`  - ${it.replace(/\|/g, "\\|")}`);
        }
        lines.push("");
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ---------- main ----------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error("--out is required");
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const logFile = path.join(outDir, "run.log");
  const log = (msg) => {
    fs.appendFileSync(logFile, `${msg}\n`);
    process.stdout.write(`${msg}\n`);
  };

  if (!args.summarizeOnly) {
    if (!args.base) throw new Error("--base is required unless --summarize-only");
    const chrome = resolveChrome(args.chrome);
    if (!fs.existsSync(chrome)) throw new Error(`Chrome binary not found: ${chrome}`);
    const cli = args.cli ? path.resolve(args.cli) : null;
    log(`[${new Date().toISOString()}] lighthouse runner: base=${args.base} chrome=${chrome} cli=${cli ?? "npx --yes lighthouse@latest"}`);

    const plan = [];
    for (const p of args.mobile) for (let i = 1; i <= args.runs; i++) plan.push({ ...p, preset: "mobile", run: i });
    for (const p of args.desktop) for (let i = 1; i <= args.desktopRuns; i++) plan.push({ ...p, preset: "desktop", run: i });
    let headerFile = null;
    if (args.authMobile.length) {
      if (!args.authFile) throw new Error("--auth-file is required with --auth-mobile");
      const auth = writeAuthHeaders(path.resolve(args.authFile), outDir);
      headerFile = auth.headerFile;
      log(`auth cookies from ${args.authFile}: ${auth.cookieNames.join(", ")} (values not logged)`);
      for (const p of args.authMobile) for (let i = 1; i <= args.authRuns; i++) plan.push({ ...p, preset: "mobile", run: i, auth: true });
    }
    let failures = 0;
    for (const step of plan) {
      const outBase = path.join(outDir, `${step.id}--${step.preset}--run${step.run}`);
      const ok = runLighthouse({
        url: new URL(step.path, args.base).toString(),
        outBase,
        preset: step.preset,
        headerFile: step.auth ? headerFile : null,
        cli,
        chrome,
        log,
      });
      if (!ok) failures++;
    }
    if (headerFile && fs.existsSync(headerFile)) fs.unlinkSync(headerFile); // never leave the session cookie in the evidence pack
    cleanupChromeTemp(log);
    log(`runs finished: ${plan.length - failures}/${plan.length} succeeded`);
  }

  const summary = summarize(outDir, args.targets, args.append ? path.resolve(args.append) : null);
  log(`summary written: ${path.join(outDir, "summary.json")} and summary.md (${summary.pages.length} page/preset groups)`);
}

main();
