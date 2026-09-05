#!/usr/bin/env node
/**
 * Living AI Core budget evidence (docs/15-living-ai-core.md §4; owner supplement §9 "Verbindliche
 * Abnahmekriterien"). Drives the production build with Playwright (the chromium headless shell of
 * the `chromium` project, stored owner session) and records what the browser reports — nothing is
 * estimated. Modes:
 *
 *   longtasks  PerformanceObserver `longtask` entries (+ a Chrome trace for attribution) while the
 *              panel is open on /app on the WebGL tier: N s idle (no input), then N s of scrolling
 *              the main area and typing in the composer.
 *   soak       30 min on /app with the panel open; every 20 s a real interaction cycles the motion
 *              state (composer focus/blur, an in-scope message with the provider stubbed → working /
 *              streaming / success or blocked, a further message that resets the turn); every 60 s
 *              JS heap (CDP Runtime.getHeapUsage + Performance.getMetrics), DOM node count,
 *              listener count (Chrome's JSEventListeners + an in-page addEventListener ledger),
 *              canvases, WebGL contexts and observers are sampled; a GC'd sample is taken at fixed
 *              minutes.
 *   motion     reduced-motion (OS preference) and the per-user setting `off` (header control,
 *              persisted through the audited action, restored at the end): static tier attribute,
 *              requestAnimationFrame callbacks over 10 s (wrapper count with caller attribution),
 *              canvas presence, running CSS animations inside the core, SSR markup.
 *   tier       which tier the core selects under a given viewport emulation (used to state the
 *              tier of the Lighthouse runs, whose reports carry no DOM).
 *
 * Provider stub (soak): the only network the chat needs for a turn is `POST /api/ai/chat`; the
 * harness replaces `window.fetch` for exactly that request and answers with a synthetic stream of
 * the browser-facing contract events (`activity.started` → `activity.completed` →
 * `assistant.message` → `ui.final` → `done`, or `activity.started` → `activity.failed` → `done`)
 * with real timing. No request reaches the server or a model provider, nothing is persisted; the
 * server on the QA port additionally runs with a placeholder OPENAI_API_KEY so no provider call is
 * possible at all. Every state the core shows during the soak therefore traces back to a real
 * composer interaction and a contract event applied by the real store.
 *
 * Usage (from apps/web):
 *   node scripts/qa/living-core-budget.mjs --mode longtasks --base http://localhost:3012 --out <dir> [--gl d3d11|swiftshader] [--idle-s 120] [--interact-s 120] [--no-trace]
 *   node scripts/qa/living-core-budget.mjs --mode soak --base ... --out <dir> [--soak-min 30] [--sample-s 60] [--step-s 20]
 *   node scripts/qa/living-core-budget.mjs --mode motion --base ... --out <dir>
 *   node scripts/qa/living-core-budget.mjs --mode tier --base ... --out <dir> --viewport 1280x800 --mobile
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

/** The headless shell of Playwright's chromium project (the full chrome-win64 build cannot start on this machine, docs/qa/2026-09-05/README.md). */
export const SHELL = process.env.CHROME_PATH ?? "C:/Users/Soheil/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe";
const AUTH_FILE = path.resolve("e2e/.auth/owner.json");

