/**
 * Contrast review of the axe "incomplete" color-contrast nodes of docs/qa/2026-09-05/axe/*.json (task E3, defect D15).
 *
 * For every node axe could not decide (background overlapped by another element, gradient background, image node,
 * short text, non-BMP text, partially obscured) the script opens the same route at the same width on the server
 * under test, locates the node by its axe target selector and resolves the background by a computed-style walk:
 *   - the ancestor chain html → … → element (background-color, background-image gradients, opacity),
 *   - overlapping elements at the text's sample point (document.elementsFromPoint, painted below the text),
 *   - the elements axe listed as related nodes (decorative overlays with pointer-events: none are not hit-testable),
 *   - for SVG <text>: fill / fill-opacity of the text and of the shapes painted before it that contain the point.
 * Colours are parsed by the browser itself (2D canvas), so oklab()/color(srgb …) values from Tailwind v4 resolve.
 * Gradients contribute every colour stop as a candidate; the composite is evaluated for all candidate combinations
 * and the minimum / maximum contrast against the text colour is reported. `ratioSolid` ignores gradients and
 * patterns (background-color layers only).
 *
 * Usage (from the repo root):
 *   node docs/qa/2026-09-05/followup/contrast/contrast-review.mjs --base http://localhost:3014 [--only <regex on run>] [--dark] [--out <file.json>] [--merge]
 * Output: results.json (every evaluation), summary.md (per unique node), stdout progress.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = arg("--base", "http://localhost:3014");
const ONLY = arg("--only", null) ? new RegExp(arg("--only")) : null;
const DARK = args.includes("--dark");
const AXE_DIR = path.join(root, "docs/qa/2026-09-05/axe");
const OUT_JSON = path.join(here, arg("--out", DARK ? "results-dark.json" : "results.json"));
const AUTH = path.join(root, "apps/web/e2e/.auth/owner.json");

const PUBLIC = {
  home: "",
  pricing: "/pricing",
  features: "/features",
  "feature-server-side-tracking": "/features/server-side-tracking",
  "how-it-works": "/how-it-works",
  integrations: "/integrations",
  "integration-meta": "/integrations/meta",
  "knowledge-hub": "/tracking-knowledge",
  "knowledge-article-consent-mode-v2-guide": "/tracking-knowledge/consent-mode-v2-guide",
  docs: "/docs",
  contact: "/contact",
  security: "/security",
  privacy: "/privacy",
  login: "/login",
  signup: "/signup",
};
const DASHBOARD = {
  "app-overview": "/app",
  "app-ai-setup": "/app/ai-setup",
  "app-events": "/app/events",
  "app-events-matrix": "/app/events/matrix",
  "app-events-explorer": "/app/events/explorer",
  "app-events-test-lab": "/app/events/test-lab",
  "app-destinations": "/app/destinations",
  "app-data-quality": "/app/data-quality",
  "app-revenue-leaks": "/app/data-quality/revenue-leaks",
  "app-consent": "/app/consent",
  "app-consent-simulator": "/app/consent/simulator",
  "app-attribution": "/app/insights/attribution",
  "app-releases": "/app/releases",
  "app-billing": "/app/billing",
  "app-usage": "/app/billing/usage",
  "app-team": "/app/team",
  "app-settings": "/app/settings",
  "app-alerts": "/app/settings/alerts",
};

function urlFor(slug) {
  if (slug in DASHBOARD) return { url: `${BASE}${DASHBOARD[slug]}`, authed: true };
  const m = /^(en|de)-(.+)$/.exec(slug);
  if (m && m[2] in PUBLIC) return { url: `${BASE}/${m[1]}${PUBLIC[m[2]]}`, authed: false };
  throw new Error(`unknown route slug ${slug}`);
}

/** Collect the incomplete color-contrast nodes per run from the raw axe files. */
function collectRuns() {
  const runs = [];
  for (const f of fs.readdirSync(AXE_DIR).filter((n) => /--\d+\.json$/.test(n)).sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(AXE_DIR, f), "utf8"));
    const rule = (raw.incomplete || []).find((r) => r.id === "color-contrast");
    if (!rule) continue;
    const [slug, width] = f.replace(".json", "").split("--");
    const run = `${slug}@${width}`;
    if (ONLY && !ONLY.test(run)) continue;
    runs.push({
      run,
      slug,
      width: Number(width),
      file: path.relative(root, path.join(AXE_DIR, f)).replace(/\\/g, "/"),
      nodes: rule.nodes.map((n) => {
        const check = n.any[0] ?? {};
        return {
          target: n.target.join(" "),
          html: n.html,
          messageKey: check.data?.messageKey ?? "unknown",
          expected: check.data?.expectedContrastRatio ?? "4.5:1",
          fontSize: check.data?.fontSize ?? "",
          fontWeight: check.data?.fontWeight ?? "",
          related: (check.relatedNodes ?? []).map((r) => r.target.join(" ")),
        };
      }),
    });
  }
  return runs;
}

