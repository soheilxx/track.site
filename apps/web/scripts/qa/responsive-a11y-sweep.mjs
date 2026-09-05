// Responsive + accessibility sweep of the production build (supplement §10 "Responsive QA" / "Accessibility").
//
// For every route × viewport it records: horizontal page scroll (documentElement.scrollWidth vs clientWidth and
// innerWidth), elements wider than the viewport (topmost offender per subtree, 1 px tolerance, scroll containers
// excluded), clipped text on h1–h3 / buttons / links (scrollWidth > clientWidth), reachability of the primary actions
// (scrollIntoView + elementFromPoint), a WebP screenshot and — at 375 / 1440 — an axe-core run (wcag2a, wcag2aa,
// wcag22aa). Dashboard routes use the stored owner session from e2e/.auth/owner.json.
//
// Usage (from the repo root or apps/web, server already running):
//   QA_BASE_URL=http://localhost:3001 node apps/web/scripts/qa/responsive-a11y-sweep.mjs
// Options (env): QA_OUT (evidence dir, default docs/qa/2026-09-05), QA_ONLY (regex on route slug), QA_WIDTHS (csv),
//   QA_SKIP_AXE=1, QA_SKIP_SHOTS=1, QA_SKIP_SWEEP=1 (keyboard only), QA_SKIP_KEYBOARD=1, QA_CONCURRENCY (default 3).
// Every record is appended to screenshots/responsive-sweep.jsonl, so the sweep can run in chunks (e.g. QA_WIDTHS=320,375,
//   then 768,1024, then 1440,1920, then QA_SKIP_SWEEP=1 for the keyboard pass); QA_REPORT_ONLY=1 merges the chunks and
//   rebuilds responsive-sweep.json, responsive-sweep.md, axe/summary.{md,json} and axe/keyboard-summary.md.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