function parseArgs(argv) {
  const a = { mode: "longtasks", base: "http://localhost:3012", out: null, gl: "d3d11", idleS: 120, interactS: 120, trace: true, soakMin: 30, sampleS: 60, stepS: 20, viewport: "1440x900", mobile: false, label: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--mode") a.mode = v();
    else if (k === "--base") a.base = v();
    else if (k === "--out") a.out = v();
    else if (k === "--gl") a.gl = v();
    else if (k === "--idle-s") a.idleS = Number(v());
    else if (k === "--interact-s") a.interactS = Number(v());
    else if (k === "--no-trace") a.trace = false;
    else if (k === "--soak-min") a.soakMin = Number(v());
    else if (k === "--sample-s") a.sampleS = Number(v());
    else if (k === "--step-s") a.stepS = Number(v());
    else if (k === "--viewport") a.viewport = v();
    else if (k === "--mobile") a.mobile = true;
    else if (k === "--label") a.label = v();
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.out) throw new Error("--out is required");
  return a;
}

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.out);
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, `${args.mode}${args.label ? `-${args.label}` : ""}.log`);
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(logFile, `${line}\n`);
  process.stdout.write(`${line}\n`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chromeArgs = args.gl === "d3d11" ? ["--use-angle=d3d11"] : [];

/**
 * In-page instrumentation installed before any application script runs:
 *  - requestAnimationFrame wrapper: requested / fired counts, callback durations, caller key;
 *  - addEventListener / removeEventListener ledger (net registrations per target kind and type);
 *  - HTMLCanvasElement.getContext wrapper (contexts created per kind) and webglcontextlost count;
 *  - IntersectionObserver / ResizeObserver / MutationObserver construction and disconnect counts;
 *  - PerformanceObserver for `longtask` (buffered);
 *  - provider stub for POST /api/ai/chat (streamed contract events, see the file header);
 *  - attribute log of the panel's data-ai-state and the core's data-state / data-tier (attached later).
 */
const INIT_SCRIPT = String.raw`(() => {
  const S = (window.__lac = {
    t0: performance.now(),
    raf: { requested: 0, fired: 0, durations: [], byCaller: {} },
    listeners: { added: 0, removed: 0, net: 0, byType: {}, byTarget: {} },
    canvas: { contexts: {}, lost: 0 },
    observers: { IntersectionObserver: { created: 0, disconnected: 0 }, ResizeObserver: { created: 0, disconnected: 0 }, MutationObserver: { created: 0, disconnected: 0 } },
    longTasks: [],
    transitions: [],
    stub: [],
    marks: [],
  });
  S.reset = () => {
    S.raf.requested = 0; S.raf.fired = 0; S.raf.durations = []; S.raf.byCaller = {};
    S.longTasks = [];
    S.marks.push({ t: performance.now(), name: "reset" });
  };
  const callerKey = () => {
    const stack = (new Error().stack || "").split("\n").slice(2, 5).map((l) => l.trim().replace(/^at\s+/, "").replace(/:\d+:\d+\)?$/, "").replace(/^.*?\(/, "").replace(/\?[^/]*$/, ""));
    return stack.join(" < ") || "unknown";
  };
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    S.raf.requested++;
    const key = callerKey();
    S.raf.byCaller[key] = (S.raf.byCaller[key] || 0) + 1;
    return origRaf(function (ts) {
      const a = performance.now();
      try { return cb(ts); } finally {
        const d = performance.now() - a;
        S.raf.fired++;
        if (S.raf.durations.length < 200000) S.raf.durations.push(Math.round(d * 1000) / 1000);
      }
    });
  };
  const kindOf = (t) => (t === window ? "window" : t === document ? "document" : t && t.nodeType === 1 ? "element:" + t.tagName.toLowerCase() : t && t.constructor ? t.constructor.name : "other");
  const ledger = new WeakMap();
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;
  const optKey = (o) => (typeof o === "boolean" ? o : o && o.capture ? true : false) ? "c" : "b";
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (fn) {
      let m = ledger.get(this);
      if (!m) { m = new Map(); ledger.set(this, m); }
      const key = type + "|" + optKey(opts);
      let set = m.get(key);
      if (!set) { set = new Set(); m.set(key, set); }
      if (!set.has(fn)) {
        set.add(fn);
        S.listeners.added++; S.listeners.net++;
        S.listeners.byType[type] = (S.listeners.byType[type] || 0) + 1;
        const k = kindOf(this); S.listeners.byTarget[k] = (S.listeners.byTarget[k] || 0) + 1;
        if (type === "webglcontextlost") { /* counted on dispatch below */ }
      }
    }
    return origAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    const m = ledger.get(this);
    const set = m && m.get(type + "|" + optKey(opts));
    if (set && set.has(fn)) {
      set.delete(fn);
      S.listeners.removed++; S.listeners.net--;
      S.listeners.byType[type] = (S.listeners.byType[type] || 0) - 1;
      const k = kindOf(this); S.listeners.byTarget[k] = (S.listeners.byTarget[k] || 0) - 1;
    }
    return origRemove.call(this, type, fn, opts);
  };
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, attrs) {
    const ctx = origGetContext.call(this, kind, attrs);
    const k = kind + (ctx ? "" : ":null");
    S.canvas.contexts[k] = (S.canvas.contexts[k] || 0) + 1;
    if (ctx && (kind === "webgl2" || kind === "webgl")) this.addEventListener("webglcontextlost", () => { S.canvas.lost++; });
    return ctx;
  };
  for (const name of ["IntersectionObserver", "ResizeObserver", "MutationObserver"]) {
    const Orig = window[name];
    if (!Orig) continue;
    const Wrapped = function (...a) { S.observers[name].created++; return new Orig(...a); };
    Wrapped.prototype = Orig.prototype;
    const origDisconnect = Orig.prototype.disconnect;
    Orig.prototype.disconnect = function () { S.observers[name].disconnected++; return origDisconnect.call(this); };
    window[name] = Wrapped;
  }
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        S.longTasks.push({ startTime: e.startTime, duration: e.duration, name: e.name, attribution: (e.attribution || []).map((a) => ({ name: a.name, containerType: a.containerType, containerName: a.containerName, containerId: a.containerId, containerSrc: a.containerSrc })) });
      }
    });
    po.observe({ type: "longtask", buffered: true });
  } catch (e) { S.longTaskObserverError = String(e); }

  // ---- provider stub: POST /api/ai/chat only ---------------------------------------------------
  const FINAL_UI = { message: "", intent: "status", stage: "installation", current_step: "installation", progress_percent: 40, status: "ok", cards: [], input_component: { type: "none" }, quick_actions: [], completed_steps: ["site"], missing_fields: [], warnings: [], requires_confirmation: false, confirmation_summary: null, tool_result_summary: null, next_best_action: null };
  let runCounter = 0;
  const origFetch = window.fetch;
  const frame = (id, ev) => "id: " + id + "\ndata: " + JSON.stringify(ev) + "\n\n";
  function stub(body) {
    const turnId = body.turnId;
    const text = String(body.message || "");
    const scenario = /domain/i.test(text) ? "blocked" : "success";
    const runId = "qa-run-" + (++runCounter);
    const script = scenario === "success"
      ? [
          [0, { type: "activity.started", turnId, runId, activity: "snippet_verification", sentence: "snippet_verification.started", params: {} }],
          [6000, { type: "activity.completed", turnId, runId, activity: "snippet_verification", sentence: "snippet_verification.completed", params: {} }],
          [6300, { type: "assistant.message", turnId, text: "The Track snippet is installed correctly." }],
          [7200, { type: "ui.final", turnId, ui: { ...FINAL_UI, message: "The Track snippet is installed correctly. Nothing changed in your draft." } }],
          [7300, { type: "done", turnId }],
        ]
      : [
          [0, { type: "activity.started", turnId, runId, activity: "domain_verification", sentence: "domain_verification.started", params: {} }],
          [5000, { type: "activity.failed", turnId, runId, activity: "domain_verification", sentence: "domain_verification.failed", params: { reason: "DOMAIN_NOT_VERIFIED" } }],
          [5200, { type: "done", turnId }],
        ];
    const enc = new TextEncoder();
    let seq = 0;
    const stream = new ReadableStream({
      start(controller) {
        for (const [at, ev] of script) {
          setTimeout(() => {
            try {
              controller.enqueue(enc.encode(frame(++seq, ev)));
              if (ev.type === "done") controller.close();
            } catch (e) { /* closed */ }
          }, at);
        }
      },
    });
    S.stub.push({ t: performance.now(), scenario, turnId, runId });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
  }
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "POST" && /\/api\/ai\/chat(\?|$)/.test(url) && init && typeof init.body === "string") {
        return Promise.resolve(stub(JSON.parse(init.body)));
      }
    } catch (e) { /* fall through to the real fetch */ }
    return origFetch.apply(this, arguments);
  };
})();`;

/** Attaches the attribute log to the panel container and the core (after the shell rendered). */
const ATTACH_SCRIPT = String.raw`(() => {
  const S = window.__lac;
  const panel = document.querySelector('[data-testid="assistant-panel"]');
  const core = document.querySelector('[data-testid="living-ai-core"]');
  const push = (source, attr, value) => S.transitions.push({ t: Math.round(performance.now()), source, attr, value });
  if (panel) push("panel", "data-ai-state", panel.getAttribute("data-ai-state"));
  if (core) for (const a of ["data-state", "data-tier", "data-pref"]) push("core", a, core.getAttribute(a));
  const obs = new MutationObserver((muts) => {
    for (const m of muts) push(m.target === panel ? "panel" : "core", m.attributeName, m.target.getAttribute(m.attributeName));
  });
  if (panel) obs.observe(panel, { attributes: true, attributeFilter: ["data-ai-state"] });
  if (core) obs.observe(core, { attributes: true, attributeFilter: ["data-state", "data-tier", "data-pref"] });
  S.attached = Boolean(panel && core);
  return S.attached;
})()`;

const READ_CORE = String.raw`(() => {
  const panel = document.querySelector('[data-testid="assistant-panel"]');
  const core = document.querySelector('[data-testid="living-ai-core"]');
  const html = document.documentElement;
  const anims = document.getAnimations().filter((a) => { const t = a.effect && a.effect.target; return t instanceof Element && t.closest(".lac") !== null; });
  return {
    aiState: panel ? panel.getAttribute("data-ai-state") : null,
    coreState: core ? core.getAttribute("data-state") : null,
    tier: core ? core.getAttribute("data-tier") : null,
    pref: core ? core.getAttribute("data-pref") : null,
    htmlMotion: html.getAttribute("data-ai-motion"),
    canvas: document.querySelector("canvas.lac-gl") !== null,
    coreAnimations: anims.length,
    coreKeyframes: Array.from(document.querySelectorAll(".lac-blob > i")).map((b) => getComputedStyle(b).animationName),
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    coarse: matchMedia("(pointer: coarse)").matches,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    messages: (() => { const l = document.querySelector('[data-testid="assistant-messages"]'); return l ? Number(l.getAttribute("data-total")) : null; })(),
    composerDisabled: (() => { const c = document.getElementById("track-ai-composer"); return c ? c.disabled : null; })(),
  };
})()`;

const READ_COUNTERS = String.raw`(() => {
  const S = window.__lac;
  const d = S.raf.durations;
  const sorted = d.slice().sort((a, b) => a - b);
  const q = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
  return {
    now: performance.now(),
    raf: { requested: S.raf.requested, fired: S.raf.fired, count: d.length, mean: d.length ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 1000) / 1000 : null, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: sorted.length ? sorted[sorted.length - 1] : null, over16ms: d.filter((x) => x > 16).length, over50ms: d.filter((x) => x > 50).length, byCaller: S.raf.byCaller },
    listeners: { added: S.listeners.added, removed: S.listeners.removed, net: S.listeners.net, byType: S.listeners.byType, byTarget: S.listeners.byTarget },
    canvas: S.canvas,
    observers: S.observers,
    longTasks: S.longTasks,
    longTaskObserverError: S.longTaskObserverError || null,
    stub: S.stub,
    transitions: S.transitions,
    domNodes: document.getElementsByTagName("*").length,
    canvasElements: document.getElementsByTagName("canvas").length,
    lacCanvas: document.querySelectorAll("canvas.lac-gl").length,
  };
})()`;

function parseViewport(spec) {
  const [w, h] = spec.split("x").map(Number);
  return { width: w, height: h };
}

async function openBrowser({ reducedMotion = "no-preference", viewport = parseViewport(args.viewport), mobile = false, dpr = 1 } = {}) {
  const browser = await chromium.launch({ headless: true, executablePath: SHELL, args: chromeArgs });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport,
    deviceScaleFactor: dpr,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    reducedMotion,
  });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
  return { browser, context, page };
}

