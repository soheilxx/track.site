#!/usr/bin/env node
/**
 * Renders docs/qa/<date>/followup/living-core/summary.md from the JSON artifacts written by
 * living-core-budget.mjs (motion-off.json, longtasks-*.json, soak.json, tier-*.json),
 * living-core-webgl-probe.mjs (webgl-probe.json) and living-core-lighthouse.mjs
 * (lighthouse/summary.json). Every number in the generated sections is read from those files;
 * the hand-written analysis (summary-notes.md in the same directory) is appended verbatim.
 *
 * Usage (from apps/web): node scripts/qa/living-core-report.mjs --dir ../../docs/qa/2026-09-05/followup/living-core
 */
import fs from "node:fs";
import path from "node:path";

const dirIdx = process.argv.indexOf("--dir");
const dir = path.resolve(dirIdx > 0 ? process.argv[dirIdx + 1] : ".");
const read = (name) => (fs.existsSync(path.join(dir, name)) ? JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) : null);
const fmt = (v, d = 1) => (v == null ? "n/a" : typeof v === "number" ? (Number.isInteger(v) && d === 0 ? String(v) : v.toFixed(d)) : String(v));
const ms = (v) => (v == null ? "n/a" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const sign = (v, d = 0) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);
const yes = (b) => (b == null ? "n/a" : b ? "yes" : "no");
const L = [];
const p = (s = "") => L.push(s);
const serverLog = fs.readdirSync(dir).find((f) => /^server-\d+\.log$/.test(f)) ?? null;
const serverPort = serverLog ? serverLog.match(/\d+/)[0] : "?";
const PHASES = { idle: "idle, no input", scroll: (ph) => `scrolling the main area (${ph.wheelEvents} wheel events)`, type: (ph) => `typing in the composer (${ph.charactersTyped} chars)`, interact: (ph) => `scroll + type (${ph.wheelEvents} wheel events, ${ph.charactersTyped} chars)` };
const phasesOf = (r) => Object.keys(PHASES).filter((k) => r[k]);

p("# Living AI Core — budget evidence (docs/15 §4, supplement §9 acceptance criteria)");
p();
p(`Generated ${new Date().toISOString()} by \`apps/web/scripts/qa/living-core-report.mjs\` from the artifacts in this directory; the analysis at the end is \`summary-notes.md\`, appended verbatim. Every number in the generated sections comes from the named JSON/CSV file. Browser for every check: the chromium headless shell of Playwright's \`chromium\` project (path in each JSON's \`shell\`), stored owner session \`apps/web/e2e/.auth/owner.json\`, production build served on port ${serverPort} (\`${serverLog ?? "server log missing"}\`).`);
p();

// ---- WebGL probe
const probe = read("webgl-probe.json");
p("## 0. Which tier the headless shell can run (`webgl-probe.json`)");
p();
if (probe) {
  p("`createWebglRenderer` refuses a software-only context (`failIfMajorPerformanceCaveat: true`); the probe creates a WebGL2 context with the core's own attributes under several Chrome flag sets and reports the renderer string the browser exposes (QA record only, the app never reads it).");
  p();
  p("| Chrome flags | Strict WebGL2 context (core attributes) | Renderer |");
  p("| --- | --- | --- |");
  for (const r of probe.results) p(`| \`${r.args.join(" ") || "(none)"}\` | ${r.ok ? yes(r.strictWebgl2) : `launch failed: ${r.error}`} | ${r.renderer ?? "—"} |`);
  p();
} else p("not run");

// ---- tier checks
const tierFiles = fs.readdirSync(dir).filter((f) => /^tier-.*\.json$/.test(f)).sort();
if (tierFiles.length) {
  p("## Tier selection under viewport emulation (`tier-*.json`)");
  p();
  p("| Label | Viewport (CSS px @ DPR) | Mobile/touch emulation | Panel mounted | Tier | Pref | Canvas | Coarse pointer |");
  p("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const f of tierFiles) {
    const t = read(f);
    p(`| ${t.label} | ${t.core.viewport.w}×${t.core.viewport.h} @ ${t.core.viewport.dpr} | ${yes(t.mobile)} | ${yes(t.panelVisible)} | ${t.core.tier ?? "core not mounted"} | ${t.core.pref ?? "—"} | ${yes(t.core.canvas)} | ${yes(t.core.coarse)} |`);
  }
  p();
}

