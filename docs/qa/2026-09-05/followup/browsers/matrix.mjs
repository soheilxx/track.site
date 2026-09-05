// Builds the Markdown tables of summary.md from the raw artifacts of the cross-browser matrix (no numbers typed by hand).
// Usage: node docs/qa/2026-09-05/followup/browsers/matrix.mjs   (from the repo root; prints Markdown to stdout)
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const exists = (f) => fs.existsSync(path.join(DIR, f));
const json = (f) => JSON.parse(read(f));

const out = [];
const line = (s = "") => out.push(s);

// 1. functional runs (permanent config, `--project=<engine>`)
line("### Functional specs (marketing.spec.ts + app.spec.ts, `playwright.config.ts` projects)");
line();
line("| Engine | Project | Result | Duration | Log |");
line("| --- | --- | --- | --- | --- |");
for (const [engine, file, note] of [["chromium", "e2e-chromium.log", ""], ["webkit", "e2e-webkit-production-headers.log", " (production headers, see B1; 2 foreign E3 probe tests included in the totals)"], ["firefox", "e2e-firefox.log", ""]]) {
  if (!exists(file)) {
    line(`| ${engine} | \`${engine}\` | not run | — | — |`);
    continue;
  }
  const log = read(file);
  const passed = /(\d+) passed/.exec(log)?.[1] ?? "0";
  const failed = /(\d+) failed/.exec(log)?.[1] ?? "0";
  const skipped = /(\d+) skipped/.exec(log)?.[1] ?? "0";
  const duration = /passed \(([^)]+)\)|failed \(([^)]+)\)|\((\d+(?:\.\d+)?[sm])\)\s*$/m.exec(log);
  const exit = /exit=(\d+)/.exec(log)?.[1] ?? "?";
  const time = /\d+ (?:passed|failed)[^\n]*\((\d+(?:\.\d+)?(?:s|m))\)/.exec(log)?.[1] ?? "—";
  const launchErr = (log.match(/browserType\.launch: spawn UNKNOWN/g) ?? []).length;
  line(`| ${engine} | \`${engine}\` | ${passed} passed, ${failed} failed, ${skipped} skipped (exit ${exit})${launchErr ? `; ${launchErr} × \`browserType.launch: spawn UNKNOWN\`` : ""} | ${time} | \`${file}\` |`);
  void duration;
}
line();