/** Progress line on stdout (the repo's `no-console` rule allows only warn/error; reports go to files). */
const stdout = (line) => process.stdout.write(`${line}\n`);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "../..");
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");
const BASE_URL = (process.env.QA_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = path.resolve(REPO_ROOT, process.env.QA_OUT ?? "docs/qa/2026-09-05");
const SHOTS = path.join(OUT, "screenshots");
const AXE_DIR = path.join(OUT, "axe");
const AUTH_FILE = path.join(WEB_ROOT, "e2e/.auth/owner.json");
const WIDTHS = (process.env.QA_WIDTHS ?? "320,375,768,1024,1440,1920").split(",").map((w) => Number(w.trim()));
const HEIGHT = 900;
const FULL_PAGE_WIDTHS = new Set([375, 768, 1440, 1920]);
const AXE_WIDTHS = new Set([375, 1440]);
const AXE_LOCALES = new Set(["en", "de"]);
const MAX_FULL_HEIGHT = 6000;
const MAX_WEBP_BYTES = 150 * 1024;
const ONLY = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : null;
const CONCURRENCY = Number(process.env.QA_CONCURRENCY ?? 3);
const ALL_LOCALES = ["en", "de", "fr", "es", "it", "nl"];
const DEFAULT_LOCALES = ["en", "de"];

/** Public routes (route ids follow docs/qa/2026-09-05/README.md). */
const PUBLIC = [
  { id: "home", path: "", locales: ALL_LOCALES },
  { id: "pricing", path: "/pricing", locales: ALL_LOCALES },
  { id: "features", path: "/features" },
  { id: "feature-server-side-tracking", path: "/features/server-side-tracking" },
  { id: "how-it-works", path: "/how-it-works" },
  { id: "integrations", path: "/integrations" },
  { id: "integration-meta", path: "/integrations/meta" },
  { id: "knowledge-hub", path: "/tracking-knowledge" },
  { id: "knowledge-article-consent-mode-v2-guide", path: "/tracking-knowledge/consent-mode-v2-guide" },
  { id: "docs", path: "/docs" },
  { id: "contact", path: "/contact", primary: "form" },
  { id: "security", path: "/security" },
  { id: "privacy", path: "/privacy" },
  { id: "login", path: "/login", primary: "form" },
  { id: "signup", path: "/signup", primary: "form" },
];

/** Dashboard routes (stored session). */
const DASHBOARD = [
  ["app-overview", "/app"],
  ["app-ai-setup", "/app/ai-setup"],
  ["app-events", "/app/events"],
  ["app-events-matrix", "/app/events/matrix"],
  ["app-events-explorer", "/app/events/explorer"],
  ["app-events-test-lab", "/app/events/test-lab"],
  ["app-destinations", "/app/destinations"],
  ["app-data-quality", "/app/data-quality"],
  ["app-revenue-leaks", "/app/data-quality/revenue-leaks"],
  ["app-consent", "/app/consent"],
  ["app-consent-simulator", "/app/consent/simulator"],
  ["app-attribution", "/app/insights/attribution"],
  ["app-releases", "/app/releases"],
  ["app-billing", "/app/billing"],
  ["app-usage", "/app/billing/usage"],
  ["app-team", "/app/team"],
  ["app-settings", "/app/settings"],
  ["app-alerts", "/app/settings/alerts"],
];

function routeList() {
  const routes = [];
  for (const r of PUBLIC) {
    for (const locale of r.locales ?? DEFAULT_LOCALES) {
      routes.push({ slug: `${locale}-${r.id}`, id: r.id, locale, url: `${BASE_URL}/${locale}${r.path}`, kind: "public", primary: r.primary ?? "marketing" });
    }
  }
  for (const [id, p] of DASHBOARD) routes.push({ slug: id, id, locale: null, url: `${BASE_URL}${p}`, kind: "dashboard", primary: "dashboard" });
  return ONLY ? routes.filter((r) => ONLY.test(r.slug)) : routes;
}

// ---------------------------------------------------------------------------------------------------------------------
// In-page measurements (serialised into the page; keep dependency-free)

function measure() {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const innerWidth = window.innerWidth;
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className : "";
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    return { tag: el.tagName.toLowerCase(), id: el.id || null, testid: el.getAttribute("data-testid"), class: cls.slice(0, 160), text };
  };
  const visible = (el, cs) => cs.display !== "none" && cs.visibility !== "hidden";
  const hasText = (el) => (el.innerText || "").trim().length > 0 || !!el.querySelector("a,button,input,select,textarea,img,svg[role=img]");

  // 1. Elements wider than the viewport (topmost offender per subtree). Elements inside a horizontal scroll container
  //    are legitimate; elements cut off by overflow hidden/clip are reported when they carry text or controls.
  const wide = [];
  const reported = new Set();
  let scrollerHidden = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (wide.length >= 30) break;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (!(r.right > vw + 1 || r.left < -1)) continue;
    let a = el.parentElement;
    let inReported = false;
    let clip = null;
    let visuallyHidden = false;
    while (a && a !== document.body) {
      if (reported.has(a)) {
        inReported = true;
        break;
      }
      const acs = getComputedStyle(a);
      const ox = acs.overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") {
        const ar = a.getBoundingClientRect();
        // sr-only / stacked-table pattern: a 1 px overflow-hidden ancestor hides its subtree from sighted users on purpose
        if ((ox === "hidden" || ox === "clip") && (ar.width <= 1 || ar.height <= 1 || acs.clip === "rect(0px, 0px, 0px, 0px)")) {
          visuallyHidden = true;
          break;
        }
        if (ar.left >= -1 && ar.right <= vw + 1) {
          clip = ox === "auto" || ox === "scroll" ? "scroller" : "hidden";
          break;
        }
      }
      a = a.parentElement;
    }
    if (inReported || visuallyHidden) continue;
    if (clip === "scroller") {
      scrollerHidden += 1;
      continue;
    }
    if (clip === "hidden" && !hasText(el)) continue; // decorative overflow (gradients, glows) cut by overflow hidden
    reported.add(el);
    // direct children widths help to root-cause a container that is forced wider than the viewport
    const children = [...el.children]
      .map((c) => {
        const cr = c.getBoundingClientRect();
        return { tag: c.tagName.toLowerCase(), testid: c.getAttribute("data-testid"), class: (typeof c.className === "string" ? c.className : "").slice(0, 60), width: Math.round(cr.width), left: Math.round(cr.left), right: Math.round(cr.right) };
      })
      .filter((c) => c.width > 0)
      .slice(0, 10);
    wide.push({ ...describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), position: cs.position, opacity: cs.opacity, clippedBy: clip, children });
  }

  // 2. Clipped text heuristic on headings, buttons and links (visually hidden sr-only elements are excluded)
  const clipped = [];
  for (const el of document.querySelectorAll("h1,h2,h3,button,a,[role=button]")) {
    if (clipped.length >= 30) break;
    const cs = getComputedStyle(el);
    if (!visible(el, cs) || el.clientWidth === 0) continue;
    if (cs.clip === "rect(0px, 0px, 0px, 0px)" || (el.clientWidth <= 1 && el.clientHeight <= 1)) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const isClipped = cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.textOverflow === "ellipsis";
    clipped.push({ ...describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: cs.overflowX, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, clipped: isClipped });
  }

  // 3. Absolutely positioned boxes beyond the viewport (e.g. sr-only spans inside a horizontal scroller whose containing
  //    block is outside the scroller: they escape its clip and grow the page's scrollable width without being visible)
  const absOffenders = [];
  for (const el of document.querySelectorAll("body *")) {
    if (absOffenders.length >= 10) break;
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute" && cs.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (!(r.right > vw + 1 || r.left < -1)) continue;
    let cb = el.parentElement;
    while (cb && getComputedStyle(cb).position === "static") cb = cb.parentElement;
    absOffenders.push({ ...describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height), position: cs.position, containingBlock: cb ? `${cb.tagName.toLowerCase()}${cb.id ? "#" + cb.id : ""}${cb.getAttribute("data-testid") ? "[" + cb.getAttribute("data-testid") + "]" : ""}` : "initial containing block" });
  }

  const main = document.querySelector("[data-testid=app-main]");
  const vv = window.visualViewport;
  return {
    innerWidth,
    clientWidth: vw,
    // mobile emulation: a scale below 1 means Chromium zoomed out to fit content wider than the layout viewport
    visualViewport: vv ? { width: Math.round(vv.width), scale: Number(vv.scale.toFixed(3)) } : null,
    zoomedOut: !!vv && vv.scale < 0.999,
    scrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    scrollHeight: de.scrollHeight,
    scrollbar: innerWidth - vw,
    horizontalScroll: de.scrollWidth > vw,
    horizontalScrollVsInner: de.scrollWidth > innerWidth,
    appMain: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, overflow: main.scrollWidth > main.clientWidth + 1 } : null,
    wide,
    scrollerHidden,
    absOffenders,
    clipped,
    h1: [...document.querySelectorAll("h1")].map((h) => (h.innerText || "").trim().slice(0, 80)),
    title: document.title,
    lang: de.lang,
  };
}

