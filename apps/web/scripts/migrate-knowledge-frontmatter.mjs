#!/usr/bin/env node
/**
 * Blog → Tracking Knowledge content migration (redesign supplement §6/§7). Idempotent: run it as
 * often as you like; it only adds what is missing and never rewrites existing front-matter values.
 *
 * For every `content/knowledge/<locale>/<file>.mdx` it
 *   1. adds `translationGroupId` (= the English file name, which is also the shared old slug),
 *   2. adds `slug` (per locale; today identical to the file name so no article URL changes except
 *      the section prefix — a later localisation may change it, the redirect matrix tracks that),
 *   3. adds `topic`, `platforms`, `shopSystems`, `contentType`, `level` from the editorial mapping
 *      table below (derived from the article's category/tags/title — never invented content),
 *   4. rewrites internal links that still point at `/blog/...` to `/tracking-knowledge/...`.
 *
 * Existing fields (title, description, category, tags, status, dates, sources …) are kept verbatim.
 * Usage: `node apps/web/scripts/migrate-knowledge-frontmatter.mjs [--check]` (`--check` exits 1 when
 * a file would change, for CI).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const contentRoot = path.resolve(here, "..", "content", "knowledge");
const check = process.argv.includes("--check");

export const TOPIC_IDS = ["getting-started", "pixel-platform-integrations", "server-side-tracking", "ecommerce-tracking", "consent-privacy", "attribution-analytics", "ai-data-quality", "troubleshooting", "product-updates"];
export const CONTENT_TYPES = ["guide", "tutorial", "reference", "explainer", "update"];
export const LEVELS = ["beginner", "intermediate", "advanced"];

/**
 * Editorial mapping per translation group (English file name). `platforms` use the slugs of
 * `src/lib/integrations-catalog.ts`, `shopSystems` the commerce slugs there.
 */
