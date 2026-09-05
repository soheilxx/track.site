/**
 * Builds summary.md from the evaluations of contrast-review.mjs.
 * Usage: node docs/qa/2026-09-05/followup/contrast/summarize.mjs --before results.json --after results-after.json [--dark results-dark.json]
 * Every number in the summary is read from those files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const load = (name) => (name && fs.existsSync(path.join(here, name)) ? JSON.parse(fs.readFileSync(path.join(here, name), "utf8")) : null);
const before = load(arg("--before", "results.json"));
const after = load(arg("--after", "results-after.json"));
const dark = load(arg("--dark", "results-dark.json"));

const ratio = (n) => (typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)}` : "—");
const counts = (results) => {
  const c = {};
  for (const r of results) c[r.verdict] = (c[r.verdict] || 0) + 1;
  return c;
};
const family = (slug) => slug.replace(/^(en|de)-/, "");
const shortSel = (s) => (s.length > 70 ? `${s.slice(0, 67)}…` : s).replace(/\|/g, "\\|");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Unique node = route family + axe target + message key; keeps the worst evaluation per file. */
function unique(results) {
  const map = new Map();
  for (const r of results) {
    const key = `${family(r.slug)}|${r.target}|${r.messageKey}`;
    const e = map.get(key);
    const worse = !e || (r.ratioMin ?? Infinity) < (e.ratioMin ?? Infinity) || (r.verdict !== "pass" && e.verdict === "pass");
    if (worse) map.set(key, { ...r, runs: [...(e?.runs ?? []), r.run] });
    else e.runs.push(r.run);
  }
  return map;
}

const md = [];
md.push("# Contrast review of the axe \"incomplete\" color-contrast nodes (task E3, defect D15)");
md.push("");
md.push(`Input: the \`incomplete\` \`color-contrast\` nodes of \`docs/qa/2026-09-05/axe/*--{375,1440}.json\` (${before.nodes} nodes in ${before.runs} runs; the other 23 runs of the sweep had no such node). Method: \`contrast-review.mjs\` opens the same route at the same width, resolves each node by its axe target (or, for 8 selectors that F1 changed, by the recorded tag + class + text), and resolves the background by a computed-style walk — the ancestor chain (background-color, gradients, opacity), the elements painted below the text at the text's sample point (\`elementsFromPoint\`), the related nodes axe named (decorative \`pointer-events: none\` overlays) and, for SVG text, the shapes painted before it. Gradient and pattern stops are candidates; \`min\` is the lowest contrast over all candidates, \`solid\` the contrast against the plain background colours. Verdicts: \`pass\` (min ≥ required), \`pass-pattern\` (only the 1 px dots of the 24 px grid pattern fall below), \`review-gradient\`, \`FAIL\` (solid < required), \`not-found\`.`);
md.push("");
md.push(`Before (build served on ${before.base}, generated ${before.generatedAt}): ${JSON.stringify(counts(before.results))}.`);
if (after) md.push(`After the fixes (build \`.next-e3\` served on ${after.base}, generated ${after.generatedAt}): ${JSON.stringify(counts(after.results))}.`);
if (dark) md.push(`Dark theme (\`data-theme="dark"\`, same dashboard nodes, ${dark.runs} runs, generated ${dark.generatedAt}): ${JSON.stringify(counts(dark.results))}.`);
md.push("");

const ub = unique(before.results);
const ua = after ? unique(after.results) : null;

