#!/usr/bin/env node
/**
 * Tracking Knowledge content validator (rules: docs/14-knowledge-content-rules.md).
 *
 * Checks every `content/knowledge/<locale>/*.mdx` and the curated learning paths
 * (`content/knowledge/paths.<locale>.json`) against the catalogues the app itself uses:
 *   - every translation group exists in every active locale (`src/i18n/routing.ts`),
 *   - required front matter (title, description, publishedAt), valid `status`, dates and slug,
 *   - `topic`, `level`, `contentType` from the fixed catalogue (shared with the migration script),
 *   - `platforms[]` / `shopSystems[]` are integration slugs of `src/lib/integrations-catalog.ts`
 *     (non-commerce / commerce) and identical across the language versions of a group,
 *   - `takeaways`: 3–4 non-empty plain-text strings (no Markdown backticks),
 *   - exactly one `featured: true` group per locale, the same group in every locale,
 *   - learning paths: 3–4 paths, same ids and group order in every locale, 4–7 existing groups each,
 *   - internal links in the body resolve against the published slugs (`/tracking-knowledge/<slug>` of the same locale, no `/blog/`).
 *
 * Usage: `node apps/web/scripts/validate-knowledge-content.mjs` — prints every finding and exits 1
 * when there is at least one. Pure Node, no build step; safe to run in CI next to
 * `migrate-knowledge-frontmatter.mjs --check`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { CONTENT_TYPES, LEVELS, TOPIC_IDS } from "./migrate-knowledge-frontmatter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const contentRoot = path.join(webRoot, "content", "knowledge");

const KNOWLEDGE_STATUSES = ["draft", "translated", "reviewed", "published"];
const SLUG_RE = /^[a-z0-9-]{3,120}$/;
const PATH_ID_RE = /^[a-z0-9-]{3,60}$/;
const TAKEAWAYS_MIN = 3;
const TAKEAWAYS_MAX = 4;
const PATHS_MIN = 3;
const PATHS_MAX = 4;
const PATH_GROUPS_MIN = 4;
const PATH_GROUPS_MAX = 7;

const findings = [];
const fail = (where, message) => findings.push(`${where}: ${message}`);

/** Active locales straight from the routing module so the validator never drifts from the app. */
function readActiveLocales() {
  const source = readFileSync(path.join(webRoot, "src", "i18n", "routing.ts"), "utf8");
  // anchored on the declaration line so the comment that mentions ACTIVE_LOCALES (and ALL_LOCALES) is not matched
  const match = /export const ACTIVE_LOCALES[^=\n]*=\s*\[([^\]]*)\]/.exec(source);
  const locales = match ? Array.from(match[1].matchAll(/"([a-z]{2})"/g), (m) => m[1]) : [];
  if (!locales.includes("en") || !locales.includes("de")) throw new Error("could not read ACTIVE_LOCALES (en, de) from src/i18n/routing.ts");
  return locales;
}

/** Integration slugs by kind: `platforms` = every non-commerce entry, `shops` = commerce entries. */
function readIntegrationSlugs() {
  const source = readFileSync(path.join(webRoot, "src", "lib", "integrations-catalog.ts"), "utf8");
  const platforms = new Set();
  const shops = new Set();
  for (const m of source.matchAll(/slug:\s*"([a-z0-9-]+)"[\s\S]*?category:\s*"([a-z]+)"/g)) {
    (m[2] === "commerce" ? shops : platforms).add(m[1]);
  }
  if (platforms.size === 0 || shops.size === 0) throw new Error("could not read integration slugs from src/lib/integrations-catalog.ts");
  return { platforms, shops };
}