// 1b. functional copies (temp config: marketing-xb/app-xb = HEAD specs + WebKit header hook)
line("### Functional specs as temporary copies of the HEAD files (`xb-func-*`, WebKit with the header-strip hook)");
line();
line("| Project | Tests | Passed | Failed | Skipped | Duration | Failed tests (first error line) |");
line("| --- | ---: | ---: | ---: | ---: | --- | --- |");
const summarize = (r, project) => {
  const rows = [];
  const walk = (suite) => {
    for (const s of suite.suites ?? []) walk(s);
    for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) if (t.projectName === project) rows.push({ title: spec.title, file: spec.file, line: spec.line, result: t.results?.[0] });
  };
  for (const s of r.suites ?? []) walk(s);
  return rows;
};
const firstLine = (res) => (res?.error?.message ?? "").replace(/\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "";
for (const p of ["xb-func-webkit", "xb-func-chromium"]) {
  const file = `runs/${p}/results.json`;
  if (!exists(file)) {
    line(`| ${p} | — | — | — | — | — | not run |`);
    continue;
  }
  const r = json(file);
  const rows = summarize(r, p);
  const passed = rows.filter((x) => x.result?.status === "passed").length;
  const failed = rows.filter((x) => x.result?.status === "failed" || x.result?.status === "timedOut").length;
  const skipped = rows.filter((x) => x.result?.status === "skipped").length;
  const dur = `${(r.stats.duration / 1000).toFixed(1)} s`;
  const failures = rows.filter((x) => x.result?.status === "failed" || x.result?.status === "timedOut").map((x) => `${path.basename(x.file)}:${x.line} "${x.title.slice(0, 70)}" — ${firstLine(x.result).slice(0, 110)}`);
  line(`| ${p} | ${rows.length} | ${passed} | ${failed} | ${skipped} | ${dur} | ${failures.length ? failures.join("<br>") : "—"} |`);
}
line();

// 2. visual comparison against the chromium baselines
line("### Visual spec (visual.spec.ts) against the committed Chromium baselines (`--update-snapshots=none`)");
line();
line("| Snapshot | visual-chromium (control) | visual-webkit | visual-firefox |");
line("| --- | --- | --- | --- |");
const visual = {};
for (const p of ["xb-visual-chromium", "xb-visual-webkit", "xb-visual-firefox"]) {
  const file = `runs/${p}/results.json`;
  if (!exists(file)) continue;
  const r = json(file);
  const walk = (suite) => {
    for (const s of suite.suites ?? []) walk(s);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.projectName !== p) continue;
        const res = t.results?.[0];
        const name = /^(.*?) at (\d+)px/.exec(spec.title);
        const key = name ? `${name[1]}-${name[2]}` : spec.title;
        const msg = res?.error?.message?.replace(/\[[0-9;]*m/g, "") ?? "";
        const ratio = /(\d+) pixels \(ratio ([0-9.]+) of all image pixels\)/.exec(msg);
        const size = /Expected an image (\d+px by \d+px), received (\d+px by \d+px)/.exec(msg);
        const launch = /browserType\.launch: spawn UNKNOWN/.test(msg);
        let cell;
        if (res?.status === "passed") cell = "pass";
        else if (launch) cell = "cannot launch";
        else if (ratio) cell = `mismatch ${ratio[2]} (${Number(ratio[1]).toLocaleString("en-US")} px)`;
        else if (size) cell = `size differs ${size[1]} vs ${size[2]}`;
        else cell = `${res?.status ?? "?"}: ${msg.split("\n")[0].slice(0, 80)}`;
        (visual[key] ??= {})[p] = cell;
      }
    }
  };
  for (const s of r.suites ?? []) walk(s);
}
for (const key of Object.keys(visual)) {
  line(`| \`${key}\` | ${visual[key]["xb-visual-chromium"] ?? "not run"} | ${visual[key]["xb-visual-webkit"] ?? "not run"} | ${visual[key]["xb-visual-firefox"] ?? "not run"} |`);
}
line();