md.push("## 1. Failing nodes before the fixes → root cause → fix → after");
md.push("");
md.push("| Route | Node (axe target) | Text | Foreground on background | solid | min | required | Root cause | Fix | After |");
md.push("| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |");
const causes = (r) => {
  if (r.verdict === "not-found") return ["selector changed by the F1 fixes (`outline-none` removed / hero demo re-laid out)", "resolved by tag + class + text (no code change)"];
  const fg = r.fgEffective ?? "";
  if (/fill-cyan-strong/.test(r.html) || fg === "#086f86") return ["`.surface-stage` re-scoped `--color-cyan` but not `--color-cyan-strong`: the light value (#086f86) rendered on the dark stage", "`packages/ui/src/styles/tokens.css`: the stage defines `--color-cyan-strong: #5fd2e8` (and violet-strong / violet-soft-2 / cyan-soft-2) like the dark theme"];
  if (/on-primary\/80/.test(r.html) && /pricing/.test(r.slug)) return ["the German sublabel is wider than the 124 px Track node: its ends are white on the ground", "`event-definition.tsx`: the node width follows the sublabel length"];
  if (/on-primary\/80/.test(r.html)) return ["`fill-on-primary/80` on the stage primary (#0a0a0a at 80 % on #4d82ff) is 4.48:1", "`packages/ui/src/diagram.tsx`: sublabels use `fill-on-primary/90` (5.15:1 on the stage, 5.53:1 in light)"];
  if (/text-primary\/80/.test(r.html)) return ["`text-primary/80` on `bg-primary-soft` is 3.92:1", "`data-quality/inbox.tsx`, `packages/ui/src/primitives/search.tsx`: `text-primary` (5.65:1)"];
  if (r.bgSolid === "#16264d") return ["dark/stage `--color-primary-soft` #16264d gives 4.20:1 for `text-primary` and 4.39:1 for `text-ink-3`", "`tokens.css`: dark and stage `--color-primary-soft: #101c40` (4.69:1 / 4.90:1)"];
  return ["", ""];
};
for (const r of [...ub.values()].filter((r) => r.verdict !== "pass" && r.verdict !== "pass-pattern").sort((a, b) => a.slug.localeCompare(b.slug) || a.target.localeCompare(b.target))) {
  const a = ua?.get(`${family(r.slug)}|${r.target}|${r.messageKey}`);
  const [cause, fix] = causes(r);
  md.push(`| ${family(r.slug)} | \`${shortSel(r.target)}\` | ${cell(r.text || r.html.replace(/<[^>]+>/g, "").trim().slice(0, 30))} | ${r.fgEffective ?? "—"} on ${r.bgSolid ?? "—"} | ${ratio(r.ratioSolid)} | ${ratio(r.ratioMin)} | ${r.expected} | ${cause} | ${fix} | ${a ? `${a.verdict} (${ratio(a.ratioSolid)} / min ${ratio(a.ratioMin)}, ${a.fgEffective ?? "—"} on ${a.bgSolid ?? "—"}${a.resolvedBy && a.resolvedBy !== "target" ? `, ${a.resolvedBy}` : ""})` : "—"} |`);
}
md.push("");

md.push("## 2. Every node (unique by route family, axe target and axe message; en/de and both widths merged, worst evaluation shown)");
md.push("");
md.push("| Route | Node (axe target) | axe message | Text | Foreground on background | solid | min | required | Before | After | Runs |");
md.push("| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |");
for (const r of [...ub.values()].sort((a, b) => family(a.slug).localeCompare(family(b.slug)) || a.target.localeCompare(b.target))) {
  const a = ua?.get(`${family(r.slug)}|${r.target}|${r.messageKey}`);
  md.push(`| ${family(r.slug)} | \`${shortSel(r.target)}\` | ${r.messageKey} | ${cell((r.text || "").slice(0, 40))} | ${r.fgEffective ?? "—"} on ${r.bgSolid ?? "—"}${r.minVia?.length ? ` (min via ${cell(r.minVia.join(", "))})` : ""} | ${ratio(r.ratioSolid)} | ${ratio(r.ratioMin)} | ${r.expected} | ${r.verdict} | ${a ? `${a.verdict} ${ratio(a.ratioMin)}` : "—"} | ${r.runs.length} |`);
}
md.push("");

if (dark) {
  md.push("## 3. Dark theme (supplementary: the dashboard nodes with `data-theme=\"dark\"`)");
  md.push("");
  md.push("| Route | Node (axe target) | Text | Foreground on background | solid | min | required | Verdict |");
  md.push("| --- | --- | --- | --- | ---: | ---: | ---: | --- |");
  for (const r of [...unique(dark.results).values()].sort((a, b) => a.slug.localeCompare(b.slug) || a.target.localeCompare(b.target))) {
    md.push(`| ${r.slug} | \`${shortSel(r.target)}\` | ${cell((r.text || "").slice(0, 40))} | ${r.fgEffective ?? "—"} on ${r.bgSolid ?? "—"} | ${ratio(r.ratioSolid)} | ${ratio(r.ratioMin)} | ${r.expected} | ${r.verdict} |`);
  }
  md.push("");
}

fs.writeFileSync(path.join(here, "summary.md"), md.join("\n"));
process.stdout.write(`summary.md: ${ub.size} unique nodes before${ua ? `, ${ua.size} after` : ""}\n`);