async function gotoApp(page, pathname = "/app") {
  const res = await page.goto(new URL(pathname, args.base).toString(), { waitUntil: "load" });
  if (!res || !res.ok()) throw new Error(`GET ${pathname} -> ${res ? res.status() : "no response"}; is the stored session still valid?`);
  if (!page.url().includes("/app")) throw new Error(`redirected to ${page.url()} (stored session invalid?)`);
  await page.getByTestId("app-shell").waitFor({ state: "visible", timeout: 30000 });
}

async function waitForTier(page, expected, timeoutMs = 20000) {
  const core = page.getByTestId("living-ai-core");
  await core.waitFor({ state: "attached", timeout: timeoutMs });
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await core.getAttribute("data-tier");
    if (last === expected) return last;
    await sleep(250);
  }
  return last;
}

const summarizeLongTasks = (tasks, fromMs, toMs) => {
  const inWindow = tasks.filter((t) => t.startTime >= fromMs && t.startTime < toMs);
  return { count: inWindow.length, totalMs: Math.round(inWindow.reduce((a, t) => a + t.duration, 0)), maxMs: inWindow.length ? Math.max(...inWindow.map((t) => t.duration)) : 0, tasks: inWindow.map((t) => ({ startMs: Math.round(t.startTime - fromMs), durationMs: Math.round(t.duration * 10) / 10, attribution: t.attribution })) };
};