// ---- (a) long tasks
const ltFiles = fs.readdirSync(dir).filter((f) => /^longtasks-.*\.json$/.test(f) && !/trace-summary/.test(f)).sort();
p("## (a) Idle long tasks with the panel open on /app, WebGL tier (`longtasks-<label>.json`)");
p();
if (ltFiles.length) {
  p("`PerformanceObserver({ type: \"longtask\", buffered: true })` installed before any application script; a long task is an entry > 50 ms. Attribution: the entry's own `attribution` (Chrome only names the container) plus the child events of every main-thread task ≥ 50 ms in a Chrome trace recorded during the same window (`devtools.timeline`, `v8.execute`), and the core's own frame cost from a `requestAnimationFrame` wrapper that times every callback.");
  p();
  p("| Run | GL backend | Tier | Phase | Window | rAF callbacks (per s) | Callback p50 / p95 / p99 / max | Callbacks > 16 ms / > 50 ms | Long tasks > 50 ms | Longest |");
  p("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const f of ltFiles) {
    const r = read(f);
    let prevTier = r.core.idleStart?.tier ?? "?";
    for (const phase of phasesOf(r)) {
      const ph = r[phase];
      const endTier = r.core[`${phase}End`]?.tier ?? "?";
      const tier = `${prevTier} → ${endTier}`;
      prevTier = endTier;
      const desc = typeof PHASES[phase] === "function" ? PHASES[phase](ph) : PHASES[phase];
      p(`| ${r.label} | ${r.gl} | ${tier} | ${desc} | ${ph.seconds} s | ${ph.raf.fired} (${ph.rafPerSecond}) | ${fmt(ph.raf.p50, 2)} / ${fmt(ph.raf.p95, 2)} / ${fmt(ph.raf.p99, 2)} / ${fmt(ph.raf.max, 2)} ms | ${ph.raf.over16ms} / ${ph.raf.over50ms} | **${ph.longTasks.count}** | ${ph.longTasks.count ? `${ph.longTasks.maxMs.toFixed(1)} ms` : "—"} |`);
    }
  }
  p();
  for (const f of ltFiles) {
    const r = read(f);
    p(`### ${r.label}: every long task > 50 ms (\`${f}\`)`);
    p();
    let any = false;
    for (const phase of phasesOf(r)) {
      const ph = r[phase];
      for (const t of ph.longTasks.tasks) {
        any = true;
        p(`- ${phase} +${(t.startMs / 1000).toFixed(1)} s: **${t.durationMs} ms**, PerformanceObserver attribution: ${t.attribution.map((a) => `${a.name}/${a.containerType}${a.containerSrc ? ` ${a.containerSrc}` : ""}${a.containerName ? ` ${a.containerName}` : ""}`).join("; ") || "none"}`);
      }
    }
    if (!any) p("- none (PerformanceObserver recorded no `longtask` entry in either window)");
    p();
    if (r.traceAttribution) {
      p(`Chrome trace (${(r.traceBytes / 1048576).toFixed(1)} MB, ${r.traceAttribution.eventCount} events, kept outside the pack — see notes): main-thread tasks ≥ 50 ms with their child events:`);
      p();
      if (!r.traceAttribution.tasksOver50ms.length) p("- none");
      for (const t of r.traceAttribution.tasksOver50ms) {
        p(`- trace +${(t.startMs / 1000).toFixed(1)} s: **${t.durationMs} ms** — ${t.children.map((c) => `${c.name} ${c.ms} ms×${c.count}`).join("; ") || "no child events"}`);
      }
      p();
    } else if (r.traceAttributionError) p(`Trace attribution failed: ${r.traceAttributionError}`);
    p(`rAF callers during the last interaction phase (wrapper caller key → callbacks requested): ${Object.entries((r.type ?? r.interact)?.raf.byCaller ?? {}).map(([k, v]) => `\`${k}\` ${v}`).join(", ") || "n/a"}.`);
    p();
    p(`State/tier transitions during the run: ${phasesOf(r).flatMap((k) => r[k].transitions ?? []).filter((t) => t.attr !== "data-pref").map((t) => `${t.source}.${t.attr}=${t.value}@${(t.t / 1000).toFixed(1)}s`).join(", ")}.`);
    p();
  }
} else p("not run");

// ---- (b) soak
const soak = read("soak.json");
p("## (b) 30-minute soak with state changes every 20 s (`soak.json`, `soak-samples.csv`)");
p();
if (soak) {
  p(`Run: ${soak.startedAt} → ${soak.finishedAt}, ${soak.actualMinutes} min (planned ${soak.plannedMinutes}), GL backend ${soak.gl}, tier after load \`${soak.tierAfterLoad}\`, tiers seen during the run: ${soak.tierValues.map((t) => `\`${t}\``).join(", ")}. Interactions: ${soak.steps.length} steps (${soak.steps.filter((s) => !s.ok).length} failed), provider stub answered ${soak.stub.length} turns (${soak.stub.filter((s) => s.scenario === "success").length} success streams, ${soak.stub.filter((s) => s.scenario === "blocked").length} failed runs). Motion states entered (\`data-ai-state\` writes): ${Object.entries(soak.stateCounts).map(([k, v]) => `${k} ×${v}`).join(", ")}. Transcript ${soak.messagesAtStart} → ${soak.finalCore.messages} messages. Long tasks > 50 ms during the whole soak: ${soak.longTasks.length}.`);
  p();
  p("Samples (CDP `Performance.getMetrics` + `Runtime.getHeapUsage`, in-page counters); `gc` rows follow a `HeapProfiler.collectGarbage`. Full series every 60 s in `soak-samples.csv`; the table lists the start, every 5th minute, the GC rows and the end.");
  p();
  p("| Sample | t | State | Tier | Msgs | JS heap used (Chrome) MB | JS heap used (Runtime) MB | Heap total MB | Nodes (Chrome) | DOM nodes (page) | JSEventListeners (Chrome) | Listeners net (page ledger) | Docs / Frames | Canvas els | WebGL2 ctx created / lost | IO / RO / MO created−disconnected | rAF fired | rAF p95 / max ms |");
  p("| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | ---: | --- |");
  for (const s of soak.samples) {
    const show = s.gc || s.tag === "start" || s.tag === "end" || s.minute % 5 === 0;
    if (!show) continue;
    p(`| ${s.tag} | ${s.elapsedS} s | ${s.aiState} | ${s.tier} | ${s.messages} | ${s.jsHeapUsedMB} | ${s.runtimeHeapUsedMB} | ${s.jsHeapTotalMB} | ${s.nodesChrome} | ${s.domNodesPage} | ${s.jsEventListenersChrome} | ${s.listenersNetPage} | ${s.documents} / ${s.frames} | ${s.canvasElements} | ${s.webgl2ContextsCreated} / ${s.contextLost} | ${s.ioCreated - s.ioDisconnected} / ${s.roCreated - s.roDisconnected} / ${s.moCreated - s.moDisconnected} | ${s.rafFired} | ${fmt(s.rafP95ms, 2)} / ${fmt(s.rafMaxMs, 2)} |`);
  }
  p();
  const gcRows = soak.samples.filter((s) => s.gc);
  if (gcRows.length >= 2) {
    const first = gcRows[0];
    const last = gcRows[gcRows.length - 1];
    p(`GC'd heap ${first.tag} → ${last.tag}: ${first.jsHeapUsedMB} → ${last.jsHeapUsedMB} MB (${sign(last.jsHeapUsedMB - first.jsHeapUsedMB, 2)} MB, ${sign(((last.jsHeapUsedMB - first.jsHeapUsedMB) / first.jsHeapUsedMB) * 100, 1)} %); Chrome nodes ${first.nodesChrome} → ${last.nodesChrome} (${sign(last.nodesChrome - first.nodesChrome)}); JSEventListeners ${first.jsEventListenersChrome} → ${last.jsEventListenersChrome} (${sign(last.jsEventListenersChrome - first.jsEventListenersChrome)}); page listener ledger net ${first.listenersNetPage} → ${last.listenersNetPage}; canvas elements ${first.canvasElements} → ${last.canvasElements}; WebGL2 contexts created ${first.webgl2ContextsCreated} → ${last.webgl2ContextsCreated}, lost ${first.contextLost} → ${last.contextLost}; transcript ${first.messages} → ${last.messages} messages.`);
    p();
    const perGc = gcRows.map((s) => `${s.tag} ${s.jsHeapUsedMB} MB / ${s.nodesChrome} nodes / ${s.jsEventListenersChrome} listeners / ${s.messages} msgs`).join("; ");
    p(`GC'd samples in order: ${perGc}.`);
    p();
  }
  const byType = soak.samples[soak.samples.length - 1]?.listenersByType ?? {};
  const first = soak.samples[0]?.listenersByType ?? {};
  const grown = Object.entries(byType).map(([k, v]) => [k, v, first[k] ?? 0]).filter(([, v, f]) => v - f !== 0).sort((a, b) => b[1] - b[2] - (a[1] - a[2]));
  p(`Listener ledger by event type, start → end (only types that changed): ${grown.map(([k, v, f]) => `\`${k}\` ${f} → ${v}`).join(", ") || "none changed"}.`);
  p();
  p(`Sequence of motion states (from the panel's \`data-ai-state\`, first 40 writes): ${soak.transitions.filter((t) => t.attr === "data-ai-state").slice(0, 40).map((t) => `${t.value}@${(t.t / 1000).toFixed(0)}s`).join(" → ")}${soak.transitions.filter((t) => t.attr === "data-ai-state").length > 40 ? " → …" : ""}.`);
  p();
} else p("not run");