/** Selectors of the primary actions per page kind; `anyOf` groups pass when one member is reachable. */
function primarySelectors(kind) {
  if (kind === "form") {
    return [
      { name: "form submit", anyOf: ["main form button[type=submit]", "form button[type=submit]"] },
      // the auth shell has a reduced header without the marketing CTAs; the alternative action lives in the main column
      { name: "header start/menu or alternative link", anyOf: ["header a[href*='/signup']", "header button[aria-haspopup='dialog']", "header a[href*='/login']", "main a[href*='/signup']", "main a[href*='/login']"], optional: true },
    ];
  }
  if (kind === "dashboard") {
    return [
      { name: "page primary button", anyOf: ["main a.bg-primary", "main button.bg-primary"], optional: true },
      { name: "navigation", anyOf: ["aside nav a", "button[aria-controls='app-nav-drawer']"] },
      { name: "assistant launcher", anyOf: ["[data-testid=assistant-launcher]", "[data-testid=assistant-fab]"] },
      { name: "workspace switcher", anyOf: ["[data-testid=workspace-switcher] button", "[data-testid=workspace-switcher]"], optional: true },
      { name: "user menu", anyOf: ["header > div:last-child button[aria-haspopup='menu']"] },
    ];
  }
  return [
    { name: "main CTA", anyOf: ["main a.bg-primary", "main button.bg-primary", "main a[href*='/signup']"], optional: true },
    { name: "header start/menu", anyOf: ["header a[href*='/signup']", "header button[aria-haspopup='dialog']", "header a[href*='/login']"] },
  ];
}

function checkPrimary(groups) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const out = [];
  for (const g of groups) {
    const attempts = [];
    let ok = false;
    for (const sel of g.anyOf) {
      const el = document.querySelector(sel);
      if (!el) {
        attempts.push({ sel, result: "not-in-dom" });
        continue;
      }
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") {
        attempts.push({ sel, result: "hidden" });
        continue;
      }
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
      if (r.width === 0 || r.height === 0) {
        attempts.push({ sel, text, result: "zero-size" });
        continue;
      }
      // scrollIntoView also scrolls overflow:hidden/clip ancestors (the viewport included), which a user cannot do
      let hiddenScroller = null;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const acs = getComputedStyle(a);
        const target = a === document.documentElement ? document.scrollingElement || a : a;
        if (((acs.overflowX === "hidden" || acs.overflowX === "clip") && target.scrollLeft > 0) || ((acs.overflowY === "hidden" || acs.overflowY === "clip") && target.scrollTop > 0)) {
          hiddenScroller = { a, target };
          break;
        }
      }
      if (hiddenScroller) {
        const { a, target } = hiddenScroller;
        const desc = `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}${a.getAttribute("data-testid") ? "[" + a.getAttribute("data-testid") + "]" : ""}`;
        attempts.push({ sel, text, result: "outside-viewport-hidden-overflow", by: `${desc} scrollLeft=${target.scrollLeft} scrollTop=${target.scrollTop}`, left: Math.round(r.left + target.scrollLeft), right: Math.round(r.right + target.scrollLeft) });
        target.scrollLeft = 0;
        target.scrollTop = 0;
        continue;
      }
      if (r.left < -1 || r.right > vw + 1) {
        attempts.push({ sel, text, result: "outside-horizontally", left: Math.round(r.left), right: Math.round(r.right) });
        continue;
      }
      if (r.top < -1 || r.bottom > vh + 1) {
        attempts.push({ sel, text, result: "not-scrollable-into-view", top: Math.round(r.top), bottom: Math.round(r.bottom) });
        continue;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
        const h = hit ? `${hit.tagName.toLowerCase()}${hit.id ? "#" + hit.id : ""}${hit.getAttribute("data-testid") ? "[" + hit.getAttribute("data-testid") + "]" : ""}` : "nothing";
        attempts.push({ sel, text, result: "occluded", by: h });
        continue;
      }
      attempts.push({ sel, text, result: "reachable", width: Math.round(r.width), height: Math.round(r.height) });
      ok = true;
      break;
    }
    const inDom = attempts.some((a) => a.result !== "not-in-dom");
    out.push({ name: g.name, ok: ok || (!!g.optional && !inDom), status: ok ? "reachable" : !inDom && g.optional ? "n/a (not on page)" : "NOT reachable", attempts });
  }
  window.scrollTo(0, 0);
  const main = document.querySelector("[data-testid=app-main]");
  if (main) main.scrollTop = 0;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------

async function encode(img, qualities) {
  let buf;
  let quality;
  for (quality of qualities) {
    buf = await img.clone().webp({ quality, effort: 4 }).toBuffer();
    if (buf.length <= MAX_WEBP_BYTES) break;
  }
  return { buf, quality };
}

async function writeShot(buf, file, quality, extra) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  const m = await sharp(buf).metadata();
  return { file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"), bytes: buf.length, quality, width: m.width, height: m.height, overLimit: buf.length > MAX_WEBP_BYTES, ...extra };
}

/**
 * PNG → WebP at native width, quality 70 → 60. A capture taller than `capHeight` is cut to that height. When the
 * result is still above 150 KB the capture is split into equal vertical segments (`file`, `file--part2`, …) at
 * quality 60 rather than scaled, so text stays legible (README §5); a segment still above the limit is encoded at 50.
 */
async function toWebp(png, file, capHeight) {
  const meta = await sharp(png).metadata();
  let base = sharp(png);
  let cropped = false;
  let height = meta.height;
  if (capHeight && meta.height > capHeight) {
    base = base.extract({ left: 0, top: 0, width: meta.width, height: capHeight });
    height = capHeight;
    cropped = true;
  }
  const whole = await encode(base, [70, 60]);
  if (whole.buf.length <= MAX_WEBP_BYTES) return [await writeShot(whole.buf, file, whole.quality, { cropped, fullHeight: meta.height })];
  const capped = await base.png().toBuffer();
  for (let parts = 2; parts <= 6; parts += 1) {
    const segment = Math.ceil(height / parts);
    const out = [];
    let ok = true;
    for (let i = 0; i < parts; i += 1) {
      const top = i * segment;
      const h = Math.min(segment, height - top);
      if (h <= 0) break;
      const seg = sharp(capped).extract({ left: 0, top, width: meta.width, height: h });
      const enc = await encode(seg, [60, 50]);
      if (enc.buf.length > MAX_WEBP_BYTES && parts < 6) {
        ok = false;
        break;
      }
      out.push({ buf: enc.buf, quality: enc.quality, top, h });
    }
    if (!ok) continue;
    const written = [];
    for (let i = 0; i < out.length; i += 1) {
      const target = i === 0 ? file : file.replace(/\.webp$/, `--part${i + 1}.webp`);
      written.push(await writeShot(out[i].buf, target, out[i].quality, { cropped, fullHeight: meta.height, segment: `${out[i].top}-${out[i].top + out[i].h}` }));
    }
    return written;
  }
  return [await writeShot(whole.buf, file, whole.quality, { cropped, fullHeight: meta.height })];
}

