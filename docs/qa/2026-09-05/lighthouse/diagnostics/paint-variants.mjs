// Which part of Lighthouse's environment delays the first paint of /en on mobile emulation?
// Variants: headless shell vs Chrome --headless=new, with/without screencast, with Lighthouse-like
// emulation calls. Measures FCP (paint timing) and load event; 2 loads each.
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Soheil/Downloads/track.site/apps/web/package.json");
const { chromium } = require("@playwright/test");
const url = process.argv[2] ?? "http://localhost:3002/en";

async function measure(browser, opts) {
  const results = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext(opts.context ?? {});
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (opts.lhEmulation) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, screenOrientation: { angle: 0, type: "portraitPrimary" } });
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36" });
    }
    if (opts.screencast) {
      await cdp.send("Page.enable");
      cdp.on("Page.screencastFrame", (e) => cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {}));
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 30, maxWidth: 412, maxHeight: 823 });
    }
    if (opts.tracing) await cdp.send("Tracing.start", { categories: "-*,disabled-by-default-devtools.screenshot,devtools.timeline,disabled-by-default-devtools.timeline", transferMode: "ReturnAsStream" });
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(3500);
    const d = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fp = performance.getEntriesByType("paint");
      return { load: Math.round(nav.loadEventEnd), fp: Math.round(fp.find((x) => x.name === "first-paint")?.startTime ?? -1), fcp: Math.round(fp.find((x) => x.name === "first-contentful-paint")?.startTime ?? -1) };
    });
    if (opts.tracing) { try { await cdp.send("Tracing.end"); } catch {} }
    results.push(d);
    await context.close();
  }
  return results.map((r) => `load=${r.load} fp=${r.fp} fcp=${r.fcp}`).join(" | ");
}

const mobileCtx = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true };
const shell = await chromium.launch({ headless: true });
console.log("A headless-shell, playwright mobile ctx:          ", await measure(shell, { context: mobileCtx }));
console.log("B headless-shell, LH-like emulation via CDP:      ", await measure(shell, { lhEmulation: true }));
console.log("C headless-shell, LH emulation + screencast:      ", await measure(shell, { lhEmulation: true, screencast: true }));
console.log("D headless-shell, LH emulation + tracing(screens):", await measure(shell, { lhEmulation: true, tracing: true }));
await shell.close();
try {
  const chrome = await chromium.launch({ channel: "chrome", headless: true });
  console.log("E chrome --headless=new, playwright mobile ctx:  ", await measure(chrome, { context: mobileCtx }));
  console.log("F chrome --headless=new, desktop ctx:            ", await measure(chrome, { context: { viewport: { width: 1350, height: 940 } } }));
  console.log("G chrome --headless=new, LH emulation + tracing: ", await measure(chrome, { lhEmulation: true, tracing: true }));
  await chrome.close();
} catch (e) {
  console.log("chrome channel failed:", e.message.split("\n")[0]);
}
