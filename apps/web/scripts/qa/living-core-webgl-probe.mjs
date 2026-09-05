#!/usr/bin/env node
/**
 * Probes whether the headless shell that Playwright's `chromium` project uses can create a WebGL2
 * context under the Living AI Core's own attributes (`failIfMajorPerformanceCaveat: true`,
 * `powerPreference: "low-power"`), for a set of Chrome flag combinations. The core silently stays on
 * the CSS tier when the context is software-only, so the budget checks need to know which tier a
 * browser session on this machine actually runs. Nothing here reads renderer/GPU identifiers into
 * the app; the probe only reports the context creation result and the unmasked renderer string for
 * the QA record (it is a QA script, not application code).
 *
 * Usage (from apps/web): node scripts/qa/living-core-webgl-probe.mjs [--out file.json]
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";

/** The headless shell of Playwright's chromium project (the full chrome-win64 build cannot start on this machine, docs/qa/2026-09-05/README.md). */
export const SHELL = process.env.CHROME_PATH ?? "C:/Users/Soheil/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe";

const outIdx = process.argv.indexOf("--out");
const out = outIdx > 0 ? process.argv[outIdx + 1] : null;

const VARIANTS = [
  { id: "default", args: [] },
  { id: "angle-d3d11", args: ["--use-angle=d3d11"] },
  { id: "angle-d3d11-ignore-blocklist", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] },
  { id: "angle-gl", args: ["--use-angle=gl"] },
  { id: "enable-gpu-rasterization", args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist"] },
  { id: "swiftshader-unsafe", args: ["--enable-unsafe-swiftshader"] },
];

const PROBE = `(() => {
  const c = document.createElement("canvas");
  const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true };
  let strict = null, relaxed = null, renderer = null, vendor = null, err = null;
  try { strict = c.getContext("webgl2", attrs); } catch (e) { err = String(e); }
  try { relaxed = document.createElement("canvas").getContext("webgl2", { ...attrs, failIfMajorPerformanceCaveat: false }); } catch (e) { err = String(e); }
  const gl = strict || relaxed;
  if (gl) {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  }
  return { strictWebgl2: Boolean(strict), relaxedWebgl2: Boolean(relaxed), renderer, vendor, err, ua: navigator.userAgent };
})()`;

const results = [];
for (const v of VARIANTS) {
  const started = Date.now();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, executablePath: SHELL, args: v.args });
    const page = await browser.newPage();
    const r = await page.evaluate(PROBE);
    results.push({ ...v, ok: true, ...r, ms: Date.now() - started, executablePath: SHELL });
  } catch (e) {
    results.push({ ...v, ok: false, error: String(e).slice(0, 300), ms: Date.now() - started });
  } finally {
    await browser?.close();
  }
  const last = results[results.length - 1];
  process.stdout.write(`${v.id.padEnd(32)} ok=${last.ok} strict=${last.strictWebgl2 ?? "-"} relaxed=${last.relaxedWebgl2 ?? "-"} renderer=${last.renderer ?? last.error ?? "-"}\n`);
}
if (out) fs.writeFileSync(out, JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2));