async function gotoAndSettle(page, url) {
  const started = Date.now();
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    /* long-polling / streams keep the network busy; continue */
  }
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  await page.waitForTimeout(400);
  return { status: resp?.status() ?? null, finalUrl: page.url(), loadMs: Date.now() - started };
}

async function runAxe(page) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  return {
    url: res.url,
    timestamp: res.timestamp,
    testEngine: res.testEngine,
    testRunner: res.testRunner,
    testEnvironment: res.testEnvironment,
    toolOptions: res.toolOptions,
    violations: res.violations,
    incomplete: res.incomplete,
    passes: res.passes.map((p) => ({ id: p.id, impact: p.impact, nodes: p.nodes.length })),
    inapplicable: res.inapplicable.map((p) => p.id),
    counts: { violations: res.violations.length, incomplete: res.incomplete.length, passes: res.passes.length, inapplicable: res.inapplicable.length },
  };
}

async function sweepWidth(browser, width, routes, results) {
  const mobile = width <= 480;
  const make = (storageState) =>
    browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: "en-US", storageState, colorScheme: "light" });
  const anon = await make({ cookies: [], origins: [] });
  const authed = await make(AUTH_FILE);
  const page = await anon.newPage();
  const appPage = await authed.newPage();
  for (const route of routes) {
    const p = route.kind === "dashboard" ? appPage : page;
    const t0 = Date.now();
    const rec = { slug: route.slug, kind: route.kind, locale: route.locale, url: route.url, width, mobile };
    try {
      const nav = await gotoAndSettle(p, route.url);
      Object.assign(rec, nav);
      if (route.kind === "dashboard") {
        rec.sessionOk = /\/app(\/|$|\?)/.test(new URL(p.url()).pathname);
        if (rec.sessionOk) await p.getByTestId("app-shell").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      }
      rec.measure = await p.evaluate(measure);
      if (process.env.QA_SKIP_SHOTS !== "1") {
        const full = FULL_PAGE_WIDTHS.has(width);
        const shots = [];
        const png = await p.screenshot({ fullPage: full, type: "png", animations: "disabled", caret: "hide" });
        shots.push(...(await toWebp(png, path.join(SHOTS, route.slug, `${width}.webp`), full ? MAX_FULL_HEIGHT : null)));
        // viewport-fixed dashboard shell: the document never grows, so capture the scrolling main region in segments
        const m = rec.measure.appMain;
        if (full && m && m.scrollHeight > m.clientHeight + 40) {
          const parts = Math.min(Math.ceil(m.scrollHeight / m.clientHeight), Math.ceil(MAX_FULL_HEIGHT / HEIGHT));
          for (let i = 1; i < parts; i += 1) {
            await p.evaluate((top) => {
              document.querySelector("[data-testid=app-main]").scrollTop = top;
            }, i * m.clientHeight);
            await p.waitForTimeout(150);
            const part = await p.screenshot({ type: "png", animations: "disabled", caret: "hide" });
            shots.push(...(await toWebp(part, path.join(SHOTS, route.slug, `${width}--part${i + 1}.webp`), null)));
          }
          await p.evaluate(() => {
            document.querySelector("[data-testid=app-main]").scrollTop = 0;
          });
        }
        rec.screenshots = shots;
      }
      if (process.env.QA_SKIP_AXE !== "1" && AXE_WIDTHS.has(width) && (route.kind === "dashboard" || AXE_LOCALES.has(route.locale))) {
        const axe = await runAxe(p);
        const file = path.join(AXE_DIR, `${route.slug}--${width}.json`);
        await fs.mkdir(AXE_DIR, { recursive: true });
        await fs.writeFile(file, JSON.stringify(axe, null, 2));
        rec.axe = { file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"), counts: axe.counts, violations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) };
      }
      rec.primary = await p.evaluate(checkPrimary, primarySelectors(route.primary));
    } catch (err) {
      rec.error = String(err?.message ?? err).slice(0, 500);
    }
    rec.ms = Date.now() - t0;
    results.push(rec);
    // incremental persistence: a chunked run (QA_WIDTHS / QA_ONLY) appends here; QA_REPORT_ONLY=1 merges the lines
    await fs.appendFile(path.join(SHOTS, "responsive-sweep.jsonl"), JSON.stringify(rec) + "\n");
    const flags = [];
    if (rec.measure?.horizontalScroll) flags.push("HSCROLL");
    if (rec.measure?.zoomedOut) flags.push(`ZOOMED-OUT(${rec.measure.visualViewport.width})`);
    if (rec.measure?.appMain?.overflow) flags.push("MAIN-OVERFLOW");
    if (rec.measure?.wide?.length) flags.push(`wide=${rec.measure.wide.length}`);
    if (rec.measure?.clipped?.filter((c) => c.clipped).length) flags.push(`clipped=${rec.measure.clipped.filter((c) => c.clipped).length}`);
    if (rec.primary?.some((g) => !g.ok)) flags.push("PRIMARY");
    if (rec.axe?.counts.violations) flags.push(`axe=${rec.axe.counts.violations}`);
    if (rec.error) flags.push("ERROR");
    stdout(`[${width}] ${route.slug} ${rec.status ?? "-"} ${rec.ms}ms ${flags.join(" ")}`);
  }
  await anon.close();
  await authed.close();
}

