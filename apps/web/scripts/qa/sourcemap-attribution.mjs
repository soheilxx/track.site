#!/usr/bin/env node
/**
 * Attributes the bytes of the client chunks of a route to their source modules, using the browser
 * source maps of an analysis build (`NEXT_DIST_DIR=.next-analysis NEXT_SOURCEMAPS=1 next build`).
 *
 * For every route named on the command line it reads the route's `*_client-reference-manifest.js`
 * (the chunks its client modules load) plus the shared root main files, decodes each chunk's
 * `.js.map` (VLQ mappings → bytes per source file, like source-map-explorer) and prints per chunk the
 * largest packages and the largest project modules. A second table lists, per route, the largest
 * *packages* summed over the route-specific chunks — the answer to "which dependency pulls what".
 *
 * Usage (from apps/web):
 *   node scripts/qa/sourcemap-attribution.mjs --dist .next-analysis --out ../../docs/qa/<date>/bundle-attribution.md \
 *     "[locale]/(marketing)/page" "[locale]/(marketing)/pricing/page"
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
let out = null;
let dist = ".next-analysis";
let top = 25;
const routes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") out = args[++i];
  else if (args[i] === "--dist") dist = args[++i];
  else if (args[i] === "--top") top = Number(args[++i]);
  else routes.push(args[i]);
}
const root = path.resolve(dist);

/* ---------- VLQ ---------- */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64V = new Map([...B64].map((c, i) => [c, i]));
function decodeVlq(str, pos) {
  let result = 0;
  let shift = 0;
  let cont;
  do {
    const v = B64V.get(str[pos++]);
    cont = v & 32;
    result += (v & 31) << shift;
    shift += 5;
  } while (cont);
  const neg = result & 1;
  result >>= 1;
  return [neg ? -result : result, pos];
}

/** bytes per source index for one chunk (generated code attributed to the source of each segment). */
function attribute(code, map) {
  const lines = code.split("\n");
  const bySource = new Map();
  let unmapped = 0;
  let source = 0;
  const groups = map.mappings.split(";");
  for (let li = 0; li < lines.length; li++) {
    const lineLen = Buffer.byteLength(lines[li], "utf8") + 1;
    const group = groups[li] ?? "";
    const segs = [];
    let genCol = 0;
    let pos = 0;
    while (pos < group.length) {
      if (group[pos] === ",") {
        pos++;
        continue;
      }
      let v;
      [v, pos] = decodeVlq(group, pos);
      genCol += v;
      let src = null;
      if (pos < group.length && group[pos] !== "," && group[pos] !== ";") {
        [v, pos] = decodeVlq(group, pos);
        source += v;
        // source line and column (and the optional name index) are not needed for byte attribution
        [, pos] = decodeVlq(group, pos);
        [, pos] = decodeVlq(group, pos);
        src = source;
        if (pos < group.length && group[pos] !== "," && group[pos] !== ";") [, pos] = decodeVlq(group, pos);
      }
      segs.push({ col: genCol, src });
    }
    // columns are UTF-16 units; the chunks are ASCII-dominant, so treat them as bytes
    if (segs.length === 0) {
      unmapped += lineLen;
      continue;
    }
    if (segs[0].col > 0) unmapped += segs[0].col;
    for (let i = 0; i < segs.length; i++) {
      const end = i + 1 < segs.length ? segs[i + 1].col : lineLen;
      const bytes = Math.max(0, end - segs[i].col);
      if (segs[i].src == null) unmapped += bytes;
      else bySource.set(segs[i].src, (bySource.get(segs[i].src) ?? 0) + bytes);
    }
  }
  return { bySource, unmapped };
}