// ---- (c) lighthouse
const lh = read("lighthouse/summary.json");
p("## (c) Lighthouse mobile: static panel vs. animated panel (`lighthouse/summary.md`, raw reports in `lighthouse/`)");
p();
if (lh) {
  p("| Variant | Setting | Tier verified under the same emulation | Perf median (runs) | LCP | TBT | CLS | Speed Index | Main-thread work | Script boot-up |");
  p("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const g of Object.values(lh.groups)) {
    const t = lh.tiers[`${g.config}/${g.variant}`];
    const tierText = t ? (t.coreMounted ? `${t.tier} (pref ${t.pref}, canvas ${yes(t.canvas)})` : "core not mounted (panel closed)") : "not checked";
    p(`| ${g.variant} | ${g.config} | ${tierText} | **${g.median.perf ?? "n/a"}** (${g.runs.map((r) => r.perf ?? "err").join("/")}) | ${ms(g.median.lcp)} | ${ms(g.median.tbt)} | ${g.median.cls == null ? "n/a" : g.median.cls.toFixed(3)} | ${ms(g.median.si)} | ${ms(g.median.mainThreadMs)} | ${ms(g.median.bootupMs)} |`);
  }
  p();
  p("| Comparison (median) | Perf points | LCP | TBT | CLS | Target ≤ 3 points worse |");
  p("| --- | ---: | ---: | ---: | ---: | --- |");
  for (const [k, d] of Object.entries(lh.deltas)) p(`| ${k} | ${sign(d.perf)} | ${d.lcp == null ? "n/a" : `${sign(d.lcp)} ms`} | ${d.tbt == null ? "n/a" : `${sign(d.tbt)} ms`} | ${d.cls == null ? "n/a" : sign(d.cls, 3)} | ${d.withinThreePoints == null ? "n/a" : d.withinThreePoints ? "pass" : "FAIL"} |`);
  p();
} else p("not run");