// ---------------------------------------------------------------------------------------------------------------------
// Keyboard: tab through the first 40 focusable elements and compare focused vs. blurred computed styles

function focusSnapshot() {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  // an outline only renders with a style other than none (Tailwind v4: `outline-none` + `focus-visible:outline-2`
  // keeps outline-style none, so width/colour changes alone are invisible); a box-shadow only counts when at least
  // one of its layers is not fully transparent
  const shadowVisible = (s) => s !== "none" && s.split(/,(?![^(]*\))/).some((layer) => !/^\s*rgba\(\d+, \d+, \d+, 0\)/.test(layer) && !/\/ 0\)/.test(layer));
  const pick = (cs) => ({
    outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} offset ${cs.outlineOffset}` : "none",
    boxShadow: shadowVisible(cs.boxShadow) ? cs.boxShadow : "none",
    border: `${cs.borderTopColor} ${cs.borderBottomColor}`,
    background: cs.backgroundColor,
    color: cs.color,
    textDecoration: cs.textDecorationLine,
  });
  const styles = (target) => {
    const cs = getComputedStyle(target);
    const before = getComputedStyle(target, "::before");
    const after = getComputedStyle(target, "::after");
    const r = target.getBoundingClientRect();
    return {
      self: pick(cs),
      before: { outline: before.outlineStyle, boxShadow: before.boxShadow, opacity: before.opacity, background: before.backgroundColor, content: before.content },
      after: { outline: after.outlineStyle, boxShadow: after.boxShadow, opacity: after.opacity, background: after.backgroundColor, content: after.content },
      parent: target.parentElement ? pick(getComputedStyle(target.parentElement)) : null,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      clip: cs.clip,
      visibility: cs.visibility,
      opacity: cs.opacity,
    };
  };
  const focused = styles(el);
  el.blur();
  const blurred = styles(el);
  el.focus({ preventScroll: true });
  const diff = [];
  const cmp = (a, b, prefix) => {
    for (const k of Object.keys(a)) {
      if (a[k] && typeof a[k] === "object") cmp(a[k], b[k] ?? {}, `${prefix}${k}.`);
      else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.push(`${prefix}${k}: ${b[k]} → ${a[k]}`);
    }
  };
  cmp(focused, blurred, "");
  const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const r = el.getBoundingClientRect();
  return {
    body: false,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role"),
    id: el.id || null,
    testid: el.getAttribute("data-testid"),
    href: el.getAttribute("href"),
    label,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
    focusVisible: el.matches(":focus-visible"),
    visibleIndicator: diff.length > 0,
    diff,
    focusedOutline: focused.self.outline,
    focusedBoxShadow: focused.self.boxShadow,
  };
}

async function keyboardCheck(browser, slug, url, authed) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: HEIGHT }, deviceScaleFactor: 1, locale: "en-US", storageState: authed ? AUTH_FILE : { cookies: [], origins: [] }, colorScheme: "light" });
  const page = await ctx.newPage();
  const nav = await gotoAndSettle(page, url);
  // focus styles are transitioned (border-color/box-shadow, --motion-fast); sample the final values, not a tween
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  await page.waitForTimeout(100);
  const steps = [];
  const shotDir = path.join(SHOTS, "keyboard", slug);
  let previous = null;
  for (let i = 1; i <= 40; i += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const snap = await page.evaluate(focusSnapshot);
    const step = { step: i, ...snap };
    if (!snap.body) {
      const key = `${snap.tag}#${snap.id}|${snap.label}|${snap.rect.x},${snap.rect.y}`;
      step.sameAsPrevious = key === previous;
      previous = key;
      // evidence: a 480×160 crop around the focused element (focused state, taken before the blur/refocus of the next step)
      const clip = { x: Math.max(0, snap.rect.x - 40), y: Math.max(0, snap.rect.y - 40), width: Math.min(480, 1440 - Math.max(0, snap.rect.x - 40)), height: Math.max(40, Math.min(220, snap.rect.h + 80)) };
      if (snap.inViewport && clip.width > 0) {
        try {
          const png = await page.screenshot({ clip, type: "png", animations: "disabled" });
          const [shot] = await toWebp(png, path.join(shotDir, `tab-${String(i).padStart(2, "0")}.webp`), null);
          step.screenshot = shot.file;
        } catch (err) {
          step.screenshotError = String(err?.message ?? err).slice(0, 200);
        }
      }
    }
    steps.push(step);
  }
  await ctx.close();
  const failures = steps.filter((s) => !s.body && !s.visibleIndicator);
  return { slug, url, ...nav, steps, summary: { steps: steps.length, focusedElements: steps.filter((s) => !s.body).length, bodyFocus: steps.filter((s) => s.body).length, withoutVisibleIndicator: failures.length, notFocusVisible: steps.filter((s) => !s.body && !s.focusVisible).length } };
}

// ---------------------------------------------------------------------------------------------------------------------

function impactRank(i) {
  return { critical: 0, serious: 1, moderate: 2, minor: 3 }[i] ?? 4;
}

