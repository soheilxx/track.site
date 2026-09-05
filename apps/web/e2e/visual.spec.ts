import { expect, test, type Page } from "@playwright/test";

/**
 * Visual regression baselines (supplement §11 "Visual-Regression-Tests", docs/11 phase 7).
 *
 * Runs only in the `visual` project of playwright.config.ts (Chromium, `reducedMotion: "reduce"`,
 * `deviceScaleFactor: 1`). Baselines live in `e2e/__screenshots__/<name>-visual-<platform>.png`;
 * see e2e/README.md for how to (re)generate them. Every capture is clipped to at most
 * CLIP_HEIGHT px so the PNGs stay small, animations are disabled and time-dependent elements
 * are masked (see MASKS).
 */

const CLIP_HEIGHT = 2500;
const MAX_DIFF_PIXEL_RATIO = 0.01;

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

/**
 * Elements whose content depends on the wall clock, masked in every capture: timestamps rendered
 * as <time> (relative "3 minutes ago" and formatted dates), the "Measured now · <date, time>" /
 * "Measured at <date, time>" lines of the Command Center (plain text, not <time>) and the
 * reading-progress bar of articles, and the message list of the Track AI panel (the owner's
 * persisted transcript, which every dashboard e2e run extends; header, quick actions and composer
 * of the panel stay compared). The Living AI Core is not masked: with `reducedMotion: "reduce"`
 * it renders its static tier (docs/15), and masking it would hide the whole panel.
 */
function masks(page: Page) {
  return [
    page.locator("time"),
    page.locator('[role="progressbar"]'),
    page.getByText(/^Measured\b/),
    page.locator('[data-testid="assistant-messages"]'),
  ];
}

const PUBLIC_PAGES = [
  { id: "home", path: "/en" },
  { id: "pricing", path: "/en/pricing" },
  { id: "knowledge-hub", path: "/en/tracking-knowledge" },
  { id: "article-consent-mode-v2-guide", path: "/en/tracking-knowledge/consent-mode-v2-guide" },
  { id: "login", path: "/en/login" },
] as const;

const APP_PAGES = [{ id: "app-overview", path: "/app", ready: '[data-testid="app-shell"]' }] as const;

/** Viewport of the capture; reduced motion is set on the context (playwright.config.ts) and repeated here so a page never sees the "no preference" state. */
async function prepare(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
}

/** Loads a page, mounts lazy sections (scroll sweep), waits for fonts and returns to the top. */
async function settle(page: Page, ready?: string) {
  if (ready) await expect(page.locator(ready)).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const doc = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector<HTMLElement>('[data-testid="app-main"]');
    for (const el of main ? [doc, main] : [doc]) {
      for (let y = 0; y < el.scrollHeight; y += 700) {
        if (el === doc) window.scrollTo(0, y);
        else el.scrollTop = y;
        await wait(40);
      }
      if (el === doc) window.scrollTo(0, 0);
      else el.scrollTop = 0;
    }
    await document.fonts.ready;
    await wait(250);
  });
}

async function clipFor(page: Page, width: number) {
  const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  return { x: 0, y: 0, width, height: Math.min(CLIP_HEIGHT, height) };
}

async function snapshot(page: Page, name: string, width: number) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    clip: await clipFor(page, width),
    mask: masks(page),
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
  });
}

test.describe("public pages (anonymous visitor)", () => {
  // marketing and auth pages are captured without the stored owner session (header shows Log in / Start free)
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { id, path } of PUBLIC_PAGES) {
    for (const viewport of VIEWPORTS) {
      test(`${id} at ${viewport.width}px matches the baseline`, async ({ page }) => {
        await prepare(page, viewport);
        await page.goto(path);
        await expect(page.locator("h1")).toHaveCount(1);
        await settle(page);
        await snapshot(page, `${id}-${viewport.width}`, viewport.width);
      });
    }
  }
});

test.describe("dashboard (stored owner session)", () => {
  for (const { id, path, ready } of APP_PAGES) {
    for (const viewport of VIEWPORTS) {
      test(`${id} at ${viewport.width}px matches the baseline`, async ({ page }) => {
        await prepare(page, viewport);
        await page.goto(path);
        await settle(page, ready);
        await snapshot(page, `${id}-${viewport.width}`, viewport.width);
      });
    }
  }
});