// ---------- trace attribution --------------------------------------------------------------------

/** Long main-thread tasks (≥ thresholdMs) of the page's renderer with their child events, from a Chrome trace file. */
function attributeLongTasksFromTrace(traceFile, thresholdMs = 50) {
  const json = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  const events = Array.isArray(json) ? json : json.traceEvents;
  const threads = new Map();
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") threads.set(`${e.pid}:${e.tid}`, e.args?.name);
  const mainThreads = new Set([...threads].filter(([, n]) => n === "CrRendererMain").map(([k]) => k));
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== "X" || typeof e.dur !== "number") continue;
    const k = `${e.pid}:${e.tid}`;
    if (!mainThreads.has(k)) continue;
    if (!byThread.has(k)) byThread.set(k, []);
    byThread.get(k).push(e);
  }
  const out = [];
  let firstTs = Infinity;
  for (const list of byThread.values()) for (const e of list) if (e.ts < firstTs) firstTs = e.ts;
  for (const [k, list] of byThread) {
    list.sort((a, b) => a.ts - b.ts);
    const tasks = list.filter((e) => (e.name === "ThreadControllerImpl::RunTask" || e.name === "RunTask" || e.name === "MessageLoop::RunTask") && e.dur >= thresholdMs * 1000);
    for (const t of tasks) {
      const end = t.ts + t.dur;
      const children = list.filter((e) => e !== t && e.ts >= t.ts && e.ts + e.dur <= end && e.name !== "ThreadControllerImpl::RunTask" && e.name !== "RunTask");
      const agg = new Map();
      for (const c of children) {
        const d = c.args?.data ?? {};
        const detail = [d.functionName, d.url && String(d.url).replace(/^.*\/_next\//, "_next/"), d.type, d.timerId != null ? `timer ${d.timerId}` : null, d.scriptName].filter(Boolean).join(" ");
        const key = `${c.name}${detail ? ` ${detail}` : ""}`;
        const cur = agg.get(key) ?? { name: key, count: 0, ms: 0 };
        cur.count++;
        cur.ms += c.dur / 1000;
        agg.set(key, cur);
      }
      out.push({ thread: k, startMs: Math.round((t.ts - firstTs) / 1000), durationMs: Math.round(t.dur / 100) / 10, children: [...agg.values()].sort((a, b) => b.ms - a.ms).slice(0, 12).map((c) => ({ ...c, ms: Math.round(c.ms * 10) / 10 })) });
    }
  }
  return { mainThreads: [...mainThreads], events: events.length, tasks: out.sort((a, b) => a.startMs - b.startMs) };
}

// ---------- modes ---------------------------------------------------------------------------------

async function runLongTasks() {
  const label = args.label ?? args.gl;
  const { browser, context, page } = await openBrowser();
  const result = { mode: "longtasks", label, gl: args.gl, chromeArgs, shell: SHELL, base: args.base, startedAt: new Date().toISOString(), idleSeconds: args.idleS, interactSeconds: args.interactS, trace: args.trace };
  const traceFile = args.trace ? path.join(process.env.LAC_TRACE_DIR ?? outDir, `longtasks-${label}.trace.json`) : null;
  try {
    await gotoApp(page);
    await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 20000 });
    const tier = await waitForTier(page, "webgl", 20000);
    result.tierAfterLoad = tier;
    if (tier !== "webgl") log(`WARNING: tier after load is ${tier}, not webgl`);
    await page.evaluate(ATTACH_SCRIPT);
    // settle: hydration, fonts, the deferred renderer import
    await sleep(5000);
    if (traceFile) await browser.startTracing(page, { path: traceFile, screenshots: false, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "blink.user_timing", "toplevel"] });
    // ---- phase 1: idle
    await page.evaluate("window.__lac.reset()");
    const idleFrom = await page.evaluate("performance.now()");
    result.core = { idleStart: await page.evaluate(READ_CORE) };
    log(`idle phase: ${args.idleS} s (tier ${result.core.idleStart.tier}, state ${result.core.idleStart.coreState})`);
    await sleep(args.idleS * 1000);
    const idleTo = await page.evaluate("performance.now()");
    const idleCounters = await page.evaluate(READ_COUNTERS);
    result.core.idleEnd = await page.evaluate(READ_CORE);
    result.idle = { fromMs: idleFrom, toMs: idleTo, seconds: Math.round((idleTo - idleFrom) / 100) / 10, raf: idleCounters.raf, rafPerSecond: Math.round((idleCounters.raf.fired / ((idleTo - idleFrom) / 1000)) * 10) / 10, longTasks: summarizeLongTasks(idleCounters.longTasks, idleFrom, idleTo), transitions: idleCounters.transitions };
    log(`idle: rAF fired ${idleCounters.raf.fired} (${result.idle.rafPerSecond}/s), callback p50 ${idleCounters.raf.p50} ms p95 ${idleCounters.raf.p95} ms max ${idleCounters.raf.max} ms; long tasks ${result.idle.longTasks.count}`);
    // ---- phase 2: scrolling the main area + typing in the composer
    await page.evaluate("window.__lac.reset()");
    const interactFrom = await page.evaluate("performance.now()");
    const main = page.getByTestId("app-main");
    const box = await main.boundingBox();
    const composer = page.locator("#track-ai-composer");
    const sentence = "Check whether the Track snippet is installed correctly on the shop and tell me what is still missing before publishing. ";
    let scrolls = 0;
    let typed = 0;
    const until = Date.now() + args.interactS * 1000;
    let dir = 1;
    while (Date.now() < until) {
      // ~1.5 s scrolling (wheel over the main area), then ~2 s typing in the composer, alternating
      for (let i = 0; i < 6 && Date.now() < until; i++) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 240 * dir);
        scrolls++;
        await sleep(220);
      }
      dir = -dir;
      if (Date.now() < until) {
        await composer.click();
        await composer.pressSequentially(sentence.slice(0, 60), { delay: 30 });
        typed += 60;
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await composer.blur();
      }
    }
    const interactTo = await page.evaluate("performance.now()");
    const interactCounters = await page.evaluate(READ_COUNTERS);
    result.core.interactEnd = await page.evaluate(READ_CORE);
    result.interact = { fromMs: interactFrom, toMs: interactTo, seconds: Math.round((interactTo - interactFrom) / 100) / 10, wheelEvents: scrolls, charactersTyped: typed, raf: interactCounters.raf, rafPerSecond: Math.round((interactCounters.raf.fired / ((interactTo - interactFrom) / 1000)) * 10) / 10, longTasks: summarizeLongTasks(interactCounters.longTasks, interactFrom, interactTo), transitions: interactCounters.transitions.filter((t) => t.t >= interactFrom) };
    log(`interact: ${scrolls} wheel events, ${typed} characters; rAF fired ${interactCounters.raf.fired} (${result.interact.rafPerSecond}/s), callback p95 ${interactCounters.raf.p95} ms max ${interactCounters.raf.max} ms; long tasks ${result.interact.longTasks.count}`);
    if (traceFile) {
      await browser.stopTracing();
      const stat = fs.statSync(traceFile);
      result.traceFile = traceFile;
      result.traceBytes = stat.size;
      try {
        const attributed = attributeLongTasksFromTrace(traceFile, 50);
        result.traceAttribution = { mainThreads: attributed.mainThreads, eventCount: attributed.events, tasksOver50ms: attributed.tasks };
        log(`trace: ${attributed.events} events, ${attributed.tasks.length} main-thread task(s) >= 50 ms`);
      } catch (e) {
        result.traceAttributionError = String(e).slice(0, 300);
        log(`trace attribution failed: ${String(e).slice(0, 200)}`);
      }
    }
    result.counters = { listeners: interactCounters.listeners, canvas: interactCounters.canvas, observers: interactCounters.observers, domNodes: interactCounters.domNodes, longTaskObserverError: interactCounters.longTaskObserverError };
  } finally {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, `longtasks-${label}.json`), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  }
  return result;
}