async function writeAxeSummary(results) {
  const rows = results.filter((r) => r.axe);
  const files = [];
  for (const r of rows) {
    const raw = JSON.parse(await fs.readFile(path.join(REPO_ROOT, r.axe.file), "utf8"));
    files.push({ slug: r.slug, width: r.width, file: r.axe.file, counts: raw.counts, violations: raw.violations, incomplete: raw.incomplete.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, description: v.description })) });
  }
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const byRule = new Map();
  for (const f of files) {
    for (const v of f.violations) {
      byImpact[v.impact] = (byImpact[v.impact] ?? 0) + v.nodes.length;
      const key = v.id;
      const entry = byRule.get(key) ?? { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, description: v.description, pages: [], nodes: 0 };
      entry.pages.push(`${f.slug}@${f.width}`);
      entry.nodes += v.nodes.length;
      byRule.set(key, entry);
    }
  }
  const rules = [...byRule.values()].sort((a, b) => impactRank(a.impact) - impactRank(b.impact) || b.nodes - a.nodes);
  const md = [];
  md.push("# axe-core summary — responsive/a11y sweep 2026-09-05");
  md.push("");
  md.push(`Base URL: ${BASE_URL} (production build, \`next start\`). Tags: wcag2a, wcag2aa, wcag22aa; all impacts. Widths 375 (mobile emulation, touch) and 1440. Locales en + de for public routes; the dashboard is not localized and runs once per width with the stored owner session. Generated by \`apps/web/scripts/qa/responsive-a11y-sweep.mjs\`; every number below is read from the raw JSON files listed in the table.`);
  md.push("");
  md.push(`Runs: ${files.length}. Violation nodes by impact: critical ${byImpact.critical}, serious ${byImpact.serious}, moderate ${byImpact.moderate}, minor ${byImpact.minor}. Pages with zero violations: ${files.filter((f) => f.violations.length === 0).length}/${files.length}.`);
  md.push("");
  md.push("## Violations by rule (all runs)");
  md.push("");
  if (rules.length === 0) md.push("No violations in any run.");
  for (const rule of rules) {
    md.push(`### ${rule.impact} — \`${rule.id}\` (${rule.nodes} nodes, ${rule.pages.length} runs)`);
    md.push("");
    md.push(`${rule.help} — ${rule.helpUrl}`);
    md.push("");
    md.push(`Runs: ${rule.pages.join(", ")}`);
    md.push("");
    const snippets = new Map();
    for (const f of files) {
      for (const v of f.violations.filter((x) => x.id === rule.id)) {
        for (const n of v.nodes) {
          const key = n.html.slice(0, 300);
          const s = snippets.get(key) ?? { html: key, target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(0, 3).join(" ") ?? "", runs: [] };
          s.runs.push(`${f.slug}@${f.width}`);
          snippets.set(key, s);
        }
      }
    }
    let shown = 0;
    for (const s of snippets.values()) {
      if (shown >= 8) {
        md.push(`- … ${snippets.size - shown} more distinct nodes (see raw JSON)`);
        break;
      }
      md.push(`- \`${s.target}\` (${s.runs.length} runs) — ${s.summary}`);
      md.push("");
      md.push("  ```html");
      md.push(`  ${s.html.replace(/\n/g, " ")}`);
      md.push("  ```");
      shown += 1;
    }
    md.push("");
  }
  md.push("## Per run");
  md.push("");
  md.push("| Route | Width | Violations (nodes) | Incomplete (needs review) | Passes | Raw file |");
  md.push("| --- | --- | --- | --- | --- | --- |");
  for (const f of files.sort((a, b) => a.slug.localeCompare(b.slug) || a.width - b.width)) {
    const v = f.violations.map((x) => `${x.id}:${x.impact}×${x.nodes.length}`).join(", ") || "0";
    const inc = f.incomplete.map((x) => `${x.id}×${x.nodes}`).join(", ") || "0";
    md.push(`| ${f.slug} | ${f.width} | ${v} | ${inc} | ${f.counts.passes} | ${f.file} |`);
  }
  md.push("");
  await fs.writeFile(path.join(AXE_DIR, "summary.md"), md.join("\n"));
  await fs.writeFile(path.join(AXE_DIR, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, byImpact, rules, runs: files.map((f) => ({ slug: f.slug, width: f.width, file: f.file, counts: f.counts, violations: f.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), incomplete: f.incomplete })) }, null, 2));
}

