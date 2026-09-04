#!/usr/bin/env node
/**
 * i18n parity report (redesign supplement §7, docs/14-localization.md).
 *
 * Compares every programme locale (`ALL_LOCALES` in src/i18n/routing.ts) against English:
 *   - message catalogs  messages/<locale>/<namespace>.json — missing / extra keys per namespace
 *   - typed copy        every `LocalizedCopy` constant of src/lib/marketing-copy (incl. knowledge labels),
 *                       src/lib/legal-copy (LEGAL) and src/server/mail/templates (MAIL_COPY):
 *                       present (not null) + key parity with `en` (same rule as the unit tests)
 *   - knowledge         content/knowledge/<locale>/*.mdx per translationGroupId: present, status, slug
 *   - learning paths    content/knowledge/paths.<locale>.json ids vs English
 *   - catalog labels    every `Label` of @track-site/catalog (plans, features, overage, non-billable reasons)
 *
 * Writes docs/i18n-parity-report.json (machine-readable) and docs/i18n-parity-report.md.
 * Exit code 1 when an ACTIVE locale has any gap; `--strict` requires all six locales to be complete.
 * `--quiet` prints only the summary line.
 *
 * The typed copy and the catalogue are TypeScript modules with path aliases, so they are read by a
 * small probe executed with tsx (devDependency of @track-site/web) instead of being parsed by hand;
 * everything else is read directly. Usage: `node apps/web/scripts/i18n-parity.mjs [--strict] [--quiet]`
 * (package script `i18n:parity`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const docsDir = path.join(repoRoot, "docs");
const contentRoot = path.join(webRoot, "content", "knowledge");
const strict = process.argv.includes("--strict");
const quiet = process.argv.includes("--quiet");

/* ------------------------------------------------------------------ locales */

function readLocaleLists() {
  const source = readFileSync(path.join(webRoot, "src", "i18n", "routing.ts"), "utf8");
  const list = (name) => {
    const match = new RegExp(`export const ${name}[^=\\n]*=\\s*\\[([^\\]]*)\\]`).exec(source);
    return match ? Array.from(match[1].matchAll(/"([a-z]{2})"/g), (m) => m[1]) : [];
  };
  const all = list("ALL_LOCALES");
  const active = list("ACTIVE_LOCALES");
  if (!all.includes("en") || !active.includes("en")) throw new Error("could not read ALL_LOCALES / ACTIVE_LOCALES from src/i18n/routing.ts");
  return { all, active };
}

const { all: ALL_LOCALES, active: ACTIVE_LOCALES } = readLocaleLists();
const OTHER_LOCALES = ALL_LOCALES.filter((l) => l !== "en");

/* ------------------------------------------------------------ message catalogs */

