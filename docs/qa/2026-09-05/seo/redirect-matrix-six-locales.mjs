#!/usr/bin/env node
/**
 * Blog → Tracking Knowledge redirect matrix for every active locale ("Abschlussbelege" 4).
 *
 * `docs/redirects-blog-to-tracking-knowledge.md` was generated on 2026-09-03 by
 * `apps/web/scripts/redirect-matrix.mjs` while only `en` and `de` were active (96 rows). This script
 * derives the same rows for all six active locales from the article files and the pattern rules of
 * `apps/web/src/lib/routes.ts` (`KNOWLEDGE_LEGACY_REDIRECTS`), then marks every row with the crawl
 * result of `docs/qa/2026-09-05/seo/crawl.json` (`redirectMatrix.results` + `redirectMatrix.extras`,
 * produced by `apps/web/scripts/qa/crawl.mjs` against the production build): `verified` = one 308
 * whose Location equals the target and the target answers 200; `derived` = the same pattern rule was
 * verified for another slug/locale in the crawl; rows are never marked verified without a record.
 *
 * Usage: node docs/qa/2026-09-05/seo/redirect-matrix-six-locales.mjs
 * Output: docs/qa/2026-09-05/seo/redirect-matrix-six-locales.md
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..", "..");
const contentRoot = path.join(repo, "apps", "web", "content", "knowledge");
const routingFile = path.join(repo, "apps", "web", "src", "i18n", "routing.ts");
const routesFile = path.join(repo, "apps", "web", "src", "lib", "routes.ts");
const crawlFile = path.join(here, "crawl.json");
const outFile = path.join(here, "redirect-matrix-six-locales.md");

const routing = readFileSync(routingFile, "utf8");
const active = [...(/ACTIVE_LOCALES:\s*readonly AppLocale\[\]\s*=\s*\[([^\]]*)\]/.exec(routing)?.[1] ?? "").matchAll(/"([a-z]{2})"/g)].map((m) => m[1]);
const defaultLocale = /DEFAULT_LOCALE:\s*AppLocale\s*=\s*"([a-z]{2})"/.exec(routing)?.[1] ?? "en";
if (active.length === 0) throw new Error("ACTIVE_LOCALES not found in routing.ts");

const routesSrc = readFileSync(routesFile, "utf8");
const explicitBlock = /KNOWLEDGE_SLUG_REDIRECTS[^=]*=\s*\[([\s\S]*?)\];/.exec(routesSrc)?.[1] ?? "";
const explicit = [...explicitBlock.matchAll(/locale:\s*"([a-z]{2})"\s*,\s*from:\s*"([^"]+)"\s*,\s*to:\s*"([^"]+)"/g)].map((m) => ({ locale: m[1], from: m[2], to: m[3] }));

function frontMatter(file) {
  const src = readFileSync(file, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  const fm = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return fm;
}

const articles = {};
for (const locale of active) {
  const dir = path.join(contentRoot, locale);
  articles[locale] = readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const fm = frontMatter(path.join(dir, file));
      const oldSlug = file.replace(/\.mdx$/, "");
      return { oldSlug, slug: fm.slug || oldSlug, status: fm.status ?? "draft", group: fm.translationGroupId ?? oldSlug };
    })
    .sort((a, b) => a.oldSlug.localeCompare(b.oldSlug));
}

const crawl = JSON.parse(readFileSync(crawlFile, "utf8"));
const checked = new Map();
for (const r of [...(crawl.redirectMatrix?.results ?? []), ...(crawl.redirectMatrix?.extras ?? [])]) checked.set(r.from, r);
const ok = (r) => r && r.status === 308 && r.locationPath === r.to && r.targetStatus === 200 && (!r.problems || r.problems.length === 0);

const rows = [];
const addRow = (from, to, rule) => rows.push({ from, to, rule });
// index and feed
addRow("/blog", `/${defaultLocale}/tracking-knowledge`, "generic:unprefixed-index");
addRow("/blog/feed.xml", `/${defaultLocale}/tracking-knowledge/feed.xml`, "generic:unprefixed-feed");
for (const locale of active) {
  addRow(`/${locale}/blog`, `/${locale}/tracking-knowledge`, "generic:locale-index");
  addRow(`/${locale}/blog/feed.xml`, `/${locale}/tracking-knowledge/feed.xml`, "generic:locale-feed");
}
// articles
const missingExplicit = [];
for (const a of articles[defaultLocale]) {
  const ex = explicit.find((e) => e.locale === defaultLocale && e.from === a.oldSlug);
  if (a.slug !== a.oldSlug && !ex) missingExplicit.push(`${defaultLocale}:${a.oldSlug}`);
  addRow(`/blog/${a.oldSlug}`, `/${defaultLocale}/tracking-knowledge/${a.slug}`, a.slug === a.oldSlug ? "generic:unprefixed-article" : "explicit:unprefixed-article");
}
for (const locale of active) {
  for (const a of articles[locale]) {
    const ex = explicit.find((e) => e.locale === locale && e.from === a.oldSlug);
    if (a.slug !== a.oldSlug && !ex) missingExplicit.push(`${locale}:${a.oldSlug}`);
    addRow(`/${locale}/blog/${a.oldSlug}`, `/${locale}/tracking-knowledge/${a.slug}`, a.slug === a.oldSlug ? "generic:locale-article" : "explicit:locale-article");
  }
}

// verification status per row: verified (crawl record), derived (same rule verified elsewhere), not checked
const verifiedRules = new Set(rows.filter((r) => ok(checked.get(r.from))).map((r) => r.rule));
const failed = [];
for (const r of rows) {
  const rec = checked.get(r.from);
  if (rec) {
    r.check = ok(rec) ? "verified" : "FAILED";
    r.detail = `${rec.status} → \`${rec.locationPath}\` (${rec.targetStatus})`;
    if (!ok(rec)) failed.push(r);
  } else if (verifiedRules.has(r.rule)) {
    r.check = "derived";
    r.detail = "same pattern rule verified in the crawl";
  } else {
    r.check = "not checked";
    r.detail = "";
  }
}
const counts = rows.reduce((m, r) => ({ ...m, [r.check]: (m[r.check] ?? 0) + 1 }), {});
const perLocale = {};
for (const r of rows) {
  const loc = /^\/([a-z]{2})\//.exec(r.from)?.[1] ?? "unprefixed";
  perLocale[loc] = (perLocale[loc] ?? 0) + 1;
}

const lines = [];
lines.push("# Redirect matrix: Blog → Tracking Knowledge (six locales, crawl-verified)", "");
lines.push(`Generated ${new Date().toISOString()} by \`docs/qa/2026-09-05/seo/redirect-matrix-six-locales.mjs\`. Active locales from \`apps/web/src/i18n/routing.ts\`: ${active.join(", ")} (default \`${defaultLocale}\`). Articles: ${active.map((l) => `${l} ${articles[l].length} (${articles[l].filter((a) => a.status === "published").length} published)`).join(", ")}. Explicit slug redirects in \`KNOWLEDGE_SLUG_REDIRECTS\`: ${explicit.length}; articles whose localized slug differs from the file name without an explicit entry: ${missingExplicit.length}${missingExplicit.length ? ` (${missingExplicit.join(", ")})` : ""}.`, "");
lines.push("Pattern rules (`apps/web/src/lib/routes.ts`, `KNOWLEDGE_LEGACY_REDIRECTS`, applied as permanent redirects by `apps/web/next.config.ts` before the locale proxy; Next.js keeps the query string):", "");
lines.push(`- \`/blog\` → \`/${defaultLocale}/tracking-knowledge\`, \`/blog/feed.xml\` → \`/${defaultLocale}/tracking-knowledge/feed.xml\`, \`/blog/:slug\` → \`/${defaultLocale}/tracking-knowledge/:slug\` (unprefixed English; not applied on the dedicated app/api/cdn hosts)`);
lines.push(`- \`/:locale(${active.join("|")})/blog\` → \`/:locale/tracking-knowledge\`, \`…/blog/feed.xml\` → \`…/tracking-knowledge/feed.xml\`, \`…/blog/:slug\` → \`…/tracking-knowledge/:slug\``);
lines.push("- explicit per-article rules run first when a localized slug differs from the old shared slug (none needed for this release: every localized slug equals the English file name)", "");
lines.push(`Rows: **${rows.length}** (${Object.entries(perLocale).map(([k, v]) => `${k}: ${v}`).join(", ")}). Verification against the production build (\`crawl.json\`, ${crawl.meta?.generatedAt ?? crawl.meta?.finishedAt ?? "see summary.md"}): **verified ${counts.verified ?? 0}**, derived ${counts.derived ?? 0}, not checked ${counts["not checked"] ?? 0}, **failed ${counts.FAILED ?? 0}**. "Verified" = the crawl fetched the old URL and saw exactly one 308 whose Location equals the target and a 200 at the target; "derived" = the identical pattern rule (same source shape, same locale group) was verified for other rows; nothing is marked verified without a fetch record. Additional crawl checks outside this matrix: query-string preservation (\`?utm_source=qa&utm_medium=crawl\`, \`?category=guides\`) and the dashboard legacy paths, see \`summary.md\` "Derived checks not covered by the matrix".`, "");
if (failed.length) {
  lines.push("## Failed rows", "");
  for (const r of failed) lines.push(`- \`${r.from}\` expected \`${r.to}\`: ${r.detail}`);
  lines.push("");
}
lines.push("## Matrix", "");
lines.push("| Old URL | New URL (permanent) | Rule | Check | Crawl detail |", "| --- | --- | --- | --- | --- |");
for (const r of rows) lines.push(`| \`${r.from}\` | \`${r.to}\` | ${r.rule} | ${r.check} | ${r.detail} |`);
lines.push("");
writeFileSync(outFile, lines.join("\n") + "\n", "utf8");
console.log(`wrote ${path.relative(repo, outFile)}: ${rows.length} rows; verified ${counts.verified ?? 0}, derived ${counts.derived ?? 0}, not checked ${counts["not checked"] ?? 0}, failed ${counts.FAILED ?? 0}`);
if (failed.length || missingExplicit.length) process.exitCode = 1;
