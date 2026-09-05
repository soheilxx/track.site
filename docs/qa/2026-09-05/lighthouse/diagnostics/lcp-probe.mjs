// Records every LCP candidate (PerformanceObserver, buffered), layout shifts, long tasks, font and script
// resource timings for a page, unthrottled and with CDP throttling similar to Lighthouse mobile
// (CPU 4x, 150 ms RTT, 1.6 Mbps). Purpose: explain the "element render delay" Lighthouse reports.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/Soheil/Downloads/track.site/apps/web/package.json");
const { chromium } = require("@playwright/test");

const base = "http://localhost:3002";
const pages = (process.argv[3] ?? "/en,/en/pricing,/en/tracking-knowledge,/en/tracking-knowledge/consent-mode-v2-guide,/en/integrations,/en/login,/de").split(",");
const initScript = `
  window.__probe = { lcp: [], cls: [], longtasks: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const el = e.element;
      window.__probe.lcp.push({
        startTime: Math.round(e.startTime), renderTime: Math.round(e.renderTime), loadTime: Math.round(e.loadTime), size: e.size, url: e.url || null,
        tag: el ? el.tagName : null, cls: el ? (el.getAttribute('class') || '').slice(0, 80) : null, text: el ? (el.textContent || '').trim().slice(0, 60) : null,
        font: el ? getComputedStyle(el).fontFamily.slice(0, 60) : null,
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__probe.cls.push({ startTime: Math.round(e.startTime), value: +e.value.toFixed(4), sources: (e.sources || []).map((s) => s.node ? (s.node.tagName + '.' + ((s.node.className && s.node.className.baseVal !== undefined ? s.node.className.baseVal : s.node.className) || '').toString().slice(0, 40)) : '?') });
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__probe.longtasks.push({ startTime: Math.round(e.startTime), duration: Math.round(e.duration) });
  }).observe({ type: 'longtask', buffered: true });
`;

async function probe(browser, path, throttle) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (throttle) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  await page.addInitScript(initScript);
  await page.goto(base + path, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(throttle ? 6000 : 3000);
  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource").map((r) => ({ name: r.name.replace(location.origin, ""), type: r.initiatorType, start: Math.round(r.startTime), end: Math.round(r.responseEnd), size: r.transferSize, render: r.renderBlockingStatus }));
    const fonts = [];
    document.fonts.forEach((f) => fonts.push(`${f.family} ${f.weight} ${f.status}`));
    const paints = performance.getEntriesByType("paint").map((p) => ({ name: p.name, t: Math.round(p.startTime) }));
    return {
      nav: { ttfb: Math.round(nav.responseStart), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) },
      paints,
      lcp: window.__probe.lcp,
      cls: window.__probe.cls,
      clsTotal: +window.__probe.cls.reduce((s, e) => s + e.value, 0).toFixed(4),
      longtasks: window.__probe.longtasks,
      fonts: fonts.filter((f) => !f.includes("unloaded")),
      fontResources: res.filter((r) => /\.woff2/.test(r.name)),
      scripts: res.filter((r) => r.type === "script").sort((a, b) => b.size - a.size).slice(0, 8),
      css: res.filter((r) => /\.css/.test(r.name)),
      requests: res.length,
    };
  });
  await context.close();
  return data;
}

const browser = await chromium.launch({ headless: true });
const out = {};
for (const p of pages) {
  out[p] = { unthrottled: await probe(browser, p, false), throttled: await probe(browser, p, true) };
  for (const mode of ["unthrottled", "throttled"]) {
    const d = out[p][mode];
    console.log(`== ${p} [${mode}] ttfb=${d.nav.ttfb} fcp=${d.paints.find((x) => x.name === "first-contentful-paint")?.t} dcl=${d.nav.domContentLoaded} load=${d.nav.load} cls=${d.clsTotal} longtasks=${d.longtasks.length} (${d.longtasks.map((t) => t.duration).join(",")})`);
    for (const c of d.lcp) console.log(`   LCP candidate t=${c.startTime} size=${c.size} <${c.tag} class="${c.cls}"> font="${c.font}" text="${c.text}" url=${c.url ?? "-"}`);
    for (const f of d.fontResources) console.log(`   font ${f.name.slice(-40)} ${f.start}-${f.end} ms ${f.size} B`);
    for (const c of d.css) console.log(`   css ${c.name.slice(-30)} ${c.start}-${c.end} ms ${c.size} B ${c.render}`);
    if (d.cls.length) console.log(`   shifts: ${JSON.stringify(d.cls).slice(0, 400)}`);
  }
}
await browser.close();
fs.writeFileSync(process.argv[2] ?? "lcp-probe.json", JSON.stringify(out, null, 2));