// 3. Living AI Core matrix
line("### Living AI Core on /app (stored owner session, 1440 × 900)");
line();
line("| Engine | Case | WebGL2 strict / lenient | Tier | Canvas backing (CSS px) | Keyframes | Running anim. | Draws / rAF per 2 s | Console errors | Result |");
line("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
const lacResults = {};
for (const p of ["xb-lac-chromium", "xb-lac-webkit", "xb-lac-firefox"]) {
  const file = `runs/${p}/results.json`;
  if (exists(file)) {
    const r = json(file);
    const walk = (suite) => {
      for (const s of suite.suites ?? []) walk(s);
      for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) if (t.projectName === p) lacResults[`${p}|${spec.title}`] = t.results?.[0];
    };
    for (const s of r.suites ?? []) walk(s);
  }
}
const LAC_CASES = [
  ["default", "default motion: WebGL2 availability, the tier chosen and the draw rate"],
  ["reduced-motion", "prefers-reduced-motion: static tier, no frames, no canvas"],
  ["no-webgl2", "WebGL2 unavailable: silent css fallback, the chat stays usable"],
  ["context-lost", "lost WebGL context: css fallback without a chat interruption"],
  ["dark", "dark theme: same tier, no console errors"],
];
for (const p of ["xb-lac-chromium", "xb-lac-webkit", "xb-lac-firefox"]) {
  const engine = p.replace("xb-lac-", "");
  for (const [c, title] of LAC_CASES) {
    const file = `runs/${p}/lac/${p}--${c}.json`;
    const res = lacResults[`${p}|${title}`];
    const status = res ? res.status : "not run";
    if (!exists(file)) {
      const msg = res?.error?.message?.replace(/\[[0-9;]*m/g, "").split("\n")[0].slice(0, 60) ?? "";
      line(`| ${engine} | ${c} | — | — | — | — | — | — | — | ${status}${msg ? ` (${msg})` : ""} |`);
      continue;
    }
    const d = json(file);
    const pr = d.probe ?? {};
    const kf = pr.blobKeyframes ? [...new Set(pr.blobKeyframes)].join(", ") : "—";
    const canvas = pr.canvas ? `${pr.canvas.backing.join("×")} (${pr.canvas.css.join("×")}, opacity ${pr.canvas.opacity})` : "none";
    const counters = d.drawsPer2s !== undefined ? `${d.drawsPer2s} / ${d.rafPer2s}` : pr.counters ? `${pr.counters.draws} / ${pr.counters.frames} (total)` : "—";
    const errs = (d.consoleErrors ?? []).length === 0 ? "0" : `${d.consoleErrors.length}: ${d.consoleErrors.map((e) => e.slice(0, 70)).join("; ")}`;
    const note = d.applicable === false ? ` — ${d.reason}` : d.tierAfterLoss ? ` (tier after loss: ${d.tierAfterLoss})` : "";
    line(`| ${engine} | ${c}${d.probe?.theme ? ` (theme ${d.probe.theme})` : ""} | ${pr.webgl2StrictLowPower ?? "—"} / ${pr.webgl2Lenient ?? "—"} | ${pr.tier ?? "—"} (pref ${pr.pref ?? "—"}, state ${pr.state ?? "—"}) | ${canvas} | ${kf} | ${pr.runningAnimations ?? "—"} | ${counters} | ${errs} | ${status}${note} |`);
  }
}
line();

// 4. Mobile emulation
line("### Mobile emulation (Playwright devices)");
line();
line("| Device / engine | Page | innerWidth × innerHeight (DPR) | scrollWidth / clientWidth | Elements wider than the viewport | axe serious/critical | axe other (impact: rule (nodes)) | Composer bottom / sheet height vs innerHeight | Console errors | Result |");
line("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
const mobileResults = {};
for (const p of ["xb-mobile-webkit-iphone14", "xb-mobile-chromium-pixel7"]) {
  const file = `runs/${p}/results.json`;
  if (exists(file)) {
    const r = json(file);
    const walk = (suite) => {
      for (const s of suite.suites ?? []) walk(s);
      for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) if (t.projectName === p) mobileResults[`${p}|${spec.title.split(":")[0]}`] = t.results?.[0];
    };
    for (const s of r.suites ?? []) walk(s);
  }
}
for (const p of ["xb-mobile-webkit-iphone14", "xb-mobile-chromium-pixel7"]) {
  for (const [page, route] of [
    ["home", "/en"],
    ["pricing", "/en/pricing"],
    ["app-closed", "/app"],
    ["app-sheet-open", "/app"],
  ]) {
    const file = `runs/${p}/mobile/${p}--${page}.json`;
    const res = mobileResults[`${p}|${route}`];
    const status = res ? res.status : "not run";
    if (!exists(file)) {
      const msg = res?.error?.message?.replace(/\[[0-9;]*m/g, "").split("\n")[0].slice(0, 60) ?? "";
      line(`| ${p} | ${page} | — | — | — | — | — | — | — | ${status}${msg ? ` (${msg})` : ""} |`);
      continue;
    }
    const d = json(file);
    const m = d.measure;
    const a = d.axe;
    const wide = m.wideElements.length === 0 ? "0" : `${m.wideElements.length}: ${m.wideElements.slice(0, 3).join("; ")}`;
    const others = a.rules.length ? a.rules.join(", ") : "0";
    const composer = d.composer ? `${Math.round(d.composer.bottom)} / ${Math.round(d.sheet.height)} vs ${m.innerHeight}` : "—";
    const errs = (d.consoleErrors ?? []).length === 0 ? "0" : `${d.consoleErrors.length}: ${d.consoleErrors.map((e) => e.slice(0, 70)).join("; ")}`;
    line(`| ${p} | ${page} (${route}) | ${m.innerWidth} × ${m.innerHeight} (${m.dpr}) | ${m.scrollWidth} / ${m.clientWidth} | ${wide} | ${a.serious.length === 0 ? "0" : a.serious.join("; ")} | ${others} | ${composer} | ${errs} | ${status} |`);
  }
}
line();
process.stdout.write(out.join("\n") + "\n");
