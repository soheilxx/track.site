#!/usr/bin/env node
/**
 * Blog → Tracking Knowledge redirect matrix (supplement §6). Reads every knowledge article, derives
 * the old blog URLs (unprefixed English, `/en/blog/...`, `/de/blog/...`, indexes, feeds) and writes
 * `docs/redirects-blog-to-tracking-knowledge.md` with the exact permanent target of each one.
 *
 * The redirects themselves live in `apps/web/src/lib/routes.ts` (`KNOWLEDGE_LEGACY_REDIRECTS`, applied
 * by `next.config.ts`): generic `/blog/:slug` → `/en/tracking-knowledge/:slug` rules plus explicit
 * entries for articles whose localized slug differs from the old shared slug. This script flags such
 * rows and exits 1 when an explicit entry is missing, so the matrix and the config cannot drift.
 *
 * Usage: `node apps/web/scripts/redirect-matrix.mjs` (from anywhere).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const contentRoot = path.join(webRoot, "content", "knowledge");
const outFile = path.join(repoRoot, "docs", "redirects-blog-to-tracking-knowledge.md");
const routingFile = path.join(webRoot, "src", "i18n", "routing.ts");
const routesFile = path.join(webRoot, "src", "lib", "routes.ts");

const NEW_SECTION = "/tracking-knowledge";
const OLD_SECTION = "/blog";

function activeLocales() {
  const src = readFileSync(routingFile, "utf8");
  const m = /ACTIVE_LOCALES:\s*readonly AppLocale\[\]\s*=\s*\[([^\]]*)\]/.exec(src);
  const list = m ? [...m[1].matchAll(/"([a-z]{2})"/g)].map((x) => x[1]) : [];
  const d = /DEFAULT_LOCALE:\s*AppLocale\s*=\s*"([a-z]{2})"/.exec(src);
  return { locales: list.length ? list : ["en", "de"], defaultLocale: d ? d[1] : "en" };
}

function explicitRedirectsInConfig() {
  const src = readFileSync(routesFile, "utf8");
  const block = /KNOWLEDGE_SLUG_REDIRECTS[^=]*=\s*\[([\s\S]*?)\];/.exec(src);
  if (!block) return [];
  return [...block[1].matchAll(/locale:\s*"([a-z]{2})"\s*,\s*from:\s*"([^"]+)"\s*,\s*to:\s*"([^"]+)"/g)].map((m) => ({ locale: m[1], from: m[2], to: m[3] }));
}

function readArticles(locale) {
  const dir = path.join(contentRoot, locale);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const { data } = matter(readFileSync(path.join(dir, file), "utf8"));
      const oldSlug = file.replace(/\.mdx$/, "");
      const slug = typeof data.slug === "string" && data.slug ? data.slug : oldSlug;
      return { locale, oldSlug, slug, translationGroupId: data.translationGroupId ?? oldSlug, status: data.status ?? "draft", title: String(data.title ?? "") };
    })
    .sort((a, b) => a.oldSlug.localeCompare(b.oldSlug));
}

function run() {
  const { locales, defaultLocale } = activeLocales();
  const explicit = explicitRedirectsInConfig();
  const rows = [];
  const missingExplicit = [];
  const add = (from, to, rule, note = "") => rows.push({ from, to, rule, note });

  // indexes + feeds: unprefixed English first, then every active locale
  add(OLD_SECTION, `/${defaultLocale}${NEW_SECTION}`, "generic");
  add(`${OLD_SECTION}/feed.xml`, `/${defaultLocale}${NEW_SECTION}/feed.xml`, "generic");
  for (const locale of locales) {
    add(`/${locale}${OLD_SECTION}`, `/${locale}${NEW_SECTION}`, "generic");
    add(`/${locale}${OLD_SECTION}/feed.xml`, `/${locale}${NEW_SECTION}/feed.xml`, "generic");
  }

  // articles: old URLs used the shared file name; the new URL uses the localized slug
  let articleRows = 0;
  for (const locale of locales) {
    for (const a of readArticles(locale)) {
      const renamed = a.slug !== a.oldSlug;
      const rule = renamed ? "explicit" : "generic";
      const covered = !renamed || explicit.some((e) => e.locale === locale && e.from === a.oldSlug && e.to === a.slug);
      if (!covered) missingExplicit.push(`${locale}: ${a.oldSlug} → ${a.slug}`);
      const note = [a.status !== "published" ? `status ${a.status}` : "", renamed && !covered ? "MISSING explicit redirect in routes.ts" : ""].filter(Boolean).join("; ");
      if (locale === defaultLocale) {
        add(`${OLD_SECTION}/${a.oldSlug}`, `/${locale}${NEW_SECTION}/${a.slug}`, rule, note);
        articleRows += 1;
      }
      add(`/${locale}${OLD_SECTION}/${a.oldSlug}`, `/${locale}${NEW_SECTION}/${a.slug}`, rule, note);
      articleRows += 1;
    }
  }

  const generated = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Redirect matrix: Blog → Tracking Knowledge",
    "",
    `Generated ${generated} by \`node apps/web/scripts/redirect-matrix.mjs\` from \`apps/web/content/knowledge/**\`. Do not edit by hand — re-run the script after adding, renaming or translating articles.`,
    "",
    "## Rules",
    "",
    "- Every old URL gets a **permanent (308/301) redirect straight to its final target** — no chains, no loops. The unprefixed English URLs (`/blog/...`) point directly at `/en/tracking-knowledge/...` instead of passing through `/en/blog/...`.",
    "- Query strings (UTM parameters, `?category=`) are preserved by Next.js automatically.",
    `- Rules are defined in \`apps/web/src/lib/routes.ts\` (\`KNOWLEDGE_LEGACY_REDIRECTS\`) and applied by \`apps/web/next.config.ts\` \`redirects()\`; they run before the locale proxy. Active locales: ${locales.map((l) => `\`${l}\``).join(", ")}; default \`${defaultLocale}\`.`,
    "- `generic` rows are covered by the pattern rules (`/blog` → `/en/tracking-knowledge`, `/blog/feed.xml` → `/en/tracking-knowledge/feed.xml`, `/blog/:slug` → `/en/tracking-knowledge/:slug`, and `/:locale/blog[/feed.xml|/:slug]` → `/:locale/tracking-knowledge[...]`).",
    "- `explicit` rows are articles whose localized slug differs from the old shared slug; each needs an entry in `KNOWLEDGE_SLUG_REDIRECTS` (checked by this script).",
    "- The old `/[locale]/blog` routes no longer exist in the app; only these redirects answer them.",
    "",
    "## Summary",
    "",
    `- ${rows.length} old URLs: ${rows.length - articleRows} index/feed URLs, ${articleRows} article URLs (${locales.length} locales × 30 topics + 30 unprefixed English).`,
    `- ${rows.filter((r) => r.rule === "explicit").length} explicit slug redirects required, ${missingExplicit.length} missing.`,
    "",
    "## Matrix",
    "",
    "| Old URL | New URL (permanent) | Rule | Note |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| \`${r.from}\` | \`${r.to}\` | ${r.rule} | ${r.note} |`),
    "",
  ];
  writeFileSync(outFile, lines.join("\n"), "utf8");
  process.stdout.write(`redirect matrix: ${rows.length} rows (${articleRows} article URLs) → ${path.relative(repoRoot, outFile)}\n`);
  if (missingExplicit.length) {
    console.error(`missing explicit redirects in apps/web/src/lib/routes.ts KNOWLEDGE_SLUG_REDIRECTS:\n  ${missingExplicit.join("\n  ")}`);
    process.exit(1);
  }
}

run();