// ---- (d) motion off / reduced
const mo = read("motion-off.json");
p("## (d) Reduced motion and setting `off`: no animation frames (`motion-off.json`)");
p();
if (mo) {
  const row = (label, w, core, raf, extra) => p(`| ${label} | ${w} ms | ${core.tier} | ${core.pref} | ${core.htmlMotion} | ${raf.requested} / ${raf.fired} | ${yes(core.canvas)} | ${core.coreAnimations} | ${core.coreKeyframes.join(", ")} | ${extra} |`);
  p("| Configuration | Window | `data-tier` | `data-pref` | `html[data-ai-motion]` | rAF requested / fired | canvas.lac-gl | Running animations inside `.lac` | `.lac-blob > i` animation-name | SSR |");
  p("| --- | ---: | --- | --- | --- | ---: | --- | ---: | --- | --- |");
  row("`prefers-reduced-motion: reduce`, setting `system`", mo.reducedMotion.windowMs, mo.reducedMotion.core, mo.reducedMotion.raf, `\`data-tier="static"\` in HTML: ${yes(mo.reducedMotion.ssrStaticTier)}, \`<canvas\`: ${yes(mo.reducedMotion.ssrHasCanvas)}, \`data-ai-motion\`: ${mo.reducedMotion.ssrMotionAttr}`);
  row("setting `off` (header control), same page", mo.off.windowMs, mo.off.coreAfterWindow, mo.off.raf, `webgl2 contexts created ${mo.off.canvasContexts.contexts.webgl2 ?? 0}, \`webglcontextlost\` after release ${mo.off.canvasContexts.lost}`);
  row("setting `off`, after reload (server-rendered preference)", mo.off.reload.windowMs, mo.off.reload.coreAfterWindow, mo.off.reload.raf, `\`data-tier="static"\` in HTML: ${yes(mo.off.ssrStaticTier)}, \`<canvas\`: ${yes(mo.off.ssrHasCanvas)}, \`data-ai-motion\`: ${mo.off.ssrMotionAttr}`);
  p();
  p(`Before the toggle the same page ran the \`${mo.off.tierBeforeToggle}\` tier (canvas ${yes(mo.off.coreBeforeToggle.canvas)}); the toggle switched it to \`${mo.off.tierAfterToggle}\` (transitions: ${mo.off.transitions.filter((t) => t.source === "core").map((t) => `${t.attr}=${t.value}@${t.t}ms`).join(", ")}). Restored at the end: \`data-ai-motion\`=${mo.restored.htmlMotion}, tier ${mo.restored.tier}. rAF callers in the windows: reduced ${JSON.stringify(mo.reducedMotion.raf.byCaller)}, off ${JSON.stringify(mo.off.raf.byCaller)}, off after reload ${JSON.stringify(mo.off.reload.raf.byCaller)}.`);
  p();
} else p("not run");

const notes = path.join(dir, "summary-notes.md");
const out = `${L.join("\n")}\n${fs.existsSync(notes) ? `\n${fs.readFileSync(notes, "utf8").trim()}\n` : ""}`;
fs.writeFileSync(path.join(dir, "summary.md"), out);
process.stdout.write(`summary.md written (${out.length} chars)\n`);
