// Prints the main-frame timeline of a Lighthouse trace: paint marks, load marks, screenshots, timers,
// long function calls, style/layout work, between navigation start and the first contentful paint.
import fs from "node:fs";
const trace = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const events = trace.traceEvents ?? trace;
const nav = events.filter((e) => e.name === "navigationStart" && e.args?.data?.documentLoaderURL && !e.args.data.documentLoaderURL.startsWith("about:")).sort((a, b) => a.ts - b.ts).at(-1);
const t0 = nav.ts;
const frame = nav.args.frame;
const rel = (e) => ((e.ts - t0) / 1000).toFixed(1);
console.log("navigationStart", nav.args.data.documentLoaderURL, "frame", frame);
const marks = ["firstPaint", "firstContentfulPaint", "firstImagePaint", "largestContentfulPaint::Candidate", "largestContentfulPaint::Invalidate", "loadEventEnd", "domContentLoadedEventEnd", "MarkLoad", "MarkDOMContent", "firstMeaningfulPaint", "domComplete", "commitNavigationEnd", "CommitLoad"];
for (const e of events.filter((e) => marks.includes(e.name) && e.ts >= t0 && (!e.args?.frame || e.args.frame === frame)).sort((a, b) => a.ts - b.ts)) {
  console.log(`  ${rel(e).padStart(8)} ms  ${e.name}${e.args?.data?.size ? ` size=${e.args.data.size}` : ""}${e.args?.data?.type ? ` type=${e.args.data.type}` : ""}${e.args?.data?.nodeName ? ` node=${e.args.data.nodeName}` : ""}`);
}
const shots = events.filter((e) => e.name === "Screenshot" && e.ts >= t0).sort((a, b) => a.ts - b.ts);
console.log("screenshots:", shots.length, "first at", shots[0] ? rel(shots[0]) : "-", "ms; sizes:", shots.slice(0, 8).map((s) => `${rel(s)}ms=${s.args.snapshot.length}B`).join(" "));
const fcp = events.find((e) => e.name === "firstContentfulPaint" && e.ts >= t0 && e.args?.frame === frame);
const fcpTs = fcp ? fcp.ts : t0 + 3_000_000;
// timers
for (const e of events.filter((e) => (e.name === "TimerInstall" || e.name === "TimerFire") && e.ts >= t0 && e.ts <= fcpTs + 100_000).sort((a, b) => a.ts - b.ts)) {
  if (e.name === "TimerInstall" && (e.args?.data?.timeout ?? 0) < 200) continue;
  console.log(`  ${rel(e).padStart(8)} ms  ${e.name} timeout=${e.args?.data?.timeout ?? ""} id=${e.args?.data?.timerId ?? ""} dur=${e.dur ? (e.dur / 1000).toFixed(1) : ""}`);
}
// long tasks / function calls / evaluate script before FCP
const heavy = events.filter((e) => ["RunTask", "FunctionCall", "EvaluateScript", "ParseHTML", "Layout", "UpdateLayoutTree", "Paint", "v8.compile", "ResourceReceiveResponse"].includes(e.name) && e.ts >= t0 && e.ts <= fcpTs && (e.dur ?? 0) >= 15_000).sort((a, b) => a.ts - b.ts);
for (const e of heavy) console.log(`  ${rel(e).padStart(8)} ms  ${e.name} dur=${(e.dur / 1000).toFixed(1)} ${e.args?.data?.url ?? e.args?.data?.functionName ?? ""}`);
// paints/layouts timeline count in 250ms buckets until FCP
const paints = events.filter((e) => ["Paint", "Layout", "UpdateLayoutTree", "PrePaint", "Commit", "DrawFrame", "BeginMainThreadFrame", "NeedsBeginFrameChanged", "RequestMainThreadFrame", "ActivateLayerTree"].includes(e.name) && e.ts >= t0 && e.ts <= fcpTs + 50_000);
const buckets = {};
for (const e of paints) {
  const b = Math.floor((e.ts - t0) / 250_000) * 250;
  buckets[b] ??= {};
  buckets[b][e.name] = (buckets[b][e.name] ?? 0) + 1;
}
console.log("frame/paint events per 250 ms bucket until FCP:");
for (const [b, v] of Object.entries(buckets)) console.log(`  ${String(b).padStart(6)} ms: ${JSON.stringify(v)}`);
const fontEvents = events.filter((e) => /Font/i.test(e.name) && e.ts >= t0 && e.ts <= fcpTs + 50_000);
console.log("font-related events:", [...new Set(fontEvents.map((e) => e.name))].join(", "), fontEvents.slice(0, 5).map((e) => `${rel(e)}ms ${e.name}`).join(" | "));
