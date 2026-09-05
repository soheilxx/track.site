#!/usr/bin/env node
/**
 * Functional check of the lazily hydrated islands (hero demo, pricing finder/calculator) against a
 * running server: the server-rendered placeholder is present before hydration, the interactive
 * component replaces it once the section is near the viewport, and it reacts to input.
 *
 * Usage (from apps/web): node scripts/qa/island-check.mjs http://localhost:3011
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3011";
const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}\n`);
};

try {
  // ---- home: hero demo island
  const page = await browser.newPage({ viewport: { width: 412, height: 823 }, javaScriptEnabled: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}/en`, { waitUntil: "domcontentloaded" });
  const staticFirst = await page.locator("section[data-demo]").first().getAttribute("data-demo");
  check("home: demo section rendered from the server", staticFirst === "static" || staticFirst === "interactive", `data-demo=${staticFirst}`);
  // the island replaces the placeholder node while it scrolls into view, so scroll via the DOM instead of a locator
  await page.evaluate(() => document.querySelector("section[data-demo]")?.scrollIntoView({ block: "center" }));
  await page.waitForSelector('section[data-demo="interactive"]', { timeout: 15000 });
  check("home: interactive demo swapped in after scrolling to it", true);
  const tab = page.getByRole("tab", { name: /live events/i });
  // the sticky header overlaps the tab list at this scroll position: dispatch the click on the element itself
  await tab.dispatchEvent("click");
  await page.waitForTimeout(200);
  check("home: demo tab switches", (await tab.getAttribute("aria-selected")) === "true");
  const domain = page.locator('input[name="domain"]');
  await domain.fill("not a domain");
  await page.locator("form button[type=submit]").first().click();
  await page.waitForTimeout(200);
  check("home: domain form validates on the client", (await page.locator('[role="alert"]').count()) > 0);
  check("home: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  // ---- pricing: finder/calculator island
  const pricing = await browser.newPage({ viewport: { width: 412, height: 823 } });
  const perrors = [];
  pricing.on("pageerror", (e) => perrors.push(String(e)));
  pricing.on("console", (m) => {
    if (m.type() === "error") perrors.push(m.text());
  });
  await pricing.goto(`${base}/en/pricing`, { waitUntil: "domcontentloaded" });
  // the radio is visually hidden (sr-only) inside its label: click the visible label text
  await pricing.locator('label:has(input[type="radio"][value="yearly"]) > span').click();
  await pricing.waitForTimeout(200);
  const cardHref = await pricing.locator('[data-plan="growth"] a[href*="/signup"]').first().getAttribute("href");
  check("pricing: plan card CTA follows the yearly toggle", /interval=yearly/.test(cardHref ?? ""), cardHref ?? "");
  const tools = pricing.locator("#tools");
  await tools.scrollIntoViewIfNeeded();
  const sites = pricing.locator('#tools input[type="number"]').first();
  await sites.waitFor();
  // the interactive tools are loaded when the stage scrolls into view; wait until an input is controlled (value + onChange)
  await pricing.waitForFunction(() => {
    const el = document.querySelector('#tools input[type="number"]');
    return el && Object.keys(el).some((k) => k.startsWith("__reactProps") && el[k].onChange);
  }, null, { timeout: 15000 });
  const before = await pricing.locator('#tools [role="status"]').first().innerText();
  await sites.fill("30");
  await pricing.waitForTimeout(300);
  const after = await pricing.locator('#tools [role="status"]').first().innerText();
  check("pricing: plan finder recommends another plan for 30 sites", before !== after && /pro|enterprise/i.test(after), after.split("\n").slice(0, 2).join(" / "));
  const matrixSymbols = await pricing.locator("symbol#pricing-cell-yes").count();
  const uses = await pricing.locator('use[href="#pricing-cell-yes"]').count();
  // measure a visible icon: the mobile view keeps only the first group open, so open every group first
  const box = await pricing.evaluate(() => {
    for (const d of document.querySelectorAll("#compare details")) d.open = true;
    for (const el of document.querySelectorAll('use[href="#pricing-cell-yes"]')) {
      const r = el.closest("svg").getBoundingClientRect();
      if (r.width > 0) return { w: r.width, h: r.height };
    }
    return { w: 0, h: 0 };
  });
  check("pricing: matrix cell icons reference one symbol and render at 16 px", matrixSymbols === 1 && uses > 100 && box.w === 16 && box.h === 16, `symbols=${matrixSymbols} uses=${uses} size=${box.w}x${box.h}`);
  // desktop view of the matrix for a visual check of the <use> icons
  const wide = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await wide.goto(`${base}/en/pricing#compare`, { waitUntil: "domcontentloaded" });
  await wide.evaluate(() => document.fonts.ready);
  await wide.locator("#compare table").scrollIntoViewIfNeeded();
  await wide.locator("#compare table").screenshot({ path: process.env.MATRIX_SHOT ?? "matrix.png" });
  await wide.close();
  check("pricing: no page errors", perrors.length === 0, perrors.slice(0, 3).join(" | "));

  // ---- article / hub smoke: language switcher + search island
  const hub = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const herrors = [];
  hub.on("pageerror", (e) => herrors.push(String(e)));
  await hub.goto(`${base}/en/tracking-knowledge`, { waitUntil: "domcontentloaded" });
  await hub.getByRole("searchbox").first().fill("consent");
  await hub.waitForTimeout(1200);
  const heading = await hub.locator("#directory h3.tabular-nums").first().innerText();
  check("hub: live search updates the result count", /\d/.test(heading), heading);
  await hub.locator("header").getByRole("button", { name: /language/i }).click();
  await hub.locator("header").getByRole("link", { name: "Deutsch" }).click();
  await hub.waitForURL(/\/de\/tracking-knowledge/);
  check("hub: language switcher navigates to the same page in German", true);
  check("hub: no page errors", herrors.length === 0, herrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`${results.length - failed}/${results.length} checks passed\n`);
process.exit(failed ? 1 : 0);