const isDate = (value) => (value instanceof Date && !Number.isNaN(value.getTime())) || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value)));
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isStringList = (value) => Array.isArray(value) && value.every((v) => typeof v === "string");
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function readArticles(locales) {
  /** @type {Map<string, Map<string, {file: string, data: Record<string, unknown>, body: string}>>} group → locale → article */
  const groups = new Map();
  const slugsByLocale = new Map();
  for (const locale of locales) {
    const dir = path.join(contentRoot, locale);
    if (!existsSync(dir)) {
      fail(locale, "content directory missing");
      continue;
    }
    const slugs = new Set();
    const publishedSlugs = new Set();
    slugsByLocale.set(locale, publishedSlugs);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort()) {
      const where = `${locale}/${file}`;
      const name = file.replace(/\.mdx$/, "");
      let parsed;
      try {
        parsed = matter(readFileSync(path.join(dir, file), "utf8"));
      } catch (error) {
        fail(where, `front matter does not parse (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }
      const data = parsed.data;
      const group = isNonEmptyString(data.translationGroupId) ? data.translationGroupId : name;
      if (!isNonEmptyString(data.translationGroupId)) fail(where, "translationGroupId missing");
      const slug = isNonEmptyString(data.slug) ? data.slug : name;
      if (!SLUG_RE.test(slug)) fail(where, `slug "${slug}" is not URL-safe`);
      if (slugs.has(slug)) fail(where, `slug "${slug}" is used twice in ${locale}`);
      slugs.add(slug);
      if (data.status === "published") publishedSlugs.add(slug);
      const byLocale = groups.get(group) ?? new Map();
      if (byLocale.has(locale)) fail(where, `translationGroupId "${group}" is used twice in ${locale}`);
      byLocale.set(locale, { file: where, data, body: parsed.content });
      groups.set(group, byLocale);
    }
  }
  return { groups, slugsByLocale };
}

function checkArticle(where, data, catalog) {
  for (const key of ["title", "description"]) if (!isNonEmptyString(data[key])) fail(where, `${key} missing`);
  if (!isDate(data.publishedAt)) fail(where, "publishedAt missing or not a date");
  for (const key of ["updatedAt", "reviewedAt"]) if (data[key] !== undefined && data[key] !== null && !isDate(data[key])) fail(where, `${key} is not a date`);
  if (!KNOWLEDGE_STATUSES.includes(data.status)) fail(where, `status "${data.status}" is not one of ${KNOWLEDGE_STATUSES.join("|")}`);
  if (!TOPIC_IDS.includes(data.topic)) fail(where, `topic "${data.topic}" is not one of the nine topics`);
  if (!LEVELS.includes(data.level)) fail(where, `level "${data.level}" is not one of ${LEVELS.join("|")}`);
  if (!CONTENT_TYPES.includes(data.contentType)) fail(where, `contentType "${data.contentType}" is not one of ${CONTENT_TYPES.join("|")}`);

  for (const [key, allowed, label] of [
    ["platforms", catalog.platforms, "platform"],
    ["shopSystems", catalog.shops, "shop system"],
  ]) {
    const list = data[key];
    if (!isStringList(list)) {
      fail(where, `${key} must be a list of strings`);
      continue;
    }
    for (const slug of list) if (!allowed.has(slug)) fail(where, `${key} contains "${slug}", which is not a ${label} slug of the integrations catalogue`);
    if (new Set(list).size !== list.length) fail(where, `${key} contains duplicates`);
  }

  const takeaways = data.takeaways;
  if (!Array.isArray(takeaways)) fail(where, "takeaways missing (expected a list of 3–4 strings)");
  else {
    if (takeaways.length < TAKEAWAYS_MIN || takeaways.length > TAKEAWAYS_MAX) fail(where, `takeaways has ${takeaways.length} entries, expected ${TAKEAWAYS_MIN}–${TAKEAWAYS_MAX}`);
    takeaways.forEach((t, i) => {
      if (!isNonEmptyString(t)) fail(where, `takeaways[${i}] is empty or not a string`);
      else if (t.includes("`")) fail(where, `takeaways[${i}] contains Markdown backticks; takeaways are rendered as plain text`);
    });
  }

  if (data.featured !== undefined && typeof data.featured !== "boolean") fail(where, "featured must be true or false");
}