function flattenKeys(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value).flatMap((key) => flattenKeys(value[key], prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function messageParity() {
  const enDir = path.join(webRoot, "messages", "en");
  const namespaces = readdirSync(enDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  const reference = Object.fromEntries(namespaces.map((ns) => [ns, flattenKeys(readJson(path.join(enDir, `${ns}.json`)))]));
  const result = {};
  for (const locale of OTHER_LOCALES) {
    const perNamespace = {};
    let gaps = 0;
    for (const ns of namespaces) {
      const file = path.join(webRoot, "messages", locale, `${ns}.json`);
      if (!existsSync(file)) {
        perNamespace[ns] = { file: false, missing: reference[ns], extra: [] };
        gaps += reference[ns].length;
        continue;
      }
      const keys = new Set(flattenKeys(readJson(file)));
      const refSet = new Set(reference[ns]);
      const missing = reference[ns].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !refSet.has(k));
      perNamespace[ns] = { file: true, missing, extra };
      gaps += missing.length + extra.length;
    }
    result[locale] = { gaps, namespaces: perNamespace };
  }
  return { namespaces, keyCount: Object.fromEntries(namespaces.map((ns) => [ns, reference[ns].length])), locales: result };
}

/* ---------------------------------------------------- typed copy + catalogue (probe) */

const PROBE = `
import * as marketing from "@/lib/marketing-copy";
import { copyParity, isLocalizedCopy } from "@/lib/marketing-copy/parity";
import { LEGAL } from "@/lib/legal-copy";
import { MAIL_COPY } from "@/server/mail/templates";
import { FEATURES, FEATURE_KEYS, NON_BILLABLE_REASON_LABELS, OVERAGE_POLICY_LABELS, PLANS, inheritsLabel, labelIn, limitBullets } from "@track-site/catalog";

const copy: Array<{ name: string; source: string; locales: Record<string, { present: boolean; missing: string[]; extra: string[] }> }> = [];
const add = (name: string, source: string, value: unknown) => {
  if (!isLocalizedCopy(value)) return;
  const locales: Record<string, { present: boolean; missing: string[]; extra: string[] }> = {};
  for (const entry of copyParity(value)) locales[entry.locale] = { present: entry.present, missing: entry.missing, extra: entry.extra };
  copy.push({ name, source, locales });
};
for (const [name, value] of Object.entries(marketing)) add(name, name === "KNOWLEDGE_LABELS" ? "knowledge-labels" : "marketing", value);
add("LEGAL", "legal", LEGAL);
add("MAIL_COPY", "mail", MAIL_COPY);

const labels: Array<{ id: string; locales: Record<string, boolean> }> = [];
const label = (id: string, value: { en: string } & Partial<Record<string, string>>) => {
  const locales: Record<string, boolean> = {};
  for (const locale of ${JSON.stringify(ALL_LOCALES)}) locales[locale] = labelIn(value, locale) !== null;
  labels.push({ id, locales });
};
for (const p of PLANS) {
  label(\`plan.\${p.id}.audience\`, p.audience);
  p.highlights.forEach((h, i) => label(\`plan.\${p.id}.highlights[\${i}]\`, h));
  limitBullets(p).forEach((b, i) => label(\`plan.\${p.id}.limits[\${i}]\`, b));
  const lead = inheritsLabel(p);
  if (lead) label(\`plan.\${p.id}.inherits\`, lead);
}
for (const key of FEATURE_KEYS) label(\`feature.\${key}\`, FEATURES[key].label);
for (const [key, value] of Object.entries(OVERAGE_POLICY_LABELS)) label(\`overagePolicy.\${key}\`, value);
for (const [key, value] of Object.entries(NON_BILLABLE_REASON_LABELS)) label(\`nonBillableReason.\${key}\`, value);

process.stdout.write(JSON.stringify({ copy, labels }));
`;

function runProbe() {
  const require = createRequire(path.join(webRoot, "package.json"));
  const tsxCli = require.resolve("tsx/cli");
  const probeDir = path.join(webRoot, ".local", "i18n-parity");
  mkdirSync(probeDir, { recursive: true });
  const probeFile = path.join(probeDir, "probe.ts");
  writeFileSync(probeFile, PROBE);
  const res = spawnSync(process.execPath, [tsxCli, "--tsconfig", path.join(webRoot, "tsconfig.json"), probeFile], { cwd: webRoot, encoding: "utf8", env: { ...process.env, NODE_ENV: "test" }, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || "");
    throw new Error(`copy probe failed with exit code ${res.status}`);
  }
  const start = res.stdout.indexOf("{");
  return JSON.parse(res.stdout.slice(start));
}

function copyParityBySource(probe) {
  const bySource = { marketing: {}, "knowledge-labels": {}, legal: {}, mail: {} };
  for (const source of Object.keys(bySource)) {
    const modules = probe.copy.filter((c) => c.source === source);
    for (const locale of OTHER_LOCALES) {
      const missingModules = [];
      const drift = [];
      for (const m of modules) {
        const entry = m.locales[locale];
        if (!entry || !entry.present) missingModules.push(m.name);
        else if (entry.missing.length || entry.extra.length) drift.push({ name: m.name, missing: entry.missing, extra: entry.extra });
      }
      bySource[source][locale] = { modules: modules.length, missingModules, drift, gaps: missingModules.length + drift.reduce((n, d) => n + d.missing.length + d.extra.length, 0) };
    }
  }
  return bySource;
}

function catalogParity(probe) {
  const result = {};
  for (const locale of OTHER_LOCALES) {
    const missing = probe.labels.filter((l) => !l.locales[locale]).map((l) => l.id);
    result[locale] = { labels: probe.labels.length, missing, gaps: missing.length };
  }
  return result;
}

/* ------------------------------------------------------------- knowledge content */

function readArticles(locale) {
  const dir = path.join(contentRoot, locale);
  const out = new Map();
  if (!existsSync(dir)) return { exists: false, articles: out };
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".mdx")) continue;
    const name = file.replace(/\.mdx$/, "");
    const { data } = matter(readFileSync(path.join(dir, file), "utf8"));
    const group = typeof data.translationGroupId === "string" && data.translationGroupId ? data.translationGroupId : name;
    const slug = typeof data.slug === "string" && data.slug ? data.slug : name;
    const status = typeof data.status === "string" ? data.status : "draft";
    out.set(group, { file, slug, status });
  }
  return { exists: true, articles: out };
}