/** Runs inside the page: resolve text colour and background candidates for one axe node. */
function measureInPage({ target, related, html }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const parse = (str) => {
    if (!str || str === "none") return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = str;
    const s = ctx.fillStyle;
    if (s === "#000000" && !/^(#000000|black|rgb\(0, 0, 0\)|rgba\(0, 0, 0, 1\))$/.test(str) && !/^rgb\(0,\s*0,\s*0\)$/.test(str)) {
      // canvas keeps the previous fillStyle for unparsable strings: detect by a second probe
      ctx.fillStyle = "#fff";
      ctx.fillStyle = str;
      if (ctx.fillStyle === "#ffffff") return { unparsed: str };
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  // colour tokens inside a computed gradient string
  const colorTokens = (str) => {
    const out = [];
    const re = /(rgba?|hsla?|color|oklab|oklch|lab|lch|hwb)\(/g;
    let m;
    while ((m = re.exec(str))) {
      let depth = 0;
      let i = m.index;
      for (; i < str.length; i++) {
        if (str[i] === "(") depth++;
        else if (str[i] === ")" && --depth === 0) break;
      }
      out.push(str.slice(m.index, i + 1));
      re.lastIndex = i + 1;
    }
    const named = str.match(/\b(transparent|black|white|currentcolor)\b/gi) ?? [];
    return [...out, ...named];
  };
  // the axe selectors were recorded on build rCAJOqYs841hSlnLSc99W; task F1 removed `outline-none` from ScrollRegion and
  // re-laid out the hero demo, so a stale selector falls back to the same tag + class list + text of the recorded html
  let el = document.querySelector(target);
  let resolvedBy = "target";
  if (!el && target.includes(".outline-none")) {
    el = document.querySelector(target.replace(/\.outline-none/g, ""));
    if (el) resolvedBy = "target without .outline-none";
  }
  // classes renamed by the fixes of this review (diagram sublabels, filter counts): same node, new utility class
  const RENAMED = [
    ["\\.fill-on-primary\\\\\\/80", ".fill-on-primary\\/90"],
    ["\\.text-primary\\\\\\/80", ".text-primary"],
  ];
  if (!el) {
    let renamed = target;
    for (const [from, to] of RENAMED) renamed = renamed.replace(new RegExp(from, "g"), to);
    if (renamed !== target) {
      el = document.querySelector(renamed);
      if (el) resolvedBy = "target with the renamed class";
    }
  }
  if (!el && html) {
    const m = /^<(\w+)[^>]*class="([^"]*)"[^>]*>([\s\S]*)$/.exec(html);
    if (m) {
      const text = m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
      const same = (cand) => (cand.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) === text;
      const cands = Array.from(document.querySelectorAll(m[1]));
      el = cands.find((cand) => (typeof cand.className === "string" ? cand.className : cand.getAttribute("class") || "") === m[2] && same(cand)) ?? null;
      if (el) resolvedBy = "tag + class + text of the recorded html";
      else if (text) {
        // the class list changed too (e.g. the hero demo tiles of F1): the same text in the same kind of element
        el = cands.find((cand) => same(cand) && cand.children.length === 0) ?? null;
        if (el) resolvedBy = "tag + text of the recorded html";
      }
    }
  }
  if (!el) return { error: "not found" };
  el.scrollIntoView({ block: "center", inline: "nearest" });
  const isSvgText = el instanceof SVGElement && (el.tagName.toLowerCase() === "text" || el.tagName.toLowerCase() === "tspan");
  const cs = getComputedStyle(el);
  // sample point: centre of the first non-empty text rect, else the element's box centre
  let rect = null;
  if (!isSvgText) {
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.height > 0) {
        rect = r;
        break;
      }
    }
  }
  const box = el.getBoundingClientRect();
  if (!rect) rect = box;
  const px = rect.left + Math.min(rect.width / 2, 8);
  const py = rect.top + rect.height / 2;
  const opacityChain = (node) => {
    let o = 1;
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity) || 0;
    return o;
  };
  const layerOf = (node, kind) => {
    const s = getComputedStyle(node);
    // only painted SVG shapes contribute a fill; the text itself, containers and definitions never do
    const isSvgShape = node instanceof SVGElement && !["svg", "g", "text", "tspan", "defs", "title", "desc", "clippath", "mask", "marker", "lineargradient", "radialgradient", "pattern", "symbol", "use", "foreignobject"].includes(node.tagName.toLowerCase());
    const bg = isSvgShape ? parse(s.fill) : parse(s.backgroundColor);
    const bgOpacity = isSvgShape ? parseFloat(s.fillOpacity) || 1 : 1;
    const image = isSvgShape ? "none" : s.backgroundImage;
    const gradient = image && image !== "none" && /gradient\(/.test(image) ? colorTokens(image).map(parse).filter(Boolean) : [];
    const imageUrl = image && /url\(/.test(image);
    const size = s.backgroundSize;
    const pattern = gradient.length > 0 && /^\d+(\.\d+)?px \d+(\.\d+)?px$/.test(size) && parseFloat(size) <= 32;
    return {
      kind,
      tag: node.tagName.toLowerCase(),
      cls: (typeof node.className === "string" ? node.className : node.getAttribute("class") || "").slice(0, 80),
      testid: node.getAttribute("data-testid"),
      bg: bg && !bg.unparsed ? { ...bg, a: bg.a * bgOpacity } : bg,
      gradient,
      imageUrl: Boolean(imageUrl),
      pattern,
      backgroundSize: pattern ? size : undefined,
      opacity: opacityChain(node),
    };
  };
  const ancestors = [];
  for (let n = el; n; n = n.parentElement) ancestors.unshift(n);
  const inChain = (n) => ancestors.includes(n) || el.contains(n);
  const contains = (n) => {
    const b = n.getBoundingClientRect();
    return b.left <= px && b.right >= px && b.top <= py && b.bottom >= py;
  };
  const stack = document.elementsFromPoint(px, py);
  const idx = stack.findIndex((n) => n === el || el.contains(n));
  const below = idx >= 0 ? stack.slice(idx + 1).filter((n) => !inChain(n)) : [];
  const above = idx >= 0 ? stack.slice(0, idx).filter((n) => !inChain(n)) : stack.filter((n) => !inChain(n));
  const relatedEls = related.map((sel) => { try { return document.querySelector(sel); } catch { return null; } }).filter((n) => n && !inChain(n) && contains(n) && !below.includes(n) && !above.includes(n));
  // SVG shapes painted before the text inside the same svg
  const svgShapes = [];
  if (isSvgText) {
    const svg = el.closest("svg");
    if (svg) {
      for (const shape of svg.querySelectorAll("rect, path, circle, ellipse, polygon")) {
        if (!(shape.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (contains(shape) && !below.includes(shape) && !above.includes(shape)) svgShapes.push(shape);
      }
    }
  }
  // insertion: an overlapping element paints above the backgrounds of the ancestors it is contained in
  const layers = ancestors.map((n) => layerOf(n, "ancestor"));
  const insert = (node, kind) => {
    let at = 0;
    for (let i = 0; i < ancestors.length; i++) if (ancestors[i].contains(node)) at = i + 1;
    layers.splice(at, 0, layerOf(node, kind));
  };
  for (const n of [...below].reverse()) insert(n, "overlap-below");
  for (const n of relatedEls) insert(n, "related-overlay");
  for (const n of svgShapes) insert(n, "svg-shape");
  const fg = parse(isSvgText ? cs.fill : cs.color);
  const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  return {
    found: true,
    resolvedBy,
    text,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    fg,
    fgOpacity: opacityChain(el) * (isSvgText ? parseFloat(cs.fillOpacity) || 1 : 1),
    point: { x: Math.round(px), y: Math.round(py) },
    layers,
    above: above.slice(0, 4).map((n) => layerOf(n, "overlap-above")),
    stackFound: idx >= 0,
  };
}

// --- colour maths (WCAG 2.x) ---
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const over = (src, dst, alpha) => ({ r: src.r * alpha + dst.r * (1 - alpha), g: src.g * alpha + dst.g * (1 - alpha), b: src.b * alpha + dst.b * (1 - alpha) });
const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const key = (c) => `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;

/** Composite the layer list bottom → top; returns the solid result and every candidate (gradient/pattern stops). */
function composite(layers) {
  const white = { r: 255, g: 255, b: 255 };
  let solid = white;
  let candidates = [{ c: white, via: [] }];
  const unparsed = [];
  for (const layer of layers) {
    const bg = layer.bg;
    if (bg?.unparsed) unparsed.push(bg.unparsed);
    if (bg && !bg.unparsed && bg.a > 0) {
      const alpha = Math.min(1, bg.a * layer.opacity);
      solid = over(bg, solid, alpha);
      candidates = candidates.map((k) => ({ c: over(bg, k.c, alpha), via: k.via }));
    }
    const stops = (layer.gradient || []).filter((g) => g && !g.unparsed);
    if (stops.length) {
      const next = new Map();
      for (const k of candidates) {
        next.set(key(k.c), k); // stop "transparent" / the plain layer
        for (const s of stops) {
          if (s.a <= 0) continue;
          const alpha = Math.min(1, s.a * layer.opacity);
          const c = over(s, k.c, alpha);
          const tag = `${layer.pattern ? "pattern" : "gradient"}:${layer.tag}${layer.cls ? "." + layer.cls.split(" ")[0] : ""}`;
          if (!next.has(key(c))) next.set(key(c), { c, via: [...k.via, tag] });
        }
      }
      candidates = [...next.values()].slice(0, 400);
    }
  }
  return { solid, candidates, unparsed };
}

function evaluate(m) {
  if (!m.found) return { verdict: "not-found", error: m.error };
  if (!m.fg || m.fg.unparsed) return { verdict: "unparsed-fg", error: m.fg?.unparsed ?? "no colour" };
  const { solid, candidates, unparsed } = composite(m.layers);
  const fgAlpha = Math.min(1, m.fg.a * m.fgOpacity);
  const fgOn = (bg) => over(m.fg, bg, fgAlpha);
  const ratioSolid = contrast(fgOn(solid), solid);
  let min = { ratio: Infinity, c: null, via: [] };
  let max = { ratio: 0, c: null, via: [] };
  let minNonPattern = { ratio: Infinity, c: null, via: [] };
  for (const k of candidates) {
    const ratio = contrast(fgOn(k.c), k.c);
    if (ratio < min.ratio) min = { ratio, c: k.c, via: k.via };
    if (ratio > max.ratio) max = { ratio, c: k.c, via: k.via };
    if (!k.via.some((v) => v.startsWith("pattern")) && ratio < minNonPattern.ratio) minNonPattern = { ratio, c: k.c, via: k.via };
  }
  const obscured = m.above.filter((a) => (a.bg && !a.bg.unparsed && a.bg.a * a.opacity > 0.05) || a.gradient?.length || a.imageUrl);
  return { ratioSolid, ratioMin: min.ratio, ratioMax: max.ratio, ratioMinNonPattern: minNonPattern.ratio, bgSolid: hex(solid), bgMin: min.c ? hex(min.c) : null, minVia: min.via, fgEffective: hex(fgOn(solid)), fgAlpha, unparsed, obscuredBy: obscured.map((a) => `${a.tag}${a.testid ? `[${a.testid}]` : ""}${a.cls ? "." + a.cls.split(" ").slice(0, 3).join(".") : ""}`), imageLayers: m.layers.filter((l) => l.imageUrl).map((l) => l.tag + (l.cls ? "." + l.cls.split(" ")[0] : "")) };
}

function verdictOf(node, e) {
  if (e.verdict) return e.verdict;
  const required = parseFloat(node.expected) || 4.5;
  if (e.ratioSolid < required) return "FAIL";
  if (e.ratioMin >= required) return "pass";
  if (e.ratioMinNonPattern >= required) return "pass-pattern"; // only the 1 px dots of a 24 px grid fall below
  return "review-gradient";
}

async function main() {
  const runs = collectRuns();
  const results = [];
  const browser = await chromium.launch();
  const storage = fs.existsSync(AUTH) ? JSON.parse(fs.readFileSync(AUTH, "utf8")) : undefined;
  let done = 0;
  for (const run of runs) {
    const { url, authed } = urlFor(run.slug);
    const mobile = run.width < 768;
    const context = await browser.newContext({ viewport: { width: run.width, height: mobile ? 812 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, locale: run.slug.startsWith("de-") ? "de-DE" : "en-US", storageState: authed ? storage : undefined, colorScheme: DARK ? "dark" : "light" });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "load", timeout: 60_000 });
      if (DARK) await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      for (const node of run.nodes) {
        let m;
        try {
          m = await page.evaluate(measureInPage, { target: node.target, related: node.related, html: node.html });
        } catch (err) {
          m = { found: false, error: String(err).slice(0, 200) };
        }
        const e = evaluate(m);
        results.push({ run: run.run, slug: run.slug, width: run.width, url: url.replace(BASE, ""), file: run.file, target: node.target, messageKey: node.messageKey, expected: node.expected, axeFont: `${node.fontSize} ${node.fontWeight}`.trim(), text: m.text ?? "", html: node.html.slice(0, 160), resolvedBy: m.resolvedBy, verdict: verdictOf(node, e), ...e, layers: m.layers?.map((l) => ({ kind: l.kind, tag: l.tag, cls: l.cls.split(" ").slice(0, 4).join(" "), bg: l.bg && !l.bg.unparsed ? `${hex(l.bg)}/${l.bg.a.toFixed(2)}` : l.bg?.unparsed ?? null, gradientStops: l.gradient?.length ?? 0, pattern: l.pattern || undefined, imageUrl: l.imageUrl || undefined, opacity: l.opacity })) });
      }
      done++;
      process.stdout.write(`[${done}/${runs.length}] ${run.run}: ${run.nodes.length} nodes\n`);
    } catch (err) {
      process.stdout.write(`[${done}/${runs.length}] ${run.run}: ERROR ${String(err).slice(0, 200)}\n`);
      for (const node of run.nodes) results.push({ run: run.run, slug: run.slug, width: run.width, url: url.replace(BASE, ""), file: run.file, target: node.target, messageKey: node.messageKey, expected: node.expected, verdict: "page-error", error: String(err).slice(0, 200) });
    } finally {
      await context.close();
    }
  }
  await browser.close();
  // --merge: replace only the re-run runs inside an existing output file (the other evaluations stay untouched)
  let all = results;
  let runCount = runs.length;
  if (args.includes("--merge") && fs.existsSync(OUT_JSON)) {
    const previous = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
    const rerun = new Set(runs.map((r) => r.run));
    all = [...previous.results.filter((r) => !rerun.has(r.run)), ...results];
    runCount = new Set(all.map((r) => r.run)).size;
    process.stdout.write(`merged ${results.length} evaluations of ${runs.length} runs into ${path.relative(root, OUT_JSON)} (previous ${previous.generatedAt})\n`);
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, dark: DARK, runs: runCount, nodes: all.length, results: all }, null, 1));
  process.stdout.write(`wrote ${path.relative(root, OUT_JSON)} (${all.length} evaluations)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