async function runSoak() {
  const { browser, context, page } = await openBrowser();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  const result = { mode: "soak", gl: args.gl, chromeArgs, shell: SHELL, base: args.base, startedAt: new Date().toISOString(), plannedMinutes: args.soakMin, sampleSeconds: args.sampleS, stepSeconds: args.stepS, samples: [], steps: [], stub: [], transitions: [] };
  const csvFile = path.join(outDir, "soak-samples.csv");
  const csvHeader = ["minute", "elapsedS", "gc", "aiState", "tier", "messages", "jsHeapUsedMB", "jsHeapTotalMB", "runtimeHeapUsedMB", "runtimeHeapTotalMB", "nodesChrome", "domNodesPage", "jsEventListenersChrome", "listenersNetPage", "listenersAdded", "listenersRemoved", "documents", "frames", "layoutObjects", "canvasElements", "lacCanvas", "webgl2ContextsCreated", "contextLost", "ioCreated", "ioDisconnected", "roCreated", "roDisconnected", "moCreated", "moDisconnected", "rafFired", "rafP95ms", "rafMaxMs", "longTasksTotal"];
  fs.writeFileSync(csvFile, `${csvHeader.join(",")}\n`);
  const sample = async (tag, gc) => {
    if (gc) await cdp.send("HeapProfiler.collectGarbage");
    const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const heap = await cdp.send("Runtime.getHeapUsage");
    const counters = await page.evaluate(READ_COUNTERS);
    const core = await page.evaluate(READ_CORE);
    const elapsedS = Math.round((Date.now() - startedMs) / 1000);
    const row = {
      minute: Math.round((elapsedS / 60) * 10) / 10,
      elapsedS,
      gc: gc ? 1 : 0,
      tag,
      aiState: core.aiState,
      tier: core.tier,
      messages: core.messages,
      jsHeapUsedMB: Math.round((metrics.JSHeapUsedSize / 1048576) * 100) / 100,
      jsHeapTotalMB: Math.round((metrics.JSHeapTotalSize / 1048576) * 100) / 100,
      runtimeHeapUsedMB: Math.round((heap.usedSize / 1048576) * 100) / 100,
      runtimeHeapTotalMB: Math.round((heap.totalSize / 1048576) * 100) / 100,
      nodesChrome: metrics.Nodes,
      domNodesPage: counters.domNodes,
      jsEventListenersChrome: metrics.JSEventListeners,
      listenersNetPage: counters.listeners.net,
      listenersAdded: counters.listeners.added,
      listenersRemoved: counters.listeners.removed,
      documents: metrics.Documents,
      frames: metrics.Frames,
      layoutObjects: metrics.LayoutObjects,
      canvasElements: counters.canvasElements,
      lacCanvas: counters.lacCanvas,
      webgl2ContextsCreated: counters.canvas.contexts.webgl2 ?? 0,
      contextLost: counters.canvas.lost,
      ioCreated: counters.observers.IntersectionObserver.created,
      ioDisconnected: counters.observers.IntersectionObserver.disconnected,
      roCreated: counters.observers.ResizeObserver.created,
      roDisconnected: counters.observers.ResizeObserver.disconnected,
      moCreated: counters.observers.MutationObserver.created,
      moDisconnected: counters.observers.MutationObserver.disconnected,
      rafFired: counters.raf.fired,
      rafP95ms: counters.raf.p95,
      rafMaxMs: counters.raf.max,
      longTasksTotal: counters.longTasks.length,
      layoutCount: metrics.LayoutCount,
      recalcStyleCount: metrics.RecalcStyleCount,
      listenersByType: counters.listeners.byType,
    };
    result.samples.push(row);
    fs.appendFileSync(csvFile, `${csvHeader.map((k) => (row[k] == null ? "" : row[k])).join(",")}\n`);
    log(`sample ${tag} t=${elapsedS}s gc=${gc ? 1 : 0} state=${row.aiState} tier=${row.tier} msgs=${row.messages} heapUsed=${row.jsHeapUsedMB}MB nodes=${row.nodesChrome} listeners(chrome)=${row.jsEventListenersChrome} net(page)=${row.listenersNetPage} canvas=${row.canvasElements} rafFired=${row.rafFired} longTasks=${row.longTasksTotal}`);
    return row;
  };
  const composer = page.locator("#track-ai-composer");
  const waitIdleComposer = async () => {
    await page.waitForFunction(() => { const c = document.getElementById("track-ai-composer"); return c && !c.disabled; }, null, { timeout: 30000 });
  };
  const STEPS = [
    { name: "focus composer (listening)", run: async () => { await composer.click(); } },
    { name: "blur composer (idle)", run: async () => { await composer.blur(); } },
    { name: "send in-scope message, stubbed success stream (working → streaming → success → idle)", run: async () => { await waitIdleComposer(); await composer.click(); await composer.pressSequentially("Check whether the Track snippet is installed correctly on the shop.", { delay: 15 }); await page.keyboard.press("Enter"); } },
    { name: "focus composer after the turn (listening)", run: async () => { await waitIdleComposer(); await composer.click(); } },
    { name: "send in-scope message, stubbed failed run (working → blocked)", run: async () => { await waitIdleComposer(); await composer.click(); await composer.pressSequentially("Verify the ownership of my domain now.", { delay: 15 }); await page.keyboard.press("Enter"); } },
    { name: "reset: send a further message, stubbed success stream (blocked cleared → working → success → idle)", run: async () => { await waitIdleComposer(); await composer.click(); await composer.pressSequentially("Run the snippet check again, please.", { delay: 15 }); await page.keyboard.press("Enter"); await sleep(9000); await composer.blur(); } },
  ];
  let startedMs = Date.now();
  try {
    await gotoApp(page);
    await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 20000 });
    const tier = await waitForTier(page, "webgl", 20000);
    result.tierAfterLoad = tier;
    if (tier !== "webgl") log(`WARNING: tier after load is ${tier}, not webgl`);
    await page.evaluate(ATTACH_SCRIPT);
    await sleep(5000);
    startedMs = Date.now();
    result.messagesAtStart = (await page.evaluate(READ_CORE)).messages;
    await sample("start", false);
    await sample("start-gc", true);
    const endMs = startedMs + args.soakMin * 60 * 1000;
    let nextSample = startedMs + args.sampleS * 1000;
    let nextStep = startedMs + args.stepS * 1000;
    let stepIndex = 0;
    const gcMinutes = new Set([10, 20, 30, 40, 50, 60].filter((m) => m <= args.soakMin));
    const gcDone = new Set();
    while (Date.now() < endMs) {
      const now = Date.now();
      if (now >= nextStep) {
        const step = STEPS[stepIndex % STEPS.length];
        const t = Math.round((now - startedMs) / 1000);
        try {
          await step.run();
          result.steps.push({ elapsedS: t, index: stepIndex, name: step.name, ok: true });
        } catch (e) {
          result.steps.push({ elapsedS: t, index: stepIndex, name: step.name, ok: false, error: String(e).slice(0, 200) });
          log(`step failed at ${t}s: ${step.name}: ${String(e).slice(0, 200)}`);
        }
        stepIndex++;
        nextStep += args.stepS * 1000;
      }
      if (Date.now() >= nextSample) {
        const minute = Math.round((nextSample - startedMs) / 60000);
        await sample(`m${minute}`, false);
        if (gcMinutes.has(minute) && !gcDone.has(minute)) {
          gcDone.add(minute);
          await sample(`m${minute}-gc`, true);
        }
        nextSample += args.sampleS * 1000;
      }
      await sleep(250);
    }
    await sleep(2000);
    await sample("end", false);
    await sample("end-gc", true);
    const counters = await page.evaluate(READ_COUNTERS);
    result.stub = counters.stub;
    result.transitions = counters.transitions;
    result.rafByCaller = counters.raf.byCaller;
    result.longTasks = counters.longTasks.map((t) => ({ startMs: Math.round(t.startTime), durationMs: Math.round(t.duration * 10) / 10, attribution: t.attribution }));
    result.finalCore = await page.evaluate(READ_CORE);
    result.stateCounts = counters.transitions.filter((t) => t.attr === "data-ai-state").reduce((acc, t) => { acc[t.value] = (acc[t.value] || 0) + 1; return acc; }, {});
    result.tierValues = [...new Set(counters.transitions.filter((t) => t.attr === "data-tier").map((t) => t.value))];
  } finally {
    result.finishedAt = new Date().toISOString();
    result.actualMinutes = Math.round(((Date.now() - startedMs) / 60000) * 10) / 10;
    fs.writeFileSync(path.join(outDir, "soak.json"), JSON.stringify(result, null, 2));
    await context.close();
    await browser.close();
  }
  return result;
}

