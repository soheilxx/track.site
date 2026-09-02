#!/usr/bin/env node
// Fails when identifiers from the excluded urlshorter modules appear in product code.
// See docs/02-migration-map.md section 2.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// urlshorter product identifiers plus forbidden OpenAI API surfaces (Responses API only, see docs/08).
const forbidden = ["ShortLink", "shortcode", "SweepstakesEntry", "AmazonRank", "TagSiteConfig", "lze(", "/t.js", "lizenzzumerfolg", "chat.completions", "beta.assistants", "beta.threads"];
const skipDirs = new Set(["node_modules", ".git", ".next", "dist", ".turbo", "docs", "coverage", "playwright-report", "test-results"]);
const exts = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".sql", ".php", ".md", ".mdx", ".yml", ".yaml", ".toml"]);
let failures = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(root, full);
    if (skipDirs.has(entry)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!exts.has(path.extname(entry))) continue;
    if (rel === path.join("scripts", "check-source-boundary.mjs")) continue;
    const text = readFileSync(full, "utf8");
    for (const word of forbidden) {
      if (text.includes(word)) {
        console.error(`forbidden identifier "${word}" in ${rel}`);
        failures++;
      }
    }
  }
}

walk(root);
if (failures > 0) {
  console.error(`source boundary violated (${failures})`);
  process.exit(1);
}
console.log("source boundary ok");
