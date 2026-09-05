#!/usr/bin/env node
/**
 * Before/after table for docs/qa/2026-09-05/followup/perf/summary.md, generated from the Lighthouse
 * summaries (`summary.json` of two runner output directories) and the raw reports: per page the
 * medians of performance, LCP, TBT, CLS, FCP and Speed Index, plus the transfer bytes of scripts,
 * the HTML document, stylesheets and fonts from the `network-requests` audit of the representative
 * run (the run whose performance score is closest to the median). Nothing is typed by hand.
 *
 * Usage: node docs/qa/2026-09-05/followup/perf/compare.mjs <beforeDir> <afterDir> [label-before] [label-after]
 */
import fs from "node:fs";
import path from "node:path";

const [beforeDir, afterDir, labelBefore = "before", labelAfter = "after"] = process.argv.slice(2);
if (!beforeDir || !afterDir) throw new Error("usage: compare.mjs <beforeDir> <afterDir>");

function load(dir) {
  const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
  const pages = new Map();
  for (const p of summary.pages) {
    // `representativeRun` is the report file name of the run closest to the median
    const repFile = typeof p.representativeRun === "string" ? p.representativeRun : path.basename(p.runs[0].file);
    const lhr = JSON.parse(fs.readFileSync(path.join(dir, repFile), "utf8"));
    const items = lhr.audits["network-requests"].details.items;
    const sum = (type) => items.filter((i) => i.resourceType === type).reduce((n, i) => n + (i.transferSize ?? 0), 0);
    const count = (type) => items.filter((i) => i.resourceType === type).length;
    pages.set(p.id, {
      id: p.id,
      url: p.url,
      runs: p.runs.length,
      perfRuns: p.runs.map((r) => r.scores.performance),
      m: p.medians,
      js: sum("Script"),
      jsFiles: count("Script"),
      html: sum("Document"),
      css: sum("Stylesheet"),
      cssFiles: count("Stylesheet"),
      fonts: sum("Font"),
      fetch: sum("Fetch") + sum("XHR"),
      renderBlocking: lhr.audits["render-blocking-insight"]?.displayValue ?? "",
      lcpNode: lhr.audits["lcp-breakdown-insight"]?.details?.items?.find((i) => i.type === "node")?.snippet ?? "",
      repFile,
    });
  }
  return pages;
}

const before = load(beforeDir);
const after = load(afterDir);
const ms = (v) => (v == null ? "—" : `${(v / 1000).toFixed(2)} s`);
const msShort = (v) => (v == null ? "—" : `${Math.round(v)} ms`);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const delta = (a, b, fmt, invert = false) => {
  if (a == null || b == null) return "—";
  const d = b - a;
  const sign = d > 0 ? "+" : "";
  return `${fmt(a)} → **${fmt(b)}** (${sign}${fmt === kb ? kb(d) : fmt === ms ? `${(d / 1000).toFixed(2)} s` : fmt === msShort ? `${Math.round(d)} ms` : d.toFixed(3)})`;
};

const lines = [];
lines.push(`| Page | Runs | Performance (runs) | LCP | TBT | CLS | FCP | Speed Index |`);
lines.push(`| --- | ---: | --- | --- | --- | --- | --- | --- |`);
for (const [id, b] of before) {
  const a = after.get(id);
  if (!a) continue;
  const perf = `${b.m.scores.performance} (${b.perfRuns.join("/")}) → **${a.m.scores.performance}** (${a.perfRuns.join("/")})`;
  lines.push(`| \`${new URL(b.url).pathname}\` | ${b.runs} → ${a.runs} | ${perf} | ${delta(b.m.metrics.lcp, a.m.metrics.lcp, ms)} | ${delta(b.m.metrics.tbt, a.m.metrics.tbt, msShort)} | ${b.m.metrics.cls.toFixed(3)} → **${a.m.metrics.cls.toFixed(3)}** | ${delta(b.m.metrics.fcp, a.m.metrics.fcp, ms)} | ${delta(b.m.metrics.si, a.m.metrics.si, ms)} |`);
}
lines.push("");
lines.push(`| Page | JavaScript transfer (files) | HTML document transfer | Stylesheets (files) | Fonts | Prefetch/RSC fetches | Render-blocking (Lighthouse estimate) |`);
lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
for (const [id, b] of before) {
  const a = after.get(id);
  if (!a) continue;
  lines.push(`| \`${new URL(b.url).pathname}\` | ${kb(b.js)} (${b.jsFiles}) → **${kb(a.js)}** (${a.jsFiles}) | ${kb(b.html)} → **${kb(a.html)}** | ${kb(b.css)} (${b.cssFiles}) → **${kb(a.css)}** (${a.cssFiles}) | ${kb(b.fonts)} → ${kb(a.fonts)} | ${kb(b.fetch)} → ${kb(a.fetch)} | ${b.renderBlocking || "—"} → ${a.renderBlocking || "—"} |`);
}
lines.push("");
lines.push(`Representative runs: ${[...before.values()].map((b) => `${labelBefore} \`${b.repFile}\``).join(", ")}; ${[...after.values()].map((a) => `${labelAfter} \`${a.repFile}\``).join(", ")}. LCP element (${labelAfter}): ${[...after.values()].map((a) => `\`${new URL(a.url).pathname}\` ${a.lcpNode.replace(/\|/g, "\\|")}`).join("; ")}.`);
process.stdout.write(lines.join("\n") + "\n");
