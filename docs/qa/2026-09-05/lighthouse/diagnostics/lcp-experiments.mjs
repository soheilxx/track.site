// Attribution experiment under CDP throttling close to Lighthouse mobile (CPU 4x, 150 ms RTT, 1.6 Mbps):
// measures FCP/LCP with (a) everything, (b) font files blocked, (c) scripts blocked, (d) both blocked,
// to show which resource class delays the first/largest paint of the hero text.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("C:/Users/Soheil/Downloads/track.site/apps/web/package.json");
const { chromium } = require("@playwright/test");

const base = "http://localhost:3002";
const pages = (process.argv[3] ?? "/en,/en/pricing").split(",");
const variants = { baseline: [], "no-fonts": [/\.woff2/], "no-scripts": [/\/_next\/static\/chunks\/.*\.js/], "no-fonts-no-scripts": [/\.woff2/, /\/_next\/static\/chunks\/.*\.js/] };
const init = `window.__p={lcp:[]};new PerformanceObserver(l=>{for(const e of l.getEntries())window.__p.lcp.push({t:Math.round(e.startTime),size:e.size,tag:e.element?e.element.tagName:null,cls:e.element?(e.element.getAttribute('class')||'').slice(0,50):null})}).observe({type:'largest-contentful-paint',buffered:true});`;

const browser = await chromium.launch({ headless: true });
const out = {};
for (const p of pages) {
  out[p] = {};
  for (const [name, blocks] of Object.entries(variants)) {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      if (blocks.length) await page.route((url) => blocks.some((re) => re.test(url.href)), (route) => route.abort());
      await page.addInitScript(init);
      await page.goto(base + p, { waitUntil: "load", timeout: 90000 });
      await page.waitForTimeout(3000);
      const d = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const fcp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
        const css = performance.getEntriesByType("resource").filter((r) => /\.css/.test(r.name)).map((r) => Math.round(r.responseEnd));
        return { ttfb: Math.round(nav.responseStart), docEnd: Math.round(nav.responseEnd), docTransfer: nav.transferSize, docDecoded: nav.decodedBodySize, dcl: Math.round(nav.domContentLoadedEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, cssEnd: Math.max(...css), lcp: window.__p.lcp.at(-1) ?? null };
      });
      runs.push(d);
      await context.close();
    }
    out[p][name] = runs;
    console.log(`${p} [${name}] ` + runs.map((d) => `ttfb=${d.ttfb} docEnd=${d.docEnd} (${d.docTransfer}B tx / ${d.docDecoded}B) cssEnd=${d.cssEnd} FCP=${d.fcp} LCP=${d.lcp?.t} <${d.lcp?.tag} ${d.lcp?.cls}> dcl=${d.dcl}`).join(" | "));
  }
}
await browser.close();
fs.writeFileSync(process.argv[2] ?? "lcp-experiments.json", JSON.stringify(out, null, 2));
