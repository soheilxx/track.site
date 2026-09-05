/**
 * Why the keyboard is emulated by resizing the viewport (task E3): a CDP `Emulation.setDeviceMetricsOverride` with a
 * `viewport` override does not shrink `window.visualViewport` in headless Chromium, so the visual-viewport-only
 * behaviour of Android Chrome ≥ 108 / iOS Safari cannot be emulated without resizing the layout viewport as well.
 * Usage: node docs/qa/2026-09-05/followup/keyboard/cdp-viewport-probe.mjs --base http://localhost:3014
 * Output: cdp-viewport-probe.log
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const { chromium } = createRequire(path.join(root, "apps/web/package.json"))("@playwright/test");
const base = process.argv[process.argv.indexOf("--base") + 1] || "http://localhost:3014";
const lines = [];
const log = (s) => {
  lines.push(s);
  process.stdout.write(`${s}\n`);
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, storageState: path.join(root, "apps/web/e2e/.auth/owner.json") });
const page = await context.newPage();
await page.goto(`${base}/app?ai_fixture=long-conversation`, { waitUntil: "load" });
await page.getByTestId("assistant-fab").tap();
await page.getByTestId("assistant-composer").tap();
const vv = () => page.evaluate(() => ({ visualViewport: { width: window.visualViewport.width, height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop, scale: window.visualViewport.scale }, innerHeight: window.innerHeight, sheetHeight: Math.round(document.querySelector('[data-testid="assistant-panel"]').getBoundingClientRect().height) }));
log(`${new Date().toISOString()} ${base} chromium ${browser.version()}`);
log(`sheet open, composer focused: ${JSON.stringify(await vv())}`);
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true, screenWidth: 375, screenHeight: 812, viewport: { x: 0, y: 382, width: 375, height: 430, scale: 1 } });
await page.waitForTimeout(300);
log(`after Emulation.setDeviceMetricsOverride viewport {x:0,y:382,w:375,h:430,scale:1}: ${JSON.stringify(await vv())}`);
try {
  await cdp.send("Emulation.setVisibleSize", { width: 375, height: 430 });
  await page.waitForTimeout(300);
  log(`after Emulation.setVisibleSize 375x430: ${JSON.stringify(await vv())}`);
} catch (err) {
  log(`Emulation.setVisibleSize: ${String(err).split("\n")[0]}`);
}
await cdp.send("Emulation.clearDeviceMetricsOverride");
await page.setViewportSize({ width: 375, height: 430 });
await page.waitForTimeout(300);
log(`after page.setViewportSize 375x430: ${JSON.stringify(await vv())}`);
await browser.close();
fs.writeFileSync(path.join(here, "cdp-viewport-probe.log"), `${lines.join("\n")}\n`);
