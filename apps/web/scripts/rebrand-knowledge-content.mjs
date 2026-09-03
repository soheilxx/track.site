#!/usr/bin/env node
/**
 * Brand pass over the Tracking Knowledge articles (redesign supplement §2): the visible product name
 * is "Track". `track.site` may only remain where the domain or a technical address is meant. The
 * front-matter migration (`migrate-knowledge-frontmatter.mjs`) never touches article text, so this
 * script rewrites the product mentions in front matter (title, description, excerpt …) and body.
 *
 * Idempotent: `node apps/web/scripts/rebrand-knowledge-content.mjs [--check]` (`--check` exits 1 when
 * a file would still change, for CI).
 *
 * Rules:
 *   - technical addresses stay verbatim: `cdn.track.site`, `https://track.site/...`, `//track.site`,
 *     `name@track.site`, `track.site/path`
 *   - `track.site's`     → `Track's`
 *   - `track.site-SDK`   → `Track-SDK` (German compounds keep their hyphen)
 *   - any other `track.site` word (case-insensitive) → `Track`
 * Remaining technical mentions are listed with context so an editor can confirm they are addresses.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const contentRoot = path.resolve(here, "..", "content", "knowledge");
const check = process.argv.includes("--check");

/** Visible product name (supplement §2). */
export const BRAND = "Track";

/**
 * A `track.site` that is a product mention: not part of a host name (`cdn.track.site`), not after a
 * scheme or `//`, not an e-mail domain (`@track.site`) and not the start of a URL path (`track.site/`).
 */
export const PRODUCT_MENTION = /(?<![A-Za-z0-9.@/])track\.site(?![A-Za-z0-9/])/gi;

/** Every `track.site` that is left after the rewrite (technical addresses), with context. */
const ANY_MENTION = /track\.site/gi;

export function rebrand(text) {
  return text.replace(PRODUCT_MENTION, BRAND);
}

function contexts(text, re) {
  const out = [];
  for (const m of text.matchAll(re)) {
    const start = Math.max(0, m.index - 30);
    out.push(text.slice(start, m.index + m[0].length + 30).replace(/\s+/g, " "));
  }
  return out;
}

function run() {
  const locales = readdirSync(contentRoot).filter((d) => statSync(path.join(contentRoot, d)).isDirectory());
  let files = 0;
  let changed = 0;
  let replaced = 0;
  const residual = [];
  for (const locale of locales) {
    const dir = path.join(contentRoot, locale);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
      files += 1;
      const raw = readFileSync(path.join(dir, file), "utf8");
      const count = (raw.match(PRODUCT_MENTION) ?? []).length;
      const next = rebrand(raw);
      if (next !== raw) {
        changed += 1;
        replaced += count;
        if (!check) writeFileSync(path.join(dir, file), next, "utf8");
      }
      for (const ctx of contexts(next, ANY_MENTION)) residual.push(`${locale}/${file}: …${ctx}…`);
    }
  }
  const verb = check ? "would change" : "changed";
  process.stdout.write(`knowledge brand pass: ${files} files in ${locales.join("/")}, ${changed} ${verb}, ${replaced} product mentions → "${BRAND}"\n`);
  if (residual.length) {
    process.stdout.write(`${residual.length} technical track.site mention(s) kept (domain / address):\n`);
    for (const r of residual) process.stdout.write(`  ${r}\n`);
  }
  if (check && changed) process.exit(1);
}

run();