async function writeResponsiveReport(results) {
  const md = [];
  md.push("# Responsive sweep 2026-09-05 (production build on " + BASE_URL + ")");
  md.push("");
  md.push("Widths 320, 375 (mobile emulation with touch), 768, 1024, 1440, 1920 at 900 px height. Checks per route × width: `documentElement.scrollWidth <= clientWidth` (Chromium headless reserves a classic 15 px scrollbar on desktop viewports, so `clientWidth = innerWidth - 15` when the page scrolls vertically; `innerWidth` comparison is recorded too), elements wider than the viewport (topmost offender per subtree, tolerance 1 px; elements inside `overflow-x: auto|scroll` containers count as intended scrollers), clipped text on h1–h3/buttons/links (`scrollWidth > clientWidth + 1`; marked clipped when `overflow-x` is hidden/clip or `text-overflow: ellipsis`), primary actions (scrollIntoView + elementFromPoint), screenshot file/size. Full-page screenshots at 375/768/1440/1920 (height capped at 6000 px), viewport screenshots at 320/1024. The dashboard shell is viewport-fixed (`h-dvh`), so its full-page capture equals the viewport; the scrolling main region is captured in additional `--partN` files. Generated by `apps/web/scripts/qa/responsive-a11y-sweep.mjs`; raw data in `responsive-sweep.json` next to this file.");
  md.push("");
  const hs = results.filter((r) => r.measure?.horizontalScroll);
  const zo = results.filter((r) => r.measure?.zoomedOut);
  const mo = results.filter((r) => r.measure?.appMain?.overflow);
  const wide = results.filter((r) => r.measure?.wide?.length);
  const clipped = results.filter((r) => r.measure?.clipped?.some((c) => c.clipped));
  const prim = results.filter((r) => r.primary?.some((g) => !g.ok));
  const errors = results.filter((r) => r.error);
  const over = results.flatMap((r) => (r.screenshots ?? []).filter((s) => s.overLimit).map((s) => s.file));
  md.push("## Totals");
  md.push("");
  md.push(`- Route × width runs: ${results.length} (errors: ${errors.length})`);
  md.push(`- Horizontal page scroll (scrollWidth > clientWidth): ${hs.length} runs`);
  md.push(`- Mobile zoom-out (visualViewport.scale < 1 at 320/375: content wider than the layout viewport, the phone shrinks the page): ${zo.length} runs`);
  md.push(`- Dashboard main region wider than its box (clipped, no scroll): ${mo.length} runs`);
  md.push(`- Runs with elements wider than the viewport: ${wide.length}`);
  md.push(`- Runs with clipped headings/buttons/links: ${clipped.length}`);
  md.push(`- Runs with a primary action not reachable: ${prim.length}`);
  md.push(`- Screenshots above 150 KB: ${over.length}${over.length ? " — " + over.join(", ") : ""}`);
  md.push("");
  const section = (title, rows, fmt) => {
    md.push(`## ${title}`);
    md.push("");
    if (!rows.length) md.push("none");
    for (const r of rows) md.push(fmt(r));
    md.push("");
  };
  const abs = (r) => (r.measure.absOffenders ?? []).map((a) => `${a.tag}.${a.class.split(" ")[0]} ${a.width}×${a.height} at ${a.left}..${a.right} "${a.text.slice(0, 30)}" (containing block: ${a.containingBlock})`).join("; ");
  section("Horizontal page scroll", hs, (r) => `- ${r.slug} @ ${r.width}: scrollWidth ${r.measure.scrollWidth} > clientWidth ${r.measure.clientWidth} (innerWidth ${r.measure.innerWidth}); wide elements: ${r.measure.wide.map((w) => `${w.tag}${w.id ? "#" + w.id : ""}${w.testid ? "[" + w.testid + "]" : ""} ${w.width}px (${w.left}..${w.right}) "${w.text.slice(0, 40)}"`).join("; ") || "none identified"}; absolutely positioned boxes beyond the viewport: ${abs(r) || "none"}`);
  section("Mobile zoom-out (content wider than the 320/375 layout viewport)", zo, (r) => `- ${r.slug} @ ${r.width}: visual viewport ${r.measure.visualViewport.width} px at scale ${r.measure.visualViewport.scale}; wide elements: ${r.measure.wide.map((w) => `${w.tag}${w.id ? "#" + w.id : ""}${w.testid ? "[" + w.testid + "]" : ""} ${w.width}px (children: ${w.children.map((c) => `${c.tag}${c.testid ? "[" + c.testid + "]" : ""} ${c.width}`).join(", ")})`).join("; ") || "none identified"}`);
  section("Dashboard main region overflow (main has overflow-x: clip, so this is invisible unless a wide element is listed)", mo, (r) => `- ${r.slug} @ ${r.width}: main scrollWidth ${r.measure.appMain.scrollWidth} > clientWidth ${r.measure.appMain.clientWidth}; wide elements: ${r.measure.wide.map((w) => `${w.tag}${w.id ? "#" + w.id : ""} ${w.width}px (${w.left}..${w.right}) "${w.text.slice(0, 40)}" [${w.clippedBy ?? "unclipped"}]`).join("; ") || "none identified"}; absolutely positioned boxes beyond the viewport: ${abs(r) || "none"}`);
  section("Elements wider than the viewport (not inside a scroll container)", wide.filter((r) => !r.measure.horizontalScroll && !r.measure.appMain?.overflow), (r) => `- ${r.slug} @ ${r.width}: ${r.measure.wide.map((w) => `${w.tag}${w.id ? "#" + w.id : ""}${w.testid ? "[" + w.testid + "]" : ""} ${w.width}px (${w.left}..${w.right}) pos=${w.position} clippedBy=${w.clippedBy ?? "none"} "${w.text.slice(0, 40)}"`).join("; ")}`);
  section("Clipped text (overflow hidden/clip or ellipsis on h1–h3, buttons, links)", clipped, (r) => `- ${r.slug} @ ${r.width}: ${r.measure.clipped.filter((c) => c.clipped).map((c) => `${c.tag} "${c.text.slice(0, 50)}" scroll ${c.scrollWidth} > client ${c.clientWidth} (${c.overflowX}/${c.textOverflow}/${c.whiteSpace})`).join("; ")}`);
  const overflowVisible = results.filter((r) => r.measure?.clipped?.some((c) => !c.clipped));
  section("Overflowing but not clipped (scrollWidth > clientWidth with overflow visible; informational)", overflowVisible, (r) => `- ${r.slug} @ ${r.width}: ${r.measure.clipped.filter((c) => !c.clipped).map((c) => `${c.tag} "${c.text.slice(0, 40)}" ${c.scrollWidth}>${c.clientWidth} (${c.whiteSpace})`).join("; ")}`);
  section("Primary actions not reachable", prim, (r) => `- ${r.slug} @ ${r.width}: ${r.primary.filter((g) => !g.ok).map((g) => `${g.name}: ${g.status} — ${g.attempts.map((a) => `${a.sel} → ${a.result}${a.by ? " by " + a.by : ""}`).join(" | ")}`).join("; ")}`);
  section("Errors", errors, (r) => `- ${r.slug} @ ${r.width}: ${r.error}`);
  md.push("## Matrix");
  md.push("");
  md.push("| Route | Width | HTTP | Final URL ok | scrollWidth/clientWidth/inner | Wide | Clipped | Primary | Screenshot (KB, q) |");
  md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results.sort((a, b) => a.slug.localeCompare(b.slug) || a.width - b.width)) {
    const m = r.measure;
    const urlOk = r.kind === "dashboard" ? (r.sessionOk ? "yes" : "NO (redirected)") : r.finalUrl === r.url ? "yes" : `redirect → ${r.finalUrl}`;
    const shot = (r.screenshots ?? []).map((s) => `${Math.round(s.bytes / 1024)} q${s.quality}${s.cropped ? " cut" : ""}`).join(" + ") || "-";
    md.push(`| ${r.slug} | ${r.width} | ${r.status ?? "-"} | ${urlOk} | ${m ? `${m.scrollWidth}/${m.clientWidth}/${m.innerWidth}${m.horizontalScroll ? " **HSCROLL**" : ""}${m.zoomedOut ? ` **ZOOM ${m.visualViewport.width}px**` : ""}${m.appMain?.overflow ? " **MAIN**" : ""}` : "-"} | ${m ? m.wide.length : "-"} | ${m ? m.clipped.filter((c) => c.clipped).length : "-"} | ${r.primary ? (r.primary.every((g) => g.ok) ? "ok" : "**FAIL**") : "-"} | ${shot} |`);
  }
  md.push("");
  await fs.writeFile(path.join(SHOTS, "responsive-sweep.md"), md.join("\n"));
}

