#!/usr/bin/env node
/**
 * Client bundle analysis per route from the Turbopack build output (no ANALYZE plugin configured).
 *
 * For every route named on the command line it reads
 *   .next/server/app/<route>_client-reference-manifest.js  (client modules → chunks)
 *   .next/build-manifest.json                              (root main files + polyfill)
 * and writes, per route, the list of client chunks with raw / gzip sizes and the client modules
 * (project files) that reference each chunk, plus a listing of every chunk with the modules it
 * carries (from the `// [project]/...` and `"[project]/..."` markers Turbopack leaves in the chunk).
 *
 * Usage (from apps/web):
 *   node scripts/qa/bundle-analysis.mjs --out ../../docs/qa/2026-09-05/followup/perf/bundle-before.md \
 *     "[locale]/(marketing)/page" "[locale]/(marketing)/pricing/page" ...
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
let out = null;
const routes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") out = args[++i];
  else routes.push(args[i]);
}
const root = path.resolve(".next");
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const sizes = new Map();
function chunkSize(file) {
  const rel = file.replace(/^\/_next\//, "");
  if (!sizes.has(rel)) {
    try {
      const buf = fs.readFileSync(path.join(root, rel));
      sizes.set(rel, { raw: buf.length, gzip: gz(buf) });
    } catch {
      sizes.set(rel, { raw: -1, gzip: -1 });
    }
  }
  return sizes.get(rel);
}
const modulesOf = new Map();
function chunkModules(file) {
  const rel = file.replace(/^\/_next\//, "");
  if (!modulesOf.has(rel)) {
    let src = "";
    try {
      src = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      /* missing */
    }
    const found = new Set();
    for (const m of src.matchAll(/"\[project\]\/([^"]+?)(?: \[[^\]]*\])?"/g)) found.add(m[1]);
    modulesOf.set(rel, [...found]);
  }
  return modulesOf.get(rel);
}
function shortModule(name) {
  return name
    .replace(/^node_modules\/\.pnpm\/([^/]+)\/node_modules\//, "npm:$1 → ")
    .replace(/^apps\/web\//, "web/")
    .replace(/^packages\//, "pkg/");
}
function pkgOf(name) {
  const m = name.match(/^node_modules\/\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[2];
  if (name.startsWith("apps/web/")) return "apps/web";
  if (name.startsWith("packages/")) return name.split("/").slice(0, 2).join("/");
  return name.split("/")[0];
}

const build = JSON.parse(fs.readFileSync(path.join(root, "build-manifest.json"), "utf8"));
const lines = [];
lines.push(`# Client bundle analysis (build ${fs.readFileSync(path.join(root, "BUILD_ID"), "utf8").trim()})`, "");
lines.push(`Generated ${new Date().toISOString()} by \`apps/web/scripts/qa/bundle-analysis.mjs\` from \`.next/build-manifest.json\` and the per-route \`*_client-reference-manifest.js\`. Sizes are bytes on disk (raw) and gzip level 9 (the production server compresses with gzip/brotli; Lighthouse "transfer" sizes differ slightly). A chunk's module list comes from the \`[project]/…\` markers Turbopack leaves in the chunk.`, "");

const shared = [...build.polyfillFiles.map((f) => ({ f, kind: "polyfill" })), ...build.rootMainFiles.map((f) => ({ f, kind: "root" }))];
lines.push("## Shared by every route (root main files + polyfill)", "", "| Kind | Chunk | Raw | Gzip | Largest packages inside |", "| --- | --- | ---: | ---: | --- |");
let sharedGz = 0;
for (const { f, kind } of shared) {
  const s = chunkSize(f);
  sharedGz += s.gzip;
  const pk = new Map();
  for (const m of chunkModules(f)) pk.set(pkgOf(m), (pk.get(pkgOf(m)) ?? 0) + 1);
  const top = [...pk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, n]) => `${p} (${n})`).join(", ");
  lines.push(`| ${kind} | \`${f}\` | ${s.raw} | ${s.gzip} | ${top} |`);
}
lines.push("", `Shared total: **${sharedGz} B gzip**`, "");

for (const route of routes) {
  const file = path.join(root, "server", "app", `${route}_client-reference-manifest.js`);
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    lines.push(`## ${route}`, "", `manifest not found: ${file}`, "");
    continue;
  }
  const json = src.slice(src.indexOf("= {") + 2).replace(/;\s*$/, "");
  const manifest = JSON.parse(json);
  const byChunk = new Map();
  for (const [mod, entry] of Object.entries(manifest.clientModules)) {
    const name = mod.replace(/^\[project\]\//, "").replace(/ \[[^\]]*\]$/, "");
    for (const c of entry.chunks) {
      if (!c.endsWith(".js")) continue;
      if (!byChunk.has(c)) byChunk.set(c, new Set());
      byChunk.get(c).add(name);
    }
  }
  const rows = [...byChunk.entries()].map(([c, mods]) => ({ c, mods: [...mods], size: chunkSize(c) })).sort((a, b) => b.size.gzip - a.size.gzip);
  const routeGz = rows.reduce((n, r) => n + r.size.gzip, 0);
  lines.push(`## ${route}`, "", `Route-specific client chunks (referenced by the route's client modules; loaded when the referencing module hydrates — modules behind \`next/dynamic\` load later): ${rows.length} chunks, **${routeGz} B gzip** + shared ${sharedGz} B gzip.`, "", "| Chunk | Raw | Gzip | Referenced by (client entry modules) | Contains (packages, module count) |", "| --- | ---: | ---: | --- | --- |");
  for (const r of rows) {
    const refs = r.mods
      .filter((m) => !m.includes("node_modules/next/"))
      .map(shortModule)
      .slice(0, 8)
      .join("<br>");
    const pk = new Map();
    for (const m of chunkModules(r.c)) pk.set(pkgOf(m), (pk.get(pkgOf(m)) ?? 0) + 1);
    const top = [...pk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, n]) => `${p} (${n})`).join(", ");
    lines.push(`| \`${r.c.replace("/_next/static/chunks/", "")}\` | ${r.size.raw} | ${r.size.gzip} | ${refs || "(next internals)"} | ${top} |`);
  }
  lines.push("");
  // project modules in the chunks of this route
  const heavy = [];
  for (const r of rows) for (const m of chunkModules(r.c)) if (/recharts|motion|zod|@track-site\/catalog|knowledge|lucide-react\/dist\/esm\/icons\//.test(m)) heavy.push(`${r.c.replace("/_next/static/chunks/", "")}: ${shortModule(m)}`);
  const iconCount = heavy.filter((h) => h.includes("lucide-react")).length;
  lines.push(`Watch-list modules in this route's client chunks (recharts / motion / zod / catalog / knowledge / lucide icons): ${heavy.length} (of which lucide icon modules: ${iconCount})`, "");
  for (const h of heavy.filter((h) => !h.includes("lucide-react"))) lines.push(`- ${h}`);
  lines.push("");
}

const text = lines.join("\n");
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  process.stdout.write(`written ${out}\n`);
} else process.stdout.write(text);
