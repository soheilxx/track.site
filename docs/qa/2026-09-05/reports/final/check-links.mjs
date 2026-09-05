// Verifies that every file reference in docs/16-release-report.md resolves to an existing file.
// Handles markdown links, backtick repo paths, `{a,b}` alternations, `*` globs, `<placeholder>` segments
// and the document shorthand `docs/NN` (= any file docs/NN-*.md).
// Usage: node check-links.mjs <repoRoot> <mdFile>
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const [root, file] = process.argv.slice(2);
const abs = resolve(root, file);
const text = readFileSync(abs, "utf8");
const seen = new Map();
const PREFIX = /^(docs|apps|packages|scripts|infra|integrations)\//;

function add(target, line, kind) {
  const clean = target.replace(/#.*$/, "").trim().replace(/\/\*\*$/, "").replace(/\/$/, "");
  if (!clean || /^(https?:|mailto:)/.test(clean)) return;
  if (!seen.has(clean)) seen.set(clean, { line, kind });
}

text.split(/\r?\n/).forEach((ln, i) => {
  for (const m of ln.matchAll(/\]\(([^)\s]+)\)/g)) add(m[1], i + 1, "md-link");
  for (const m of ln.matchAll(/`((?:docs|apps|packages|scripts|infra|integrations)\/[^`\s]+)`/g)) add(m[1], i + 1, "code-path");
});

function expandBraces(p) {
  const m = /\{([^{}]+)\}/.exec(p);
  if (!m) return [p];
  return m[1].split(",").flatMap((alt) => expandBraces(p.replace(m[0], alt.trim())));
}

function globExists(base, pattern) {
  // pattern relative to base, may contain * and <placeholder> segments (treated as *)
  const segs = pattern.replace(/<[^>]+>/g, "*").split("/");
  let dirs = [base];
  for (const seg of segs) {
    const next = [];
    for (const d of dirs) {
      if (!existsSync(d) || !statSync(d).isDirectory()) continue;
      if (seg.includes("*")) {
        const re = new RegExp("^" + seg.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
        for (const e of readdirSync(d)) if (re.test(e)) next.push(join(d, e));
      } else if (existsSync(join(d, seg))) next.push(join(d, seg));
    }
    dirs = next;
    if (!dirs.length) return false;
  }
  return dirs.length > 0;
}

const results = [];
for (const [target, { line, kind }] of seen) {
  let ok = false;
  let how = "";
  for (const variant of expandBraces(target)) {
    const isRepoPath = PREFIX.test(variant);
    const bases = isRepoPath ? [root] : [dirname(abs)];
    // docs/NN shorthand (section reference to a numbered document)
    const short = /^docs\/(\d\d)$/.exec(variant);
    if (short) {
      const hit = readdirSync(resolve(root, "docs")).some((e) => e.startsWith(short[1] + "-") && e.endsWith(".md"));
      ok = hit;
      how = "docs-shorthand";
      if (!ok) break;
      continue;
    }
    let found = false;
    for (const b of bases) {
      if (globExists(b, variant)) {
        found = true;
        how = variant.includes("*") || variant.includes("<") ? "glob" : "exact";
        break;
      }
    }
    // a path quoted relative to apps/web (e.g. `scripts/qa/crawl.mjs`)
    if (!found && variant.startsWith("scripts/") && globExists(resolve(root, "apps/web"), variant)) {
      found = true;
      how = "relative-to-apps/web";
    }
    ok = found;
    if (!ok) break;
  }
  results.push({ target, line, kind, ok, how });
}

const missing = results.filter((r) => !r.ok);
const counts = {};
for (const r of results) counts[r.ok ? r.how : "missing"] = (counts[r.ok ? r.how : "missing"] ?? 0) + 1;
console.log(`checked ${results.length} unique references in ${file}: ${JSON.stringify(counts)}`);
for (const m of missing) console.log(`  MISSING line ${m.line} [${m.kind}] ${m.target}`);
for (const r of results.filter((r) => r.ok && r.how !== "exact")) console.log(`  ok (${r.how}) line ${r.line} ${r.target}`);
process.exit(missing.length ? 1 : 0);