async function writeKeyboardReport(list) {
  const md = [];
  md.push("# Keyboard focus check 2026-09-05");
  md.push("");
  md.push("Width 1440, Chromium. 40 × Tab from page load; after each Tab the focused element's computed styles (outline, box-shadow, border, background, colour, text-decoration, ::before/::after, parent) and rect are compared with the same element blurred. `visibleIndicator=false` means no computed difference between focused and unfocused state (a failure of \"sichtbare Fokuszustände\"). Crops of every focused element are under `screenshots/keyboard/<slug>/tab-NN.webp`. Raw data: `axe/keyboard/<slug>.json`.");
  md.push("");
  for (const k of list) {
    md.push(`## ${k.slug} — ${k.url}`);
    md.push("");
    md.push(`Steps ${k.summary.steps}, focused elements ${k.summary.focusedElements}, focus on body ${k.summary.bodyFocus}, without visible indicator **${k.summary.withoutVisibleIndicator}**, not matching :focus-visible ${k.summary.notFocusVisible}.`);
    md.push("");
    md.push("| # | Element | Label | :focus-visible | Indicator | Change | Crop |");
    md.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const s of k.steps) {
      if (s.body) {
        md.push(`| ${s.step} | (body) | focus left the page/cycled | - | - | - | - |`);
        continue;
      }
      const el = `${s.tag}${s.id ? "#" + s.id : ""}${s.testid ? "[" + s.testid + "]" : ""}${s.href ? " " + s.href : ""}`;
      md.push(`| ${s.step} | ${el.replace(/\|/g, "/")} | ${s.label.replace(/\|/g, "/")} | ${s.focusVisible ? "yes" : "no"} | ${s.visibleIndicator ? "yes" : "**NO**"} | ${s.diff.slice(0, 2).join("; ").replace(/\|/g, "/").slice(0, 120)} | ${s.screenshot ?? "-"} |`);
    }
    md.push("");
  }
  await fs.writeFile(path.join(AXE_DIR, "keyboard-summary.md"), md.join("\n"));
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  await fs.mkdir(AXE_DIR, { recursive: true });
  const started = Date.now();
  if (process.env.QA_REPORT_ONLY === "1") {
    // merge every chunk (last record per slug × width wins) and rebuild the reports without touching the browser
    const lines = (await fs.readFile(path.join(SHOTS, "responsive-sweep.jsonl"), "utf8")).split("\n").filter(Boolean);
    const merged = new Map();
    for (const line of lines) {
      const rec = JSON.parse(line);
      merged.set(`${rec.slug}@${rec.width}`, rec);
    }
    const results = [...merged.values()];
    await fs.writeFile(path.join(SHOTS, "responsive-sweep.json"), JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, widths: WIDTHS, mergedFrom: "responsive-sweep.jsonl", results }, null, 2));
    await writeResponsiveReport(results);
    await writeAxeSummary(results);
    const keyboardDir = path.join(AXE_DIR, "keyboard");
    const keyboardFiles = await fs.readdir(keyboardDir).catch(() => []);
    const list = [];
    for (const f of keyboardFiles.filter((n) => n.endsWith(".json")).sort()) list.push(JSON.parse(await fs.readFile(path.join(keyboardDir, f), "utf8")));
    if (list.length) await writeKeyboardReport(list);
    stdout(`reports rebuilt from ${results.length} records (${lines.length} lines), ${list.length} keyboard runs`);
    return;
  }
  const browser = await chromium.launch();
  const results = [];
  if (process.env.QA_SKIP_SWEEP !== "1") {
    const routes = routeList();
    stdout(`routes: ${routes.length}, widths: ${WIDTHS.join(",")}`);
    const queue = [...WIDTHS];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const w = queue.shift();
        await sweepWidth(browser, w, routes, results);
      }
    });
    await Promise.all(workers);
    await fs.writeFile(path.join(SHOTS, "responsive-sweep.json"), JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, widths: WIDTHS, durationMs: Date.now() - started, results }, null, 2));
    await writeResponsiveReport(results);
    if (process.env.QA_SKIP_AXE !== "1") await writeAxeSummary(results);
  }
  if (process.env.QA_SKIP_KEYBOARD !== "1") {
    const list = [];
    for (const [slug, url, authed] of [
      ["en-home", `${BASE_URL}/en`, false],
      ["en-pricing", `${BASE_URL}/en/pricing`, false],
      ["app-overview", `${BASE_URL}/app`, true],
    ]) {
      if (ONLY && !ONLY.test(slug)) continue;
      const k = await keyboardCheck(browser, slug, url, authed);
      await fs.mkdir(path.join(AXE_DIR, "keyboard"), { recursive: true });
      await fs.writeFile(path.join(AXE_DIR, "keyboard", `${slug}.json`), JSON.stringify(k, null, 2));
      stdout(`[keyboard] ${slug}: ${k.summary.focusedElements} focused, ${k.summary.withoutVisibleIndicator} without visible indicator`);
      list.push(k);
    }
    if (list.length) await writeKeyboardReport(list);
  }
  await browser.close();
  stdout(`done in ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
