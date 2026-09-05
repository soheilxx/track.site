import fs from "node:fs";
import zlib from "node:zlib";

const base = process.argv[2] ?? "http://localhost:3011";
const pages = (process.argv[3] ?? "/en,/en/pricing,/en/tracking-knowledge,/en/tracking-knowledge/consent-mode-v2-guide").split(",");
const outDir = process.argv[4];

function count(h, re) {
  let n = 0,
    b = 0;
  for (const m of h.matchAll(re)) {
    n++;
    b += m[0].length;
  }
  return { n, b };
}

const rows = [];
for (const p of pages) {
  const res = await fetch(base + p, { headers: { "accept-encoding": "identity" } });
  const h = await res.text();
  const pushes = [...h.matchAll(/<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].map((m) => m[1]);
  const rsc = pushes.join("");
  const rscBytes = [...h.matchAll(/<script>self\.__next_f\.push[\s\S]*?<\/script>/g)].reduce((n, m) => n + m[0].length, 0);
  const svg = count(h, /<svg[\s\S]*?<\/svg>/g);
  const jsonld = count(h, /<script type="application\/ld\+json"[\s\S]*?<\/script>/g);
  // in the RSC payload, inline SVG appears as ["$","svg",...] elements
  const rscSvg = (rsc.match(/\[\\"\$\\",\\"svg\\"/g) ?? []).length;
  const messagesIdx = rsc.indexOf('\\"messages\\":');
  let messagesLen = -1;
  if (messagesIdx >= 0) {
    // the messages object ends before the next top-level prop of the provider ("children")
    const end = rsc.indexOf('\\"children\\":', messagesIdx);
    messagesLen = end > messagesIdx ? end - messagesIdx : -1;
  }
  const dom = h.length - rscBytes;
  const gz = zlib.gzipSync(h).length;
  const brotli = zlib.brotliCompressSync(h).length;
  const nodes = (h.match(/<[a-z][a-z0-9-]*[\s>]/gi) ?? []).length;
  rows.push({ page: p, total: h.length, gzip: gz, brotli, dom, rscBytes, rscPushes: pushes.length, svgCount: svg.n, svgBytes: svg.b, rscSvgElements: rscSvg, messagesInRsc: messagesLen, jsonLd: jsonld.b, domNodes: nodes });
  if (outDir) fs.writeFileSync(`${outDir}/${p.replace(/\//g, "_") || "_root"}.html`, h);
}
console.table(rows);
if (outDir) fs.writeFileSync(`${outDir}/html-composition.json`, JSON.stringify(rows, null, 2));