async function runMotion() {
  const result = { mode: "motion", gl: args.gl, chromeArgs, shell: SHELL, base: args.base, startedAt: new Date().toISOString(), windowSeconds: 10 };
  // ---- A: prefers-reduced-motion: reduce with the setting `system`
  {
    const { browser, context, page } = await openBrowser({ reducedMotion: "reduce" });
    try {
      await gotoApp(page);
      await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 20000 });
      await page.getByTestId("living-ai-core").waitFor({ state: "attached" });
      await page.evaluate(ATTACH_SCRIPT);
      await sleep(4000); // hydration + the idle callback window in which a renderer would be requested
      const before = await page.evaluate(READ_CORE);
      await page.evaluate("window.__lac.reset()");
      const from = await page.evaluate("performance.now()");
      await sleep(10000);
      const to = await page.evaluate("performance.now()");
      const counters = await page.evaluate(READ_COUNTERS);
      const after = await page.evaluate(READ_CORE);
      const ssr = await (await page.request.get(new URL("/app", args.base).toString())).text();
      result.reducedMotion = { core: after, coreBeforeWindow: before, windowMs: Math.round(to - from), raf: counters.raf, canvasContexts: counters.canvas, transitions: counters.transitions, ssrStaticTier: ssr.includes('data-tier="static"'), ssrHasCanvas: ssr.includes("<canvas"), ssrMotionAttr: (ssr.match(/data-ai-motion="([a-z]+)"/) || [])[1] ?? null };
      log(`reduced-motion: tier=${after.tier} pref=${after.pref} rAF fired in ${Math.round(to - from)} ms: ${counters.raf.fired} (requested ${counters.raf.requested}), canvas=${after.canvas}, core animations=${after.coreAnimations}, keyframes=${JSON.stringify(after.coreKeyframes)}`);
    } finally {
      await context.close();
      await browser.close();
    }
  }
  // ---- B: setting `off` through the header control (persisted per user), restored to `system` afterwards
  {
    const { browser, context, page } = await openBrowser();
    try {
      await gotoApp(page);
      await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 20000 });
      const html = page.locator("html");
      if ((await html.getAttribute("data-ai-motion")) === "off") {
        log("preference was already off (left over from another run): turning it on first");
        await page.getByTestId("assistant-motion-toggle").click();
        await page.getByText("AI motion follows your system setting again.").waitFor({ state: "attached", timeout: 15000 });
      }
      const tierBefore = await waitForTier(page, "webgl", 20000);
      await page.evaluate(ATTACH_SCRIPT);
      const before = await page.evaluate(READ_CORE);
      await page.getByTestId("assistant-motion-toggle").click();
      await page.getByText("AI motion paused. Your setting is saved.").waitFor({ state: "attached", timeout: 15000 });
      const tierOff = await waitForTier(page, "static", 10000);
      await sleep(1500); // the canvas is released with the engine effect; give the DOM a moment
      const atOff = await page.evaluate(READ_CORE);
      await page.evaluate("window.__lac.reset()");
      const from = await page.evaluate("performance.now()");
      await sleep(10000);
      const to = await page.evaluate("performance.now()");
      const counters = await page.evaluate(READ_COUNTERS);
      const after = await page.evaluate(READ_CORE);
      // reload: the server renders the persisted preference
      await page.reload({ waitUntil: "load" });
      await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 20000 });
      await sleep(4000);
      const afterReload = await page.evaluate(READ_CORE);
      const ssr = await (await page.request.get(new URL("/app", args.base).toString())).text();
      // second 10 s window on the reloaded page (the state that a returning user gets)
      await page.evaluate(ATTACH_SCRIPT);
      await page.evaluate("window.__lac.reset()");
      const from2 = await page.evaluate("performance.now()");
      await sleep(10000);
      const to2 = await page.evaluate("performance.now()");
      const counters2 = await page.evaluate(READ_COUNTERS);
      const after2 = await page.evaluate(READ_CORE);
      result.off = { tierBeforeToggle: tierBefore, coreBeforeToggle: before, tierAfterToggle: tierOff, coreAtOff: atOff, windowMs: Math.round(to - from), raf: counters.raf, canvasContexts: counters.canvas, transitions: counters.transitions, coreAfterWindow: after, reload: { core: afterReload, windowMs: Math.round(to2 - from2), raf: counters2.raf, coreAfterWindow: after2 }, ssrStaticTier: ssr.includes('data-tier="static"'), ssrHasCanvas: ssr.includes("<canvas"), ssrMotionAttr: (ssr.match(/data-ai-motion="([a-z]+)"/) || [])[1] ?? null };
      log(`off: tier ${tierBefore} -> ${tierOff}; rAF fired in ${Math.round(to - from)} ms: ${counters.raf.fired} (requested ${counters.raf.requested}); after reload tier=${afterReload.tier} pref=${afterReload.pref} rAF fired in ${Math.round(to2 - from2)} ms: ${counters2.raf.fired}; canvas=${after2.canvas}; ssr static=${result.off.ssrStaticTier}`);
      // restore: the same control turns the motion on again (system default)
      await page.getByTestId("assistant-motion-toggle").click();
      await page.getByText("AI motion follows your system setting again.").waitFor({ state: "attached", timeout: 15000 });
      const tierRestored = await waitForTier(page, "webgl", 20000);
      result.restored = { htmlMotion: await html.getAttribute("data-ai-motion"), tier: tierRestored };
      log(`restored: data-ai-motion=${result.restored.htmlMotion}, tier=${tierRestored}`);
    } finally {
      await context.close();
      await browser.close();
    }
  }
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "motion-off.json"), JSON.stringify(result, null, 2));
  return result;
}