function knowledgeParity() {
  const en = readArticles("en");
  const groups = [...en.articles.keys()].sort();
  const result = {};
  for (const locale of OTHER_LOCALES) {
    const { exists, articles } = readArticles(locale);
    const versions = {};
    const missing = [];
    const unpublished = [];
    const slugDiffers = [];
    for (const group of groups) {
      const a = articles.get(group);
      if (!a) {
        versions[group] = { present: false, status: null, slug: null };
        missing.push(group);
        continue;
      }
      versions[group] = { present: true, status: a.status, slug: a.slug };
      if (a.status !== "published") unpublished.push({ group, status: a.status });
      if (a.slug !== en.articles.get(group).slug) slugDiffers.push({ group, en: en.articles.get(group).slug, [locale]: a.slug });
    }
    const extra = [...articles.keys()].filter((g) => !en.articles.has(g)).sort();
    const published = groups.length - missing.length - unpublished.length;
    result[locale] = { directory: exists, groups: groups.length, published, missing, unpublished, extra, slugDiffers, gaps: missing.length + unpublished.length + extra.length };
  }
  return { groups, enPublished: groups.filter((g) => en.articles.get(g).status === "published").length, locales: result };
}

function learningPathParity() {
  const read = (locale) => {
    const file = path.join(contentRoot, `paths.${locale}.json`);
    if (!existsSync(file)) return null;
    try {
      const parsed = readJson(file);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.paths) ? parsed.paths : [];
      return list.filter((p) => p && typeof p.id === "string").map((p) => ({ id: p.id, groupIds: Array.isArray(p.groupIds) ? p.groupIds : [] }));
    } catch {
      return null;
    }
  };
  const en = read("en") ?? [];
  const enIds = en.map((p) => p.id);
  const result = {};
  for (const locale of OTHER_LOCALES) {
    const paths = read(locale);
    if (!paths) {
      result[locale] = { file: false, paths: enIds.length, missing: enIds, extra: [], orderDiffers: [], gaps: enIds.length };
      continue;
    }
    const ids = paths.map((p) => p.id);
    const missing = enIds.filter((id) => !ids.includes(id));
    const extra = ids.filter((id) => !enIds.includes(id));
    const orderDiffers = en.filter((p) => {
      const other = paths.find((q) => q.id === p.id);
      return other && JSON.stringify(other.groupIds) !== JSON.stringify(p.groupIds);
    }).map((p) => p.id);
    result[locale] = { file: true, paths: enIds.length, missing, extra, orderDiffers, gaps: missing.length + extra.length + orderDiffers.length };
  }
  return { ids: enIds, locales: result };
}

/* --------------------------------------------------------------------- report */

const messages = messageParity();
const probe = runProbe();
const copy = copyParityBySource(probe);
const catalog = catalogParity(probe);
const knowledge = knowledgeParity();
const paths = learningPathParity();