function cleanSource(s) {
  return s
    .replace(/^turbopack:\/\/\[project\]\//, "")
    .replace(/^turbopack:\/\/\[next\]\//, "next-internal/")
    .replace(/^turbopack:\/\/\[turbopack\]\//, "turbopack-runtime/")
    .replace(/^turbopack:\/\/\[externals\]\//, "externals/")
    .replace(/^\/?turbopack:\/\//, "");
}
function pkgOf(s) {
  const m = s.match(/node_modules\/\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[2] === "next" ? `next (${s.match(/node_modules\/next\/dist\/([^/]+\/[^/]+)/)?.[1] ?? "dist"})` : m[2];
  if (s.startsWith("apps/web/src/components/")) return "apps/web/" + s.split("/").slice(3, 5).join("/");
  if (s.startsWith("apps/web/src/lib/")) return "apps/web/" + s.split("/").slice(3, 5).join("/");
  if (s.startsWith("apps/web/")) return "apps/web/" + s.split("/").slice(2, 4).join("/");
  if (s.startsWith("packages/")) return s.split("/").slice(0, 2).join("/");
  return s.split("/")[0];
}

const chunkCache = new Map();
function analyzeChunk(rel) {
  if (chunkCache.has(rel)) return chunkCache.get(rel);
  const file = path.join(root, rel);
  const code = fs.readFileSync(file, "utf8");
  const raw = Buffer.byteLength(code);
  const gzip = zlib.gzipSync(code, { level: 9 }).length;
  let result = { rel, raw, gzip, sources: [], unmapped: raw };
  try {
    // Turbopack names the map after its own content hash, not after the chunk: follow the sourceMappingURL comment
    const mapRef = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code)?.[1];
    const mapFile = mapRef ? path.join(path.dirname(file), mapRef) : `${file}.map`;
    const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
    const { bySource, unmapped } = attribute(code, map);
    const sources = [...bySource.entries()].map(([i, bytes]) => ({ source: cleanSource(map.sources[i] ?? `#${i}`), bytes })).sort((a, b) => b.bytes - a.bytes);
    result = { rel, raw, gzip, sources, unmapped };
  } catch (e) {
    result.error = String(e.message ?? e);
  }
  chunkCache.set(rel, result);
  return result;
}
const ratio = (c) => (c.raw ? c.gzip / c.raw : 0);
function packagesOf(chunk) {
  const pk = new Map();
  for (const s of chunk.sources) pk.set(pkgOf(s.source), (pk.get(pkgOf(s.source)) ?? 0) + s.bytes);
  return [...pk.entries()].sort((a, b) => b[1] - a[1]);
}

const build = JSON.parse(fs.readFileSync(path.join(root, "build-manifest.json"), "utf8"));
const lines = [];
lines.push(`# Client bundle attribution (analysis build ${fs.readFileSync(path.join(root, "BUILD_ID"), "utf8").trim()}, dist \`${dist}\`)`, "");
lines.push(`Generated ${new Date().toISOString()} by \`apps/web/scripts/qa/sourcemap-attribution.mjs\`. Bytes are attributed from the browser source maps of the analysis build (\`NEXT_SOURCEMAPS=1\`, same source tree and Next.js config as the production build; only the \`.map\` files and the \`sourceMappingURL\` comment differ). "raw" is the minified size on disk, "gzip" the gzip level 9 size; "est. gzip" of a package is its raw share × the chunk's gzip ratio (an estimate — gzip does not attribute bytes).`, "");

function chunkSection(title, files) {
  lines.push(`### ${title}`, "");
  for (const f of files) {
    const c = analyzeChunk(f.replace(/^\/_next\//, ""));
    lines.push(`#### \`${path.basename(c.rel)}\` — ${c.raw} B raw, ${c.gzip} B gzip${c.error ? ` (no source map: ${c.error})` : ""}`, "");
    if (c.error) continue;
    lines.push("| Package / area | Raw bytes | Share | est. gzip |", "| --- | ---: | ---: | ---: |");
    for (const [p, b] of packagesOf(c).slice(0, 12)) lines.push(`| ${p} | ${b} | ${((100 * b) / c.raw).toFixed(1)} % | ${Math.round(b * ratio(c))} |`);
    if (c.unmapped) lines.push(`| (unmapped: runtime glue, module wrappers) | ${c.unmapped} | ${((100 * c.unmapped) / c.raw).toFixed(1)} % | ${Math.round(c.unmapped * ratio(c))} |`);
    lines.push("", `Largest modules: ${c.sources.slice(0, 10).map((s) => `\`${s.source.replace(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//, "")}\` ${s.bytes} B`).join(", ")}`, "");
  }
}

lines.push("## Shared by every route (root main files)", "");
chunkSection("Root main files (loaded by every page; the `noModule` polyfill file is not fetched by modern browsers and is omitted)", build.rootMainFiles);

for (const route of routes) {
  const file = path.join(root, "server", "app", `${route}_client-reference-manifest.js`);
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    lines.push(`## ${route}`, "", `manifest not found: ${file}`, "");
    continue;
  }
  const manifest = JSON.parse(src.slice(src.indexOf("= {") + 2).replace(/;\s*$/, ""));
  const chunks = new Map();
  for (const [mod, entry] of Object.entries(manifest.clientModules)) {
    const name = mod.replace(/^\[project\]\//, "").replace(/ \[[^\]]*\]$/, "");
    for (const c of entry.chunks) {
      if (!c.endsWith(".js")) continue;
      if (!chunks.has(c)) chunks.set(c, new Set());
      chunks.get(c).add(name);
    }
  }
  const files = [...chunks.keys()].map((c) => ({ c, a: analyzeChunk(c.replace(/^\/_next\//, "")) })).sort((x, y) => y.a.gzip - x.a.gzip);
  const totalGz = files.reduce((n, f) => n + f.a.gzip, 0);
  const totalRaw = files.reduce((n, f) => n + f.a.raw, 0);
  lines.push(`## ${route}`, "", `${files.length} route-specific chunks referenced by the route's client modules: **${totalRaw} B raw, ${totalGz} B gzip** (plus the shared root main files above). Chunks referenced only by a module behind \`next/dynamic\` load after hydration.`, "");
  // packages summed over the route chunks
  const pk = new Map();
  const mods = new Map();
  for (const f of files) {
    const r = ratio(f.a);
    for (const s of f.a.sources) {
      const p = pkgOf(s.source);
      const cur = pk.get(p) ?? { raw: 0, gz: 0 };
      cur.raw += s.bytes;
      cur.gz += s.bytes * r;
      pk.set(p, cur);
      const m = mods.get(s.source) ?? { raw: 0, gz: 0, chunk: path.basename(f.c) };
      m.raw += s.bytes;
      m.gz += s.bytes * r;
      mods.set(s.source, m);
    }
  }
  lines.push("| Package / area (summed over the route chunks) | Raw bytes | est. gzip |", "| --- | ---: | ---: |");
  for (const [p, v] of [...pk.entries()].sort((a, b) => b[1].raw - a[1].raw).slice(0, top)) lines.push(`| ${p} | ${v.raw} | ${Math.round(v.gz)} |`);
  lines.push("", `Largest project modules (apps/web, packages/*): ${[...mods.entries()].filter(([m]) => !m.includes("node_modules/")).sort((a, b) => b[1].raw - a[1].raw).slice(0, 20).map(([m, v]) => `\`${m}\` ${v.raw} B (${v.chunk})`).join(", ")}`, "");
  lines.push("| Chunk | Raw | Gzip | Entry modules that reference it |", "| --- | ---: | ---: | --- |");
  for (const f of files) {
    const refs = [...chunks.get(f.c)].filter((m) => !m.includes("node_modules/next/")).map((m) => m.replace(/^apps\/web\//, "web/").replace(/^packages\//, "pkg/").replace(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//, "npm:"));
    lines.push(`| \`${path.basename(f.c)}\` | ${f.a.raw} | ${f.a.gzip} | ${refs.length > 6 ? `${refs.slice(0, 6).join("<br>")}<br>… (${refs.length})` : refs.join("<br>") || "(next internals)"} |`);
  }
  lines.push("");
  chunkSection(`Per-chunk breakdown (${route})`, files.map((f) => f.c));
}

const text = lines.join("\n");
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  process.stdout.write(`written ${out}\n`);
} else process.stdout.write(text);