async function runTier() {
  const viewport = parseViewport(args.viewport);
  const { browser, context, page } = await openBrowser({ viewport, mobile: args.mobile, dpr: args.mobile ? 2 : 1 });
  const label = args.label ?? `${args.viewport}${args.mobile ? "-mobile" : ""}`;
  const result = { mode: "tier", label, viewport, mobile: args.mobile, gl: args.gl, chromeArgs, base: args.base, startedAt: new Date().toISOString() };
  try {
    await gotoApp(page);
    await sleep(6000);
    result.core = await page.evaluate(READ_CORE);
    result.panelVisible = await page.getByTestId("assistant-panel").isVisible().catch(() => false);
    result.launcherVisible = await page.getByTestId("assistant-fab").isVisible().catch(() => false);
    log(`tier ${label}: panel=${result.panelVisible} core tier=${result.core.tier} pref=${result.core.pref} canvas=${result.core.canvas} coarse=${result.core.coarse} viewport=${JSON.stringify(result.core.viewport)}`);
  } finally {
    await context.close();
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, `tier-${label}.json`), JSON.stringify(result, null, 2));
  return result;
}

const modes = { longtasks: runLongTasks, soak: runSoak, motion: runMotion, tier: runTier };
if (!modes[args.mode]) throw new Error(`unknown mode ${args.mode}`);
log(`living-core-budget ${args.mode}: base=${args.base} gl=${args.gl} shell=${SHELL}`);
await modes[args.mode]();
log("done");