function checkLinks(where, locale, body, slugs) {
  const targets = [];
  for (const m of body.matchAll(/\]\((\/[^)\s]*)\)/g)) targets.push(m[1]);
  for (const m of body.matchAll(/href=["'](\/[^"']*)["']/g)) targets.push(m[1]);
  for (const target of targets) {
    if (/^\/(?:[a-z]{2}\/)?blog(?:\/|$)/.test(target)) {
      fail(where, `legacy internal link ${target} (use /tracking-knowledge/<slug>)`);
      continue;
    }
    const m = /^\/(?:([a-z]{2})\/)?tracking-knowledge\/([^/?#]+)/.exec(target);
    if (!m) continue;
    if (m[1] && m[1] !== locale) fail(where, `internal link ${target} points at another locale`);
    if (!slugs.has(m[2])) fail(where, `internal link ${target} has no published ${locale} article`);
  }
}

function checkPaths(locales, groups) {
  /** @type {Map<string, Array<{id: string, groupIds: string[]}>>} */
  const byLocale = new Map();
  for (const locale of locales) {
    const file = path.join(contentRoot, `paths.${locale}.json`);
    const where = `paths.${locale}.json`;
    if (!existsSync(file)) {
      fail(where, "missing");
      continue;
    }
    let paths;
    try {
      paths = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      fail(where, `does not parse (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    if (!Array.isArray(paths)) {
      fail(where, "must be a JSON array of paths");
      continue;
    }
    if (paths.length < PATHS_MIN || paths.length > PATHS_MAX) fail(where, `${paths.length} paths, expected ${PATHS_MIN}–${PATHS_MAX}`);
    const ids = new Set();
    const normalized = [];
    paths.forEach((p, i) => {
      const at = `${where}[${i}]`;
      if (!p || typeof p !== "object") {
        fail(at, "must be an object { id, title, description, groupIds }");
        return;
      }
      if (!isNonEmptyString(p.id) || !PATH_ID_RE.test(p.id)) fail(at, `id "${p.id}" must match ${PATH_ID_RE}`);
      else if (ids.has(p.id)) fail(at, `id "${p.id}" is used twice`);
      ids.add(p.id);
      for (const key of ["title", "description"]) if (!isNonEmptyString(p[key])) fail(at, `${key} missing`);
      if (!isStringList(p.groupIds)) fail(at, "groupIds must be a list of translationGroupIds");
      else {
        if (p.groupIds.length < PATH_GROUPS_MIN || p.groupIds.length > PATH_GROUPS_MAX) fail(at, `${p.groupIds.length} groups, expected ${PATH_GROUPS_MIN}–${PATH_GROUPS_MAX}`);
        if (new Set(p.groupIds).size !== p.groupIds.length) fail(at, "groupIds contains duplicates");
        for (const id of p.groupIds) {
          const version = groups.get(id)?.get(locale);
          if (!version) fail(at, `groupIds references "${id}", which has no ${locale} article`);
          else if (version.data.status !== "published") fail(at, `groupIds references "${id}", whose ${locale} version is not published`);
        }
      }
      normalized.push({ id: String(p.id), groupIds: isStringList(p.groupIds) ? p.groupIds : [] });
    });
    byLocale.set(locale, normalized);
  }
  const reference = byLocale.get("en");
  if (!reference) return;
  for (const [locale, paths] of byLocale) {
    if (locale === "en") continue;
    if (!sameList(paths.map((p) => p.id), reference.map((p) => p.id))) fail(`paths.${locale}.json`, `path ids/order differ from paths.en.json (${paths.map((p) => p.id).join(", ")} vs ${reference.map((p) => p.id).join(", ")})`);
    for (const p of paths) {
      const twin = reference.find((r) => r.id === p.id);
      if (twin && !sameList(p.groupIds, twin.groupIds)) fail(`paths.${locale}.json`, `path "${p.id}" lists different groups than paths.en.json`);
    }
  }
}

function run() {
  const locales = readActiveLocales();
  const catalog = readIntegrationSlugs();
  const { groups, slugsByLocale } = readArticles(locales);

  const taxonomyKeys = ["topic", "platforms", "shopSystems", "contentType", "level"];
  const featuredByLocale = new Map(locales.map((l) => [l, []]));
  for (const [group, byLocale] of groups) {
    for (const locale of locales) if (!byLocale.has(locale)) fail(group, `no ${locale} version`);
    if (!byLocale.has("en")) fail(group, "translationGroupId has no English original");
    const reference = byLocale.get("en") ?? byLocale.values().next().value;
    for (const [locale, article] of byLocale) {
      checkArticle(article.file, article.data, catalog);
      checkLinks(article.file, locale, article.body, slugsByLocale.get(locale) ?? new Set());
      if (article.data.featured === true) featuredByLocale.get(locale)?.push(group);
      if (article !== reference) {
        for (const key of taxonomyKeys) {
          const a = article.data[key];
          const b = reference.data[key];
          const equal = Array.isArray(a) && Array.isArray(b) ? sameList(a, b) : a === b;
          if (!equal) fail(article.file, `${key} differs from ${reference.file} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
        }
      }
    }
  }

  for (const [locale, featured] of featuredByLocale) {
    if (featured.length !== 1) fail(`featured (${locale})`, `expected exactly one featured group, found ${featured.length}${featured.length ? `: ${featured.join(", ")}` : ""}`);
  }
  const featuredSets = Array.from(featuredByLocale.values(), (f) => f.slice().sort().join(","));
  if (new Set(featuredSets).size > 1) fail("featured", "the featured group differs between locales");

  checkPaths(locales, groups);

  const files = Array.from(groups.values()).reduce((n, byLocale) => n + byLocale.size, 0);
  if (findings.length) {
    for (const f of findings) process.stderr.write(`  - ${f}\n`);
    process.stderr.write(`knowledge content: ${findings.length} finding(s) in ${files} files / ${groups.size} groups / ${locales.join(",")}\n`);
    process.exit(1);
  }
  process.stdout.write(`knowledge content: ${files} files, ${groups.size} groups, locales ${locales.join("/")}, learning paths and featured story valid\n`);
}

run();