export const MAPPING = {
  "ad-blockers-itp-measurement": { topic: "troubleshooting", platforms: [], shopSystems: [], contentType: "explainer", level: "intermediate" },
  "affiliate-postbacks-s2s": { topic: "pixel-platform-integrations", platforms: ["affiliate-postbacks"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "ai-assistant-tag-management-safety": { topic: "ai-data-quality", platforms: [], shopSystems: [], contentType: "explainer", level: "intermediate" },
  "click-ids-attribution-windows": { topic: "attribution-analytics", platforms: ["google-ads", "google-marketing-platform", "microsoft", "meta", "tiktok", "linkedin", "reddit", "pinterest", "snapchat", "x", "taboola", "outbrain", "affiliate-postbacks"], shopSystems: [], contentType: "reference", level: "intermediate" },
  "consent-mode-v2-guide": { topic: "consent-privacy", platforms: ["google-ads", "google-analytics"], shopSystems: [], contentType: "guide", level: "intermediate" },
  "data-retention-policy-tracking": { topic: "consent-privacy", platforms: [], shopSystems: [], contentType: "reference", level: "intermediate" },
  "dedup-event-id-order-id": { topic: "server-side-tracking", platforms: ["meta", "google-ads", "google-analytics", "tiktok", "microsoft", "linkedin", "pinterest", "snapchat", "reddit", "x", "google-marketing-platform"], shopSystems: [], contentType: "reference", level: "intermediate" },
  "dsar-deletion-tracking-data": { topic: "consent-privacy", platforms: [], shopSystems: [], contentType: "guide", level: "intermediate" },
  "event-taxonomy-standard-events": { topic: "getting-started", platforms: ["meta", "google-ads", "google-analytics", "tiktok", "linkedin", "pinterest", "snapchat"], shopSystems: [], contentType: "reference", level: "beginner" },
  "first-party-tracking-domains": { topic: "server-side-tracking", platforms: [], shopSystems: [], contentType: "guide", level: "advanced" },
  "ga4-measurement-protocol-eu": { topic: "pixel-platform-integrations", platforms: ["google-analytics"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "google-ads-enhanced-conversions": { topic: "pixel-platform-integrations", platforms: ["google-ads"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "kill-switch-incident-playbook": { topic: "troubleshooting", platforms: [], shopSystems: [], contentType: "guide", level: "intermediate" },
  "lead-gen-tracking-b2b": { topic: "attribution-analytics", platforms: ["linkedin", "google-ads", "meta", "microsoft"], shopSystems: [], contentType: "guide", level: "intermediate" },
  "linkedin-conversions-api-b2b": { topic: "pixel-platform-integrations", platforms: ["linkedin"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "meta-conversions-api-deduplication": { topic: "pixel-platform-integrations", platforms: ["meta"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "microsoft-conversions-api-uet": { topic: "pixel-platform-integrations", platforms: ["microsoft"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "migrating-from-gtm": { topic: "getting-started", platforms: [], shopSystems: [], contentType: "guide", level: "intermediate" },
  "offline-conversions-crm": { topic: "attribution-analytics", platforms: ["google-ads", "meta", "linkedin", "tiktok", "microsoft"], shopSystems: [], contentType: "guide", level: "intermediate" },
  "pii-in-tracking-data": { topic: "consent-privacy", platforms: [], shopSystems: [], contentType: "explainer", level: "intermediate" },
  "reddit-pinterest-snapchat-capi": { topic: "pixel-platform-integrations", platforms: ["reddit", "pinterest", "snapchat"], shopSystems: [], contentType: "reference", level: "intermediate" },
  "server-side-tracking-explained": { topic: "server-side-tracking", platforms: [], shopSystems: [], contentType: "explainer", level: "beginner" },
  "shopify-server-side-purchases": { topic: "ecommerce-tracking", platforms: [], shopSystems: ["shopify"], contentType: "tutorial", level: "intermediate" },
  "shopware-6-tracking": { topic: "ecommerce-tracking", platforms: [], shopSystems: ["shopware"], contentType: "tutorial", level: "intermediate" },
  "signed-configuration-supply-chain": { topic: "product-updates", platforms: [], shopSystems: [], contentType: "explainer", level: "advanced" },
  "subscription-saas-events": { topic: "getting-started", platforms: [], shopSystems: [], contentType: "guide", level: "intermediate" },
  "tcf-2-2-gpp-gpc": { topic: "consent-privacy", platforms: [], shopSystems: [], contentType: "explainer", level: "advanced" },
  "tiktok-events-api-setup": { topic: "pixel-platform-integrations", platforms: ["tiktok"], shopSystems: [], contentType: "tutorial", level: "intermediate" },
  "tracking-health-score": { topic: "ai-data-quality", platforms: [], shopSystems: [], contentType: "reference", level: "intermediate" },
  "woocommerce-server-side-tracking": { topic: "ecommerce-tracking", platforms: [], shopSystems: ["woocommerce"], contentType: "tutorial", level: "intermediate" },
};

for (const [group, m] of Object.entries(MAPPING)) {
  if (!TOPIC_IDS.includes(m.topic)) throw new Error(`${group}: unknown topic ${m.topic}`);
  if (!CONTENT_TYPES.includes(m.contentType)) throw new Error(`${group}: unknown contentType ${m.contentType}`);
  if (!LEVELS.includes(m.level)) throw new Error(`${group}: unknown level ${m.level}`);
}

const yamlString = (s) => JSON.stringify(String(s));
const yamlList = (items) => `[${items.map(yamlString).join(", ")}]`;

/** Splits a file into its front-matter lines (between the `---` fences) and the body. */
function splitFrontMatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return null;
  return { fmLines: m[1].split(/\r?\n/), body: raw.slice(m[0].length), fence: m[0] };
}

const hasKey = (lines, key) => lines.some((l) => new RegExp(`^${key}:`).test(l));

function migrateFile(locale, file, raw, groupIds) {
  const parts = splitFrontMatter(raw);
  if (!parts) throw new Error(`${locale}/${file}: no front matter`);
  const group = file.replace(/\.mdx$/, "");
  if (!groupIds.has(group)) throw new Error(`${locale}/${file}: no English original for translationGroupId "${group}"`);
  const mapping = MAPPING[group];
  if (!mapping) throw new Error(`${group}: missing entry in the editorial mapping table`);

  const additions = [];
  const add = (key, value) => {
    if (!hasKey(parts.fmLines, key)) additions.push(`${key}: ${value}`);
  };
  add("translationGroupId", yamlString(group));
  add("slug", yamlString(group));
  add("topic", yamlString(mapping.topic));
  add("platforms", yamlList(mapping.platforms));
  add("shopSystems", yamlList(mapping.shopSystems));
  add("contentType", yamlString(mapping.contentType));
  add("level", yamlString(mapping.level));

  let fmLines = parts.fmLines;
  if (additions.length) {
    // insert right after `category:` (every article has it) so the taxonomy fields sit together
    const at = fmLines.findIndex((l) => /^category:/.test(l));
    const idx = at === -1 ? fmLines.length : at + 1;
    fmLines = [...fmLines.slice(0, idx), ...additions, ...fmLines.slice(idx)];
  }

  // internal links: /blog/x, /en/blog/x, /de/blog/x (markdown and raw href) → /tracking-knowledge/x
  let body = parts.body;
  let links = 0;
  body = body.replace(/(\]\(|href=["'])(\/(?:[a-z]{2}\/)?)blog(\/|\)|["'])/g, (_all, open, prefix, close) => {
    links += 1;
    return `${open}${prefix}tracking-knowledge${close}`;
  });

  const next = `---\n${fmLines.join("\n")}\n---\n${body}`;
  return { next, changed: next !== raw, additions: additions.length, links };
}

function run() {
  const locales = readdirSync(contentRoot).filter((d) => statSync(path.join(contentRoot, d)).isDirectory());
  const enFiles = readdirSync(path.join(contentRoot, "en")).filter((f) => f.endsWith(".mdx"));
  const groupIds = new Set(enFiles.map((f) => f.replace(/\.mdx$/, "")));
  let files = 0;
  let changed = 0;
  let addedFields = 0;
  let rewrittenLinks = 0;
  for (const locale of locales) {
    const dir = path.join(contentRoot, locale);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
      files += 1;
      const raw = readFileSync(path.join(dir, file), "utf8");
      const result = migrateFile(locale, file, raw, groupIds);
      addedFields += result.additions;
      rewrittenLinks += result.links;
      if (result.changed) {
        changed += 1;
        if (!check) writeFileSync(path.join(dir, file), result.next, "utf8");
      }
    }
  }
  const verb = check ? "would change" : "changed";
  process.stdout.write(`knowledge front matter: ${files} files in ${locales.join("/")}, ${changed} ${verb}, ${addedFields} fields added, ${rewrittenLinks} internal /blog links rewritten\n`);
  if (check && changed) process.exit(1);
}

// Only migrate when executed directly; `validate-knowledge-content.mjs` imports the catalogue constants.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