const locales = {};
for (const locale of OTHER_LOCALES) {
  const sections = {
    messages: messages.locales[locale],
    marketingCopy: copy.marketing[locale],
    knowledgeLabels: copy["knowledge-labels"][locale],
    legal: copy.legal[locale],
    mail: copy.mail[locale],
    knowledge: knowledge.locales[locale],
    learningPaths: paths.locales[locale],
    catalog: catalog[locale],
  };
  const gaps = Object.values(sections).reduce((n, s) => n + s.gaps, 0);
  locales[locale] = { active: ACTIVE_LOCALES.includes(locale), complete: gaps === 0, gaps, sections };
}

const failing = Object.entries(locales).filter(([, l]) => !l.complete && (strict || l.active)).map(([locale]) => locale);
const report = {
  generatedAt: new Date().toISOString(),
  strict,
  allLocales: ALL_LOCALES,
  activeLocales: ACTIVE_LOCALES,
  reference: { messages: messages.keyCount, copyModules: probe.copy.map((c) => c.name).sort(), knowledgeGroups: knowledge.groups.length, knowledgeGroupsPublishedEn: knowledge.enPublished, learningPaths: paths.ids, catalogLabels: probe.labels.length },
  ok: failing.length === 0,
  failing,
  locales,
};

mkdirSync(docsDir, { recursive: true });
writeFileSync(path.join(docsDir, "i18n-parity-report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(path.join(docsDir, "i18n-parity-report.md"), renderMarkdown(report));

const summary = OTHER_LOCALES.map((l) => `${l}${locales[l].active ? "*" : ""}: ${locales[l].complete ? "complete" : `${locales[l].gaps} gaps`}`).join(", ");
process.stdout.write(`i18n parity (${strict ? "strict, all locales" : "active locales"}; * = active): ${summary}\n`);
if (!quiet) {
  for (const locale of OTHER_LOCALES) {
    const l = locales[locale];
    const parts = Object.entries(l.sections).map(([name, s]) => `${name} ${s.gaps}`).join(", ");
    process.stdout.write(`  ${locale}: ${parts}\n`);
  }
  process.stdout.write(`report: docs/i18n-parity-report.md, docs/i18n-parity-report.json\n`);
}
if (failing.length) {
  process.stdout.write(`FAIL: ${failing.join(", ")} ${failing.length === 1 ? "has" : "have"} gaps\n`);
  process.exit(1);
}

function renderMarkdown(r) {
  const cap = (list, n = 40) => (list.length > n ? [...list.slice(0, n), `… and ${list.length - n} more`] : list);
  const lines = [];
  lines.push("# i18n parity report");
  lines.push("");
  lines.push(`Generated by \`node apps/web/scripts/i18n-parity.mjs${r.strict ? " --strict" : ""}\` on ${r.generatedAt}. Reference language: English. Active locales: ${r.activeLocales.join(", ")}. Rules: docs/14-localization.md.`);
  lines.push("");
  lines.push(`Reference: ${Object.values(r.reference.messages).reduce((a, b) => a + b, 0)} message keys in ${Object.keys(r.reference.messages).length} namespaces, ${r.reference.copyModules.length} copy modules, ${r.reference.knowledgeGroups} knowledge topics (${r.reference.knowledgeGroupsPublishedEn} published in en), ${r.reference.learningPaths.length} learning paths, ${r.reference.catalogLabels} catalogue labels.`);
  lines.push("");
  lines.push("| Locale | Active | Messages | Marketing copy | Knowledge labels | Legal | Mail | Knowledge (published / topics) | Learning paths | Catalogue labels | Status |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const [locale, l] of Object.entries(r.locales)) {
    const s = l.sections;
    lines.push(`| ${locale} | ${l.active ? "yes" : "no"} | ${s.messages.gaps} | ${s.marketingCopy.gaps} | ${s.knowledgeLabels.gaps} | ${s.legal.gaps} | ${s.mail.gaps} | ${s.knowledge.published} / ${s.knowledge.groups} | ${s.learningPaths.gaps} | ${s.catalog.missing.length} / ${s.catalog.labels} | ${l.complete ? "complete" : `${l.gaps} gaps`} |`);
  }
  lines.push("");
  lines.push("Numbers are gaps (missing or extra keys, missing modules, missing or unpublished topics, missing labels); 0 means parity with English.");
  for (const [locale, l] of Object.entries(r.locales)) {
    const s = l.sections;
    lines.push("");
    lines.push(`## ${locale} — ${l.complete ? "complete" : `${l.gaps} gaps`}${l.active ? " (active)" : ""}`);
    lines.push("");
    lines.push("### Message catalogs");
    const nsLines = [];
    for (const [ns, entry] of Object.entries(s.messages.namespaces)) {
      if (!entry.file) nsLines.push(`- \`messages/${locale}/${ns}.json\`: file missing (${entry.missing.length} keys)`);
      else if (entry.missing.length || entry.extra.length) nsLines.push(`- \`messages/${locale}/${ns}.json\`: missing ${entry.missing.length}${entry.missing.length ? ` (${cap(entry.missing, 15).join(", ")})` : ""}, extra ${entry.extra.length}${entry.extra.length ? ` (${cap(entry.extra, 15).join(", ")})` : ""}`);
    }
    lines.push(...(nsLines.length ? nsLines : ["- parity"]));
    lines.push("");
    lines.push("### Typed copy");
    const copyLines = [];
    for (const [label, section] of [["Marketing copy", s.marketingCopy], ["Knowledge labels", s.knowledgeLabels], ["Legal", s.legal], ["Mail", s.mail]]) {
      if (section.missingModules.length) copyLines.push(`- ${label}: not translated — ${section.missingModules.join(", ")}`);
      for (const d of section.drift) copyLines.push(`- ${label}: \`${d.name}\` differs from en — missing ${d.missing.length}${d.missing.length ? ` (${cap(d.missing, 10).join(", ")})` : ""}, extra ${d.extra.length}${d.extra.length ? ` (${cap(d.extra, 10).join(", ")})` : ""}`);
    }
    lines.push(...(copyLines.length ? copyLines : ["- parity"]));
    lines.push("");
    lines.push("### Tracking Knowledge");
    const kLines = [];
    if (!s.knowledge.directory) kLines.push(`- \`content/knowledge/${locale}/\` does not exist`);
    if (s.knowledge.missing.length) kLines.push(`- missing (${s.knowledge.missing.length}): ${cap(s.knowledge.missing).join(", ")}`);
    if (s.knowledge.unpublished.length) kLines.push(`- not published (${s.knowledge.unpublished.length}): ${cap(s.knowledge.unpublished.map((u) => `${u.group} [${u.status}]`)).join(", ")}`);
    if (s.knowledge.extra.length) kLines.push(`- not in en (${s.knowledge.extra.length}): ${cap(s.knowledge.extra).join(", ")}`);
    if (s.knowledge.slugDiffers.length) kLines.push(`- localized slugs (${s.knowledge.slugDiffers.length}, informational): ${cap(s.knowledge.slugDiffers.map((d) => `${d.group} → ${d[locale]}`), 15).join(", ")}`);
    lines.push(...(kLines.length ? kLines : [`- parity (${s.knowledge.published} published)`]));
    lines.push("");
    lines.push("### Learning paths");
    const pLines = [];
    if (!s.learningPaths.file) pLines.push(`- \`content/knowledge/paths.${locale}.json\` missing or invalid`);
    if (s.learningPaths.missing.length) pLines.push(`- missing: ${s.learningPaths.missing.join(", ")}`);
    if (s.learningPaths.extra.length) pLines.push(`- not in en: ${s.learningPaths.extra.join(", ")}`);
    if (s.learningPaths.orderDiffers.length) pLines.push(`- different articles or order: ${s.learningPaths.orderDiffers.join(", ")}`);
    lines.push(...(pLines.length ? pLines : ["- parity"]));
    lines.push("");
    lines.push("### Catalogue labels");
    lines.push(s.catalog.missing.length ? `- missing (${s.catalog.missing.length} of ${s.catalog.labels}): ${cap(s.catalog.missing).join(", ")}` : "- parity");
  }
  lines.push("");
  return lines.join("\n");
}
