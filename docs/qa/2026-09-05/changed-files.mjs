#!/usr/bin/env node
/**
 * "Abschlussbelege" 1: files and routes changed by the Track redesign programme.
 *
 * Reads `git diff` between the pre-redesign commit (0f0f5b5) and HEAD, plus the uncommitted working
 * tree (task F1 fixes and QA tooling), groups the files by area and lists every file; then compares
 * the Next.js build manifests of the BEFORE worktree and the AFTER build to list the public and
 * dashboard routes. Output: docs/qa/2026-09-05/changed-files.md
 *
 * Usage: node docs/qa/2026-09-05/changed-files.mjs [--base 0f0f5b5] [--before <path to before worktree>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const base = opt("--base", "0f0f5b5");
const beforeRoot = opt("--before", path.resolve(repo, "..", "track-site-before"));
const outFile = path.join(here, "changed-files.md");

const git = (cmd) => execSync(`git ${cmd}`, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const head = git("rev-parse --short HEAD").trim();
const baseFull = git(`rev-parse ${base}`).trim();
const commits = git(`log --oneline ${base}..HEAD`).trim().split(/\r?\n/).filter(Boolean);

/** area of a repository path (first matching rule wins) */
const AREAS = [
  [/^apps\/web\/src\/app\/\[locale\]\//, "web · public routes (marketing, knowledge, auth, metadata) under `/[locale]`"],
  [/^apps\/web\/src\/app\/app\//, "web · dashboard routes `/app/**`"],
  [/^apps\/web\/src\/app\/api\//, "web · API routes"],
  [/^apps\/web\/src\/app\//, "web · root app files (layout, fonts, globals, icons, manifest, robots, sitemaps)"],
  [/^apps\/web\/src\/components\/marketing\/demo\//, "web · interactive hero demo"],
  [/^apps\/web\/src\/components\/marketing\/knowledge\//, "web · Tracking Knowledge components"],
  [/^apps\/web\/src\/components\/marketing\/pricing\//, "web · pricing components"],
  [/^apps\/web\/src\/components\/marketing\//, "web · marketing components (header, footer, home, features, integrations, auth shell)"],
  [/^apps\/web\/src\/components\/app\/shell\//, "web · dashboard shell (viewport-fixed layout, Track AI panel, Living AI Core, palette)"],
  [/^apps\/web\/src\/components\/app\//, "web · dashboard modules (components)"],
  [/^apps\/web\/src\/components\/chat\//, "web · Track AI chat (store, reducer, virtual list, workspace moves)"],
  [/^apps\/web\/src\/components\/destinations\//, "web · destination wizard"],
  [/^apps\/web\/src\/components\//, "web · other components"],
  [/^apps\/web\/src\/lib\/marketing-copy\//, "web · marketing copy modules ×6"],
  [/^apps\/web\/src\/lib\/legal-copy\//, "web · legal copy ×6"],
  [/^apps\/web\/src\/lib\//, "web · lib (knowledge loader, routes, seo, format, brand guard)"],
  [/^apps\/web\/src\/server\/mail\//, "web · mail templates ×6"],
  [/^apps\/web\/src\/server\//, "web · server (data access, actions, auth, billing, entitlements)"],
  [/^apps\/web\/src\/i18n\//, "web · i18n routing and namespaces"],
  [/^apps\/web\/src\//, "web · other src"],
  [/^apps\/web\/messages\//, "web · UI message catalogs ×6"],
  [/^apps\/web\/content\/knowledge\//, "web · Tracking Knowledge articles + learning paths ×6"],
  [/^apps\/web\/content\/blog\//, "web · legacy blog content (removed)"],
  [/^apps\/web\/e2e\//, "web · e2e (Playwright specs, visual baselines)"],
  [/^apps\/web\/scripts\//, "web · scripts (parity, redirects, knowledge tooling, QA)"],
  [/^apps\/web\/public\//, "web · public assets (brand)"],
  [/^apps\/web\//, "web · config (next.config, playwright, package, vitest, tsconfig)"],
  [/^apps\/worker\//, "worker"],
  [/^apps\/collector\//, "collector"],
  [/^packages\/catalog\//, "packages/catalog (tariff catalogue, new)"],
  [/^packages\/ui\//, "packages/ui (design system tokens, primitives, brand)"],
  [/^packages\/ai\//, "packages/ai (UI event contract, scope gate, evals)"],
  [/^packages\/db\//, "packages/db (schema, migrations 0004–0013, repositories, seed)"],
  [/^packages\//, "packages · other"],
  [/^docs\/qa\//, "docs · QA evidence pack"],
  [/^docs\//, "docs"],
  [/^\.github\//, "CI"],
  [/./, "root (workspace, lockfile, env example, status, gitignore, scripts)"],
];
const areaOf = (file) => AREAS.find(([re]) => re.test(file))[1];

/** committed changes base..HEAD: status (A/M/D/Rnnn) + numstat */
function committedChanges() {
  const status = new Map();
  for (const line of git(`diff --name-status -M ${base}..HEAD`).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [st, a, b] = line.split("\t");
    if (st.startsWith("R")) status.set(b, { status: "R", from: a });
    else status.set(a, { status: st[0] });
  }
  const num = new Map();
  for (const line of git(`diff --numstat -M ${base}..HEAD`).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [add, del, file] = line.split("\t");
    // renames appear as "old => new" or "{a => b}/rest"
    const name = file.includes(" => ") ? renamedName(file) : file;
    num.set(name, { add: add === "-" ? 0 : Number(add), del: del === "-" ? 0 : Number(del), binary: add === "-" });
  }
  const files = [];
  for (const [file, st] of status) {
    const n = num.get(file) ?? { add: 0, del: 0, binary: false };
    files.push({ file, ...st, ...n });
  }
  return files.sort((x, y) => x.file.localeCompare(y.file));
}
function renamedName(spec) {
  const m = /^(.*?)\{(.*?) => (.*?)\}(.*)$/.exec(spec);
  if (m) return `${m[1]}${m[3]}${m[4]}`.replaceAll("//", "/");
  return spec.split(" => ")[1];
}

/** uncommitted working tree (modified + untracked), relative to HEAD; untracked directories are collapsed with a file count */
function workingTreeChanges() {
  const files = [];
  for (const line of git("status --porcelain").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const st = line.slice(0, 2).trim();
    const file = line.slice(3).replaceAll("\\", "/");
    if (st === "??" && file.endsWith("/")) {
      const count = git(`ls-files --others --exclude-standard -- "${file}"`).split(/\r?\n/).filter(Boolean).length;
      files.push({ file: `${file} (${count} untracked files)`, status: "?? (untracked directory)" });
    } else files.push({ file, status: st === "??" ? "?? (untracked)" : st });
  }
  const num = new Map();
  for (const line of git("diff --numstat").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [add, del, file] = line.split("\t");
    num.set(file, { add: Number(add) || 0, del: Number(del) || 0 });
  }
  return files.map((f) => ({ ...f, ...(num.get(f.file) ?? { add: 0, del: 0 }) })).sort((x, y) => x.file.localeCompare(y.file));
}

const committed = committedChanges();
const working = workingTreeChanges();

const byArea = new Map();
for (const f of committed) {
  const area = areaOf(f.file);
  const a = byArea.get(area) ?? { files: 0, A: 0, M: 0, D: 0, R: 0, add: 0, del: 0, list: [] };
  a.files += 1;
  a[f.status] = (a[f.status] ?? 0) + 1;
  a.add += f.add;
  a.del += f.del;
  a.list.push(f);
  byArea.set(area, a);
}
const areasOrdered = [...byArea.entries()].sort((x, y) => y[1].files - x[1].files);
const totals = committed.reduce((t, f) => ({ files: t.files + 1, add: t.add + f.add, del: t.del + f.del, A: t.A + (f.status === "A"), M: t.M + (f.status === "M"), D: t.D + (f.status === "D"), R: t.R + (f.status === "R") }), { files: 0, add: 0, del: 0, A: 0, M: 0, D: 0, R: 0 });

/** routes from the Next.js app-path-routes-manifest of a build directory */
function routesOf(root) {
  const file = path.join(root, "apps", "web", ".next", "app-path-routes-manifest.json");
  if (!existsSync(file)) return null;
  return Object.values(JSON.parse(readFileSync(file, "utf8"))).sort();
}
const buildIdOf = (root) => {
  const f = path.join(root, "apps", "web", ".next", "BUILD_ID");
  return existsSync(f) ? readFileSync(f, "utf8").trim() : "n/a";
};
const beforeRoutes = routesOf(beforeRoot);
const afterRoutes = routesOf(repo);
const prerender = (() => {
  const f = path.join(repo, "apps", "web", ".next", "prerender-manifest.json");
  if (!existsSync(f)) return null;
  const m = JSON.parse(readFileSync(f, "utf8"));
  const routes = Object.keys(m.routes);
  const per = {};
  for (const r of routes) {
    const loc = /^\/(en|de|fr|es|it|nl)(\/|$)/.exec(r);
    const k = loc ? loc[1] : "other";
    per[k] = (per[k] ?? 0) + 1;
  }
  return { total: routes.length, dynamic: Object.keys(m.dynamicRoutes).length, per };
})();

const lines = [];
const h = (l, t) => lines.push(`${"#".repeat(l)} ${t}`, "");
const p = (t = "") => lines.push(t, "");
const table = (header, rows) => {
  lines.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`);
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  lines.push("");
};
const n = (x) => x.toLocaleString("en-GB");

h(1, "Changed files and routes — Track redesign programme");
p(`Generated ${new Date().toISOString()} by \`docs/qa/2026-09-05/changed-files.mjs\`. Base: \`${base}\` (${baseFull}; "docs: design system reference for the Track redesign", the last commit before the phase 1–6 implementation commits). Head: \`${head}\`. ${commits.length} commits in between (\`git log --oneline ${base}..HEAD\`).`);
p(`Command: \`git diff --stat ${base}..HEAD\` → **${n(totals.files)} files changed, ${n(totals.add)} insertions(+), ${n(totals.del)} deletions(−)** (added ${totals.A}, modified ${totals.M}, deleted ${totals.D}, renamed ${totals.R}; renames detected with \`-M\`). Uncommitted working tree on top of HEAD (task F1 fixes and QA tooling, not yet committed at the time of this report): ${working.length} paths (\`git status --porcelain\`), of which ${working.filter((f) => f.status === "M").length} modified tracked files with ${n(working.reduce((s, f) => s + f.add, 0))} insertions / ${n(working.reduce((s, f) => s + f.del, 0))} deletions (\`git diff --numstat\`), listed in section 3.`);

h(2, "1. Summary by area (committed, `" + base + "..HEAD`)");
table(["Area", "Files", "A", "M", "D", "R", "+ lines", "− lines"], areasOrdered.map(([area, a]) => [area, n(a.files), n(a.A ?? 0), n(a.M ?? 0), n(a.D ?? 0), n(a.R ?? 0), n(a.add), n(a.del)]));

h(2, "2. Commits");
lines.push(...commits.map((c) => `- \`${c.slice(0, 7)}\` ${c.slice(8)}`), "");

h(2, "3. Uncommitted working tree (on top of HEAD)");
table(["Status", "File", "+", "−"], working.map((f) => [f.status, `\`${f.file}\``, f.add ? n(f.add) : "", f.del ? n(f.del) : ""]));

h(2, "4. Routes");
if (beforeRoutes && afterRoutes) {
  const b = new Set(beforeRoutes);
  const a = new Set(afterRoutes);
  const removed = beforeRoutes.filter((r) => !a.has(r));
  const added = afterRoutes.filter((r) => !b.has(r));
  const kept = afterRoutes.filter((r) => b.has(r));
  p(`Source: \`apps/web/.next/app-path-routes-manifest.json\` of the BEFORE build (worktree \`${beforeRoot.replaceAll("\\", "/")}\` at \`${base}\`, BUILD_ID \`${buildIdOf(beforeRoot)}\`, ${beforeRoutes.length} routes) and of the AFTER build (BUILD_ID \`${buildIdOf(repo)}\`, ${afterRoutes.length} routes). Route groups \`(marketing)\` / \`(auth)\` are Next.js folder groups without a URL segment; \`[locale]\` ∈ {en, de, fr, es, it, nl} (\`localePrefix: "always"\`, \`/\` → 301 \`/en\`). Removed: ${removed.length}, added: ${added.length}, unchanged: ${kept.length}.`);
  if (prerender) p(`Prerendered (static) routes in the AFTER build: ${prerender.total} (${Object.entries(prerender.per).map(([k, v]) => `${k}: ${v}`).join(", ")}) + ${prerender.dynamic} dynamic route patterns (\`prerender-manifest.json\`).`);

  const isPublic = (r) => r.startsWith("/[locale]");
  const isApp = (r) => r.startsWith("/app");
  const isApi = (r) => r.startsWith("/api") || r.startsWith("/cdn");
  const urlOf = (r) => r.replace(/\/\((marketing|auth)\)/g, "").replace(/\/(page|route)$/, "").replace(/^\/\[locale\]$/, "/[locale]") || "/";
  const classify = (r) => (added.includes(r) ? "new" : removed.includes(r) ? "removed" : "kept");

  h(3, "4.1 Public routes (×6 locales)");
  const pubAfter = afterRoutes.filter(isPublic);
  const pubBefore = beforeRoutes.filter(isPublic);
  const pubRows = [];
  for (const r of pubAfter) {
    const url = urlOf(r);
    const beforeMatch = pubBefore.find((x) => urlOf(x) === url) ?? pubBefore.find((x) => urlOf(x) === url.replace("tracking-knowledge", "blog"));
    const status = beforeMatch ? (urlOf(beforeMatch) === url ? "redesigned (same URL, route group)" : `renamed from \`${urlOf(beforeMatch)}\``) : "new";
    pubRows.push([`\`${url}\``, `\`${r}\``, status]);
  }
  table(["URL pattern", "Route (manifest)", "Change vs before"], pubRows);
  const pubRemoved = pubBefore.filter((x) => !pubAfter.some((r) => urlOf(r) === urlOf(x)) && !pubAfter.some((r) => urlOf(r) === urlOf(x).replace("blog", "tracking-knowledge")));
  p(`Removed public routes: ${pubRemoved.length ? pubRemoved.map((x) => `\`${urlOf(x)}\``).join(", ") : "none"}. Blog routes (\`/[locale]/blog\`, \`/[locale]/blog/[slug]\`, \`/[locale]/blog/feed.xml\`) are answered by permanent redirects only (see the redirect matrix).`);

  h(3, "4.2 Dashboard routes");
  const appRows = [...new Set([...afterRoutes.filter(isApp), ...beforeRoutes.filter(isApp)])].sort().map((r) => [`\`${urlOf(r)}\``, classify(r) === "removed" ? "removed (308 → new module, see `next.config.ts`)" : classify(r)]);
  table(["URL", "Change vs before"], appRows);

  h(3, "4.3 API, metadata and other routes");
  table(["Route", "Change vs before"], [...new Set([...afterRoutes, ...beforeRoutes])].filter((r) => !isPublic(r) && !isApp(r)).sort().map((r) => [`\`${r}\``, classify(r)]));
} else {
  p(`Route manifests not available (before: ${beforeRoutes ? "ok" : "missing"}, after: ${afterRoutes ? "ok" : "missing"}).`);
}

h(2, "5. Every changed file (committed, by area)");
for (const [area, a] of areasOrdered) {
  h(3, `${area} (${a.files})`);
  lines.push(...a.list.map((f) => `- ${f.status}${f.from ? ` (from \`${f.from}\`)` : ""} \`${f.file}\`${f.binary ? " (binary)" : ` +${f.add} −${f.del}`}`), "");
}

writeFileSync(outFile, lines.join("\n") + "\n", "utf8");
console.log(`wrote ${path.relative(repo, outFile)}: ${committed.length} committed files, ${working.length} working-tree paths, ${afterRoutes?.length ?? 0} routes`);
