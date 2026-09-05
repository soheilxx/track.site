import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import pg from "pg";

const email = process.env.E2E_EMAIL ?? "owner@acme.test";
const password = process.env.E2E_PASSWORD ?? "Demo-Password-123!";

/** Auth pages live under the locale prefix; the dashboard (/app) stays unprefixed. */
const LOGIN = "/en/login";

/** Fresh browser state (no stored session) for the explicit sign-in test. */
const SIGNED_OUT = { cookies: [], origins: [] };

/**
 * Waits until React has hydrated the login page (docs/16 D20). The inputs are server HTML until then;
 * hydration re-registers them with react-hook-form, which resets their value to the default — text
 * typed before that moment is lost (WebKit hydrates after Playwright's `fill`, Chromium before it).
 * React marks every hydrated DOM node with a `__reactProps$…` key; `<html>` is the last node the
 * root hydration pass completes before it commits, and the form's own key covers a lazily hydrated
 * boundary. The same helper lives in `auth.setup.ts`.
 */
async function waitForLoginHydration(page: Page) {
  await page.waitForFunction(() => {
    const hydrated = (el: Element | null) => el !== null && Object.keys(el).some((key) => key.startsWith("__reactProps$"));
    return hydrated(document.documentElement) && hydrated(document.querySelector("form"));
  });
}

async function signIn(page: Page) {
  await page.goto(LOGIN);
  await waitForLoginHydration(page);
  const emailInput = page.locator("input[name=email]");
  const passwordInput = page.locator("input[name=password]");
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/\/app/);
}

// All other dashboard tests start from the session stored by e2e/auth.setup.ts (see playwright.config.ts):
// better-auth limits /sign-in/email to 3 attempts per 10 s, so each spec signing in on its own is flaky.

test.describe("sign-in", () => {
  test.use({ storageState: SIGNED_OUT });

  test("signs in with the seeded owner, lists sites and opens the shop connection page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/sites");
    const site = page.locator("main a[href^='/app/sites/']").first();
    await expect(site).toBeVisible();
    const href = await site.getAttribute("href");
    await page.goto(`${href}/shop`);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByText("Shopify")).toBeVisible();
    await expect(page.getByText("WooCommerce")).toBeVisible();
    await expect(page.getByText("Shopware 6")).toBeVisible();
  });
});

test.describe("dashboard", () => {
  test("the module pages render one h1 each inside the shell for the signed-in owner", async ({
    page,
  }) => {
    for (const path of [
      "/app/events",
      "/app/destinations",
      "/app/data-quality",
      "/app/consent",
      "/app/insights",
      "/app/releases",
      "/app/team",
      "/app/billing",
      "/app/settings",
      "/app/settings/alerts",
      "/app/ai-setup",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1"), path).toHaveCount(1);
      await expect(page.getByTestId("app-shell"), path).toBeVisible();
    }
  });

  test("redirects the renamed dashboard paths permanently", async ({ page }) => {
    // DASHBOARD_LEGACY_PATHS in next.config.ts: 308, query string carried over
    for (const [from, to] of [
      ["/app/setup", "/app/ai-setup"],
      ["/app/debugger?name=purchase", "/app/events/explorer?name=purchase"],
      ["/app/audiences", "/app/insights/audiences"],
    ] as const) {
      const response = await page.request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      const location = new URL(response.headers()["location"] ?? "", "http://localhost");
      expect(location.pathname + location.search, from).toBe(to);
    }
  });
});

test.describe("alerts & incident mode", () => {
  test("renders /app/settings/alerts with Incident Mode, channels, rules and an honest history state", async ({
    page,
  }) => {
    await page.goto("/app/settings/alerts");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Alerts & Incident Mode");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    // settings sub-navigation links both pages; the shell navigation carries the module entry
    await expect(page.getByTestId("settings-subnav-alerts")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Dashboard" })
        .first()
        .getByRole("link", { name: "Alerts & Incident Mode", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("incident-mode")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notification channels" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alert rules" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alert history" })).toBeVisible();
    // the history never invents entries: either the empty state or a table of real alert events
    await expect(
      page.getByText("No alerts yet").or(page.getByRole("table", { name: /Alert history/ })),
    ).toBeVisible();
  });

  test("creates a webhook channel and a rule with a plain-language preview, then removes both", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const channelName = `E2E webhook ${stamp}`;
    const ruleName = `E2E drop rule ${stamp}`;
    await page.goto("/app/settings/alerts");

    await page.getByTestId("channel-add").click();
    const channelForm = page.getByTestId("channel-form");
    await expect(channelForm).toBeVisible();
    await channelForm.locator("select[name=kind]").selectOption("webhook");
    await channelForm.locator("input[name=name]").fill(channelName);
    await channelForm.locator("input[name=target]").fill("https://example.com/track-alerts");
    await channelForm.locator("input[name=secret]").fill("e2e-signing-secret");
    await channelForm.getByTestId("channel-form-submit").click();
    const channelRow = page.getByTestId("channel-row").filter({ hasText: channelName });
    await expect(channelRow).toBeVisible();
    // the URL is never shown again: host hint only
    await expect(channelRow).toContainText("example.com");
    await expect(channelRow).not.toContainText("track-alerts");

    await page.getByTestId("rule-add").click();
    const ruleForm = page.getByTestId("rule-form");
    await expect(ruleForm).toBeVisible();
    await ruleForm.getByTestId("rule-kind").selectOption("event_drop");
    await ruleForm.locator("input[name=name]").fill(ruleName);
    await ruleForm.getByTestId("rule-threshold-dropPercent").fill("40");
    await expect(ruleForm.getByTestId("rule-preview")).toContainText("40 % below the average");
    await ruleForm.getByLabel(channelName, { exact: true }).check();
    await ruleForm.getByTestId("rule-form-submit").click();
    const ruleRow = page.getByTestId("rule-row").filter({ hasText: ruleName });
    await expect(ruleRow).toBeVisible();
    await expect(ruleRow).toContainText(channelName);
    await expect(ruleRow).toContainText("Not evaluated yet");

    // cleanup through the same confirmed, audited actions
    await ruleRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete rule" }).click();
    await expect(ruleRow).toHaveCount(0);
    await channelRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete channel" }).click();
    await expect(channelRow).toHaveCount(0);
  });

  test("saves the per-user AI motion preference and exposes it on the dashboard root", async ({
    page,
  }) => {
    await page.goto("/app/settings");
    const form = page.getByTestId("ai-motion-form");
    await expect(form).toBeVisible();
    await form.getByLabel("Reduced", { exact: true }).check();
    await form.getByRole("button", { name: "Save motion setting" }).click();
    await expect(form.getByText("Motion setting saved.")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-ai-motion", "reduced");
    await expect(
      page.getByTestId("ai-motion-form").getByLabel("Reduced", { exact: true }),
    ).toBeChecked();
    // restore the default so other runs start from the OS preference
    await page.getByTestId("ai-motion-form").getByLabel("System default", { exact: true }).check();
    await page
      .getByTestId("ai-motion-form")
      .getByRole("button", { name: "Save motion setting" })
      .click();
    await expect(
      page.getByTestId("ai-motion-form").getByText("Motion setting saved."),
    ).toBeVisible();
  });
});

test.describe("viewport-fixed shell", () => {
  test("keeps the document at viewport height with independent scroll areas and the Track AI panel docked on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const overflow = await page.evaluate(() => [
      getComputedStyle(document.documentElement).overflow,
      getComputedStyle(document.body).overflow,
      document.documentElement.scrollHeight <= window.innerHeight + 1,
    ]);
    expect(overflow).toEqual(["hidden", "hidden", true]);
    const main = page.getByTestId("app-main");
    await expect(main).toHaveCSS("overflow-y", "auto");
    // task-oriented navigation
    const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
    for (const label of [
      "Command Center",
      "AI Setup",
      "Events",
      "Destinations",
      "Data Quality",
      "Consent & Privacy",
      "Insights",
      "Releases",
      "Team & Access",
      "Billing",
      "Settings",
    ]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    // workspace switcher + environment indicator
    await expect(page.getByTestId("workspace-switcher")).toBeVisible();
    await expect(page.getByTestId("environment-indicator").first()).toContainText(
      /Production|Staging|Test/,
    );
    // Track AI panel: docked and open by default at 1440 px, header + composer visible, only the message list scrolls
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("assistant-composer")).toBeVisible();
    await expect(page.getByTestId("assistant-messages")).toHaveCSS("overflow-y", "auto");
    const width = await panel.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(380);
    expect(width).toBeLessThanOrEqual(440);
    // minimise → launcher stays visible → reopen
    await page.getByTestId("assistant-minimise").click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("assistant-launcher")).toBeVisible();
    await page.getByTestId("assistant-launcher").click();
    await expect(page.getByTestId("assistant-panel")).toBeVisible();
    // the panel survives a route change (same DOM node, state kept in the layout provider)
    await page
      .getByRole("navigation", { name: "Dashboard" })
      .first()
      .getByRole("link", { name: "Events", exact: true })
      .click();
    await page.waitForURL(/\/app\/events/);
    await expect(page.getByTestId("assistant-panel")).toBeVisible();
  });

  test("opens the command palette with Ctrl+K and navigates", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("Type a command or search…").fill("Destinations");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/app\/destinations/);
  });

  test("shows the launcher in the safe area and a full-height bottom sheet on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/app");
    await expect(page.getByTestId("assistant-fab")).toBeVisible();
    await page.getByTestId("assistant-fab").click();
    const sheet = page.getByRole("dialog", { name: /Track AI/ });
    await expect(sheet).toBeVisible();
    const height = await sheet.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(height - 740)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("assistant-composer")).toBeVisible();
    // the composer sits inside the sheet, above the safe area, and the sheet itself never scrolls as a whole
    const composerBox = await page.getByTestId("assistant-composer").boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(740);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
});

test.describe("responsive header", () => {
  // Regression guard for the 2026-09-05 sweep finding: the shell grid sized itself to the header's min-content width
  // (469 px at 320/375, 1104 px at 768) while the document has `overflow: hidden`, so the account menu, the launcher
  // and page actions were outside the viewport with no way to scroll to them.
  for (const width of [320, 375, 768]) {
    test(`at ${width} px the shell is exactly viewport-wide and the site switcher, the Track AI launcher and the account menu stay inside it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/app");
      await expect(page.getByTestId("app-shell")).toBeVisible();
      const metrics = await page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('[data-testid="app-shell"]')!;
        const header = document.querySelector<HTMLElement>('[data-testid="app-header"]')!;
        const main = document.querySelector<HTMLElement>('[data-testid="app-main"]')!;
        return {
          shellWidth: shell.getBoundingClientRect().width,
          headerRight: header.getBoundingClientRect().right,
          headerOverflow: header.scrollWidth - header.clientWidth,
          mainOverflow: main.scrollWidth - main.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
        };
      });
      expect(metrics.shellWidth).toBeLessThanOrEqual(width);
      expect(metrics.headerRight).toBeLessThanOrEqual(width);
      expect(metrics.headerOverflow).toBeLessThanOrEqual(1);
      expect(metrics.mainOverflow).toBeLessThanOrEqual(1);
      expect(metrics.documentWidth).toBeLessThanOrEqual(width);
      for (const control of [page.getByRole("button", { name: /^Site:/ }), page.getByTestId("assistant-launcher"), page.getByRole("button", { name: "Account menu" })]) {
        await expect(control).toBeVisible();
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      // the page's primary action inside the scroll area is not cut on the right either
      const cta = page.getByTestId("app-main").getByRole("link", { name: "Open AI Setup" }).first();
      await expect(cta).toBeVisible();
      const ctaBox = (await cta.boundingBox())!;
      expect(ctaBox.x + ctaBox.width).toBeLessThanOrEqual(width);
    });
  }

  test("below `sm` the command palette opens from the navigation drawer", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/app");
    await page.locator('button[aria-controls="app-nav-drawer"]').click();
    await page.getByTestId("palette-trigger-drawer").click();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });
});

test.describe("keyboard focus in the header", () => {
  // Regression guard for the 2026-09-05 keyboard check: `outline-none` on the menu triggers set `--tw-outline-style: none`,
  // which the `focus-visible:outline-2` rule inherited, so the workspace switcher and the account menu had no focus ring.
  test("the workspace switcher triggers and the account menu render a visible focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const seen: string[] = [];
    for (let i = 0; i < 10 && seen.length < 4; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { label: el.getAttribute("aria-label") ?? "", focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth) };
      });
      if (!focused || !/^(Organization|Site|Environment): |^Account menu$/.test(focused.label)) continue;
      expect(focused.focusVisible, focused.label).toBe(true);
      expect(focused.outlineStyle, focused.label).not.toBe("none");
      expect(focused.outlineWidth, focused.label).toBeGreaterThanOrEqual(2);
      seen.push(focused.label.split(":")[0]!);
    }
    expect(seen).toEqual(["Organization", "Site", "Environment", "Account menu"]);
  });
});

/** Server-confirmed status announcements of the header motion control (shell.assistant.motion, en). */
const MOTION_PAUSED = "AI motion paused. Your setting is saved.";
const MOTION_RESUMED = "AI motion follows your system setting again.";

/** Running CSS/Web animations whose target lives inside the Living AI Core. */
const coreAnimations = () =>
  document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target;
    return target instanceof Element && target.closest(".lac") !== null;
  }).length;

test.describe("Track AI panel", () => {
  test("keeps the shell exactly viewport-high with a 250-message conversation and windows the list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // dev-only synthetic transcript (apps/web/src/app/api/ai/dev-fixture, 404 in production)
    await page.goto("/app?ai_fixture=long-conversation");
    const list = page.getByTestId("assistant-messages");
    await expect(list).toHaveAttribute("data-total", "250");
    await expect(list).toHaveAttribute("data-virtualized", "true");
    const metrics = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="assistant-messages"]')!;
      const shell = document.querySelector<HTMLElement>('[data-testid="app-shell"]')!;
      return {
        documentFits: document.documentElement.scrollHeight <= window.innerHeight + 1,
        shellHeight: Math.round(shell.getBoundingClientRect().height),
        innerHeight: window.innerHeight,
        listScrolls: el.scrollHeight > el.clientHeight,
        rendered: document.querySelectorAll("[data-message-id]").length,
      };
    });
    expect(metrics.documentFits).toBe(true);
    expect(Math.abs(metrics.shellHeight - metrics.innerHeight)).toBeLessThanOrEqual(1);
    expect(metrics.listScrolls).toBe(true);
    expect(metrics.rendered).toBeGreaterThan(0);
    expect(metrics.rendered).toBeLessThan(250);
    await expect(page.getByTestId("assistant-composer")).toBeVisible();
    // the last message is in view at the end of the list
    await expect(page.locator('[data-message-id="fixture-249"]')).toBeVisible();
    // scrolling to the top brings the first message into the window and the position stays put (no autoscroll away from the reader)
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.locator('[data-message-id="fixture-0"]')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
    // the page still does not scroll
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
    ).toBe(true);
  });

  test("motion preference off produces no animated frame: the core reports the static tier", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    const core = page.getByTestId("living-ai-core");
    await expect(core).toBeAttached();
    const html = page.locator("html");
    // an aborted earlier run may have left the preference paused: the same control turns it on again
    if ((await html.getAttribute("data-ai-motion")) === "off") {
      await page.getByTestId("assistant-motion-toggle").click();
      await expect(html).toHaveAttribute("data-ai-motion", "system");
      await expect(page.getByText(MOTION_RESUMED)).toBeAttached();
    }
    await expect(core).toHaveAttribute("data-tier", /^(css|webgl)$/);
    // the header control pauses the motion at once (optimistic attribute) and persists `off` per user:
    // the status announcement arrives only after the server confirmed the save, so reloads never race it
    await page.getByTestId("assistant-motion-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-ai-motion", "off");
    await expect(page.getByText(MOTION_PAUSED)).toBeAttached();
    await expect(core).toHaveAttribute("data-tier", "static");
    await expect(core).toHaveAttribute("data-pref", "off");
    // (a function cannot travel as an evaluate argument: the counter runs as its own evaluate)
    const frames = await page.evaluate(() => {
      const blobs = Array.from(document.querySelectorAll<HTMLElement>(".lac-blob > i"));
      return {
        canvas: document.querySelector("canvas.lac-gl") !== null,
        keyframes: blobs.map((b) => getComputedStyle(b).animationName),
      };
    });
    const running = await page.evaluate(coreAnimations);
    expect(frames.canvas).toBe(false);
    expect(frames.keyframes.length).toBeGreaterThan(0);
    expect(frames.keyframes.every((name) => name === "none")).toBe(true);
    expect(running).toBe(0);
    // the setting survives a reload (server-side preference) …
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-ai-motion", "off");
    await expect(page.getByTestId("living-ai-core")).toHaveAttribute("data-tier", "static");
    // … and the same control turns the motion on again (system default)
    await page.getByTestId("assistant-motion-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-ai-motion", "system");
    await expect(page.getByTestId("living-ai-core")).toHaveAttribute("data-tier", /^(css|webgl)$/);
    // wait for the persisted `system` before the next spec loads the dashboard
    await expect(page.getByText(MOTION_RESUMED)).toBeAttached();
  });

  test("prefers-reduced-motion renders the static tier from the server on, without an animation flash", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    const core = page.getByTestId("living-ai-core");
    await expect(core).toHaveAttribute("data-tier", "static");
    await expect(core).toHaveAttribute("data-pref", "system");
    await expect(core).toHaveAttribute("data-state", "idle");
    expect(await page.evaluate(coreAnimations)).toBe(0);
    expect(await page.locator("canvas.lac-gl").count()).toBe(0);
    // server HTML already carries the static tier: the chat is readable before hydration and nothing animates on load
    const html = await (await page.request.get("/app")).text();
    expect(html).toContain('data-tier="static"');
    expect(html).not.toContain("<canvas");
  });

  test("exposes the activity live region, the motion state and the setup workspace targets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/ai-setup");
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-ai-state", "idle");
    const feed = page.getByTestId("assistant-activity");
    await expect(feed).toBeAttached();
    await expect(feed).toHaveAttribute("aria-live", "polite");
    await expect(feed).toHaveAttribute("data-count", "0");
    // the workspace the assistant's moves reveal: the setup workspace and its current step card
    await expect(page.locator('[data-focus-target="setup-workspace"]')).toBeVisible();
    await expect(page.getByTestId("assistant-announcer")).toHaveAttribute("aria-live", "polite");
    // the panel's composer is focusable from the workspace without leaving the page
    await page.getByRole("button", { name: "Open Track AI" }).first().click();
    await expect(page.getByTestId("assistant-composer")).toBeFocused();
  });
});

/** Evidence files of a spec: `E2E_EVIDENCE_DIR` when a QA run collects them, otherwise the test's output directory. */
function evidencePath(testInfo: TestInfo, name: string): string {
  const dir = process.env.E2E_EVIDENCE_DIR;
  if (!dir) return testInfo.outputPath(name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

type Box = { top: number; bottom: number; left: number; right: number; height: number };

/** Geometry of the open sheet as the reader sees it: visual viewport, transcript, last message and composer. */
const sheetMetrics = (page: Page) =>
  page.evaluate(() => {
    const read = (selector: string): Box | null => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), height: Math.round(b.height) };
    };
    const listEl = document.querySelector<HTMLElement>('[data-testid="assistant-messages"]')!;
    return {
      visualViewport: { width: window.visualViewport!.width, height: window.visualViewport!.height, offsetTop: window.visualViewport!.offsetTop },
      innerHeight: window.innerHeight,
      documentFits: document.documentElement.scrollHeight <= window.innerHeight + 1,
      sheet: read('[data-testid="assistant-panel"]'),
      context: read('[data-testid="assistant-context"]'),
      list: { ...read('[data-testid="assistant-messages"]')!, scrollTop: Math.round(listEl.scrollTop), scrollHeight: listEl.scrollHeight, clientHeight: listEl.clientHeight },
      lastMessage: read('[data-message-id="fixture-249"]'),
      composer: read('[data-testid="assistant-composer"]'),
      composerFocused: document.activeElement?.getAttribute("data-testid") === "assistant-composer",
    };
  });

test.describe("mobile on-screen keyboard", () => {
  // touch device at 375 × 812; the keyboard is emulated by shrinking the viewport to 375 × 430 (Chromium ≥ 108 and Safari
  // shrink the visual viewport only — both `100dvh` and the sheet's visualViewport listener resolve to the same 430 px here)
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the sheet follows the visual viewport: composer and last message stay visible above the keyboard, nothing shifts", async ({ page }, testInfo) => {
    await page.goto("/app?ai_fixture=long-conversation");
    await page.getByTestId("assistant-fab").tap();
    const sheet = page.getByRole("dialog", { name: /Track AI/ });
    await expect(sheet).toBeVisible();
    const list = page.getByTestId("assistant-messages");
    await expect(list).toHaveAttribute("data-total", "250");
    const last = page.locator('[data-message-id="fixture-249"]');
    await expect(last).toBeVisible();
    const composer = page.getByTestId("assistant-composer");
    await composer.tap();
    await expect(composer).toBeFocused();
    const before = await sheetMetrics(page);
    await page.screenshot({ path: evidencePath(testInfo, "keyboard-before.png") });
    // layout shifts from here on (the resize itself and the ambient motion afterwards)
    await page.evaluate(() => {
      const w = window as unknown as { __shifts: { value: number; hadRecentInput: boolean; t: number }[] };
      w.__shifts = [];
      new PerformanceObserver((entries) => {
        for (const e of entries.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) w.__shifts.push({ value: e.value, hadRecentInput: e.hadRecentInput, t: Math.round(e.startTime) });
      }).observe({ type: "layout-shift", buffered: false });
    });
    await page.setViewportSize({ width: 375, height: 430 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.height)).toBe(430);
    await page.waitForTimeout(500);
    const resizeShifts = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts.splice(0));
    // keyboard open, core animating: nothing may move now
    await page.waitForTimeout(1500);
    const idleShifts = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts.splice(0));
    const after = await sheetMetrics(page);
    await page.screenshot({ path: evidencePath(testInfo, "keyboard-after.png") });
    fs.writeFileSync(evidencePath(testInfo, "keyboard-metrics.json"), JSON.stringify({ before, after, resizeShifts, idleShifts }, null, 2));

    expect(after.visualViewport).toEqual({ width: 375, height: 430, offsetTop: 0 });
    expect(after.documentFits).toBe(true);
    expect(after.sheet!.top).toBe(0);
    expect(Math.abs(after.sheet!.height - 430)).toBeLessThanOrEqual(2);
    // composer inside the visible viewport and still focused
    expect(after.composer!.top).toBeGreaterThanOrEqual(0);
    expect(after.composer!.bottom).toBeLessThanOrEqual(430);
    expect(after.composerFocused).toBe(true);
    // the last message stays fully inside the (smaller) transcript region, above the composer
    expect(after.lastMessage!.top).toBeGreaterThanOrEqual(after.list.top - 1);
    expect(after.lastMessage!.bottom).toBeLessThanOrEqual(after.list.bottom + 1);
    expect(after.lastMessage!.bottom).toBeLessThanOrEqual(after.composer!.top);
    await expect(last).toBeInViewport({ ratio: 1 });
    // only the transcript scrolled to keep the end in view; no shift counts towards CLS
    expect(after.list.scrollTop).toBeGreaterThan(before.list.scrollTop);
    expect(resizeShifts.filter((s) => !(s as { hadRecentInput: boolean }).hadRecentInput)).toEqual([]);
    expect(idleShifts).toEqual([]);
    // keyboard closed: back to the full sheet
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(last).toBeInViewport({ ratio: 1 });
    await expect(composer).toBeVisible();
    await expect(composer).toBeFocused();
  });
});

const DRAFT = "Draft kept across routes";
const SEEDED_SITE = "Acme Shop";
const E2E_SITE = { name: "E2E switch site", domain: "e2e-switch.acme.test" };

/** Connection string of the database the server under test uses: `DATABASE_URL`, else the root `.env` (loaded by next.config.ts). */
function databaseUrl(testInfo: TestInfo): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const webDir = testInfo.config.configFile ? path.dirname(testInfo.config.configFile) : process.cwd();
  const env = fs.readFileSync(path.resolve(webDir, "../../.env"), "utf8");
  const m = /^DATABASE_URL=(.+)$/m.exec(env);
  if (!m) throw new Error("DATABASE_URL is neither set nor in the root .env");
  return m[1]!.trim().replace(/^"(.*)"$/, "$1");
}

/**
 * Second site of the demo organization for the site-switch spec. The seed creates one site and the starter plan caps
 * the organization at one (`siteLimitReached`), so the product itself cannot add it: the spec writes it to the local
 * database the way `SEED_DEMO=true pnpm db:seed` does (site + default environments), revives the row of an earlier
 * run instead of creating a new tracking id, and soft-deletes it afterwards exactly like `softDeleteSite`.
 */
async function withSecondSite<T>(testInfo: TestInfo, fn: (site: { id: string; name: string }) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl(testInfo) });
  await client.connect();
  try {
    const org = (await client.query<{ id: string }>("select id from organization where slug = $1", ["acme-demo"])).rows[0];
    if (!org) throw new Error("demo organization not seeded (SEED_DEMO=true pnpm db:seed)");
    let site = (await client.query<{ id: string; name: string }>("update sites set deleted_at = null, status = 'active', kill_switch = false where organization_id = $1 and name = $2 returning id, name", [org.id, E2E_SITE.name])).rows[0];
    if (!site) {
      const trackingId = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
      site = (await client.query<{ id: string; name: string }>("insert into sites (organization_id, tracking_id, name, primary_domain, business_type) values ($1, $2, $3, $4, 'saas') returning id, name", [org.id, trackingId, E2E_SITE.name, E2E_SITE.domain])).rows[0]!;
      await client.query("insert into environments (organization_id, site_id, kind, name, is_default, test_mode) values ($1, $2, 'production', 'Production', true, false), ($1, $2, 'staging', 'Staging', false, true)", [org.id, site.id]);
    }
    try {
      return await fn(site);
    } finally {
      await client.query("update sites set status = 'deleted', deleted_at = now(), kill_switch = true where id = $1", [site.id]);
    }
  } finally {
    await client.end();
  }
}

/** Selects `name` in the header's site menu (no-op when it is the active site already). */
async function switchSite(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: /^Site:/ });
  if (new RegExp(`^Site: ${name}\\b`).test((await trigger.getAttribute("aria-label")) ?? "")) return;
  await trigger.click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${name}\\b`) }).click();
  await expect(trigger).toHaveAttribute("aria-label", new RegExp(`^Site: ${name}\\b`));
}

/** What the reader sees of the Track AI panel: transcript length, scroll position, draft and panel geometry. */
const panelState = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-testid="assistant-messages"]')!;
    const panel = document.querySelector<HTMLElement>('[data-testid="assistant-panel"]')!.getBoundingClientRect();
    const visible = Array.from(document.querySelectorAll<HTMLElement>("[data-message-id]")).find((m) => m.getBoundingClientRect().bottom > list.getBoundingClientRect().top);
    return {
      total: list.getAttribute("data-total"),
      scrollTop: Math.round(list.scrollTop),
      firstVisibleMessage: visible?.dataset.messageId ?? null,
      draft: document.querySelector<HTMLTextAreaElement>('[data-testid="assistant-composer"]')!.value,
      panel: { left: Math.round(panel.left), top: Math.round(panel.top), width: Math.round(panel.width), height: Math.round(panel.height) },
      url: location.pathname + location.search,
    };
  });

test.describe("Track AI state across routes and sites", () => {
  test("the transcript, the scroll position, the draft and the panel geometry survive a route change", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app?ai_fixture=long-conversation");
    const list = page.getByTestId("assistant-messages");
    await expect(list).toHaveAttribute("data-total", "250");
    await expect(page.locator('[data-message-id="fixture-249"]')).toBeVisible();
    // read somewhere in the middle of the transcript and leave a draft in the composer
    await list.evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
    });
    await page.waitForTimeout(400); // the position is saved to the store 150 ms after the last scroll event
    await page.getByTestId("assistant-composer").fill(DRAFT);
    const before = await panelState(page);
    expect(before.scrollTop).toBeGreaterThan(0);
    // leave through the navigation and come back the same way (client-side transitions of the dashboard layout)
    const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
    await nav.getByRole("link", { name: "Events", exact: true }).click();
    await page.waitForURL(/\/app\/events/);
    await expect(page.getByTestId("app-main").locator("h1")).toHaveCount(1);
    await expect(page.getByTestId("assistant-panel")).toBeVisible();
    await nav.getByRole("link", { name: "Command Center", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/app");
    await expect(list).toHaveAttribute("data-total", "250");
    const after = await panelState(page);
    fs.writeFileSync(evidencePath(testInfo, "route-change.json"), JSON.stringify({ before, after }, null, 2));
    // the URL carries no fixture any more: what is shown comes from the layout-level store, not from a reload
    expect(after.url).toBe("/app");
    expect(after.total).toBe("250");
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(50);
    expect(after.draft).toBe(DRAFT);
    expect(after.panel).toEqual(before.panel);
    // leave the composer empty for the next spec
    await page.getByTestId("assistant-composer").fill("");
  });

  test("a site switch confirms the new context visibly and never shows the other site's transcript", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await withSecondSite(testInfo, async (other) => {
      await page.goto("/app?ai_fixture=long-conversation");
      const list = page.getByTestId("assistant-messages");
      await expect(list).toHaveAttribute("data-total", "250");
      const context = page.getByTestId("assistant-context");
      await expect(context).toContainText(`Site: ${SEEDED_SITE}`);
      // drop the fixture parameter from the URL first (Events → Command Center), so a reload of any site shows its real transcript
      const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
      await nav.getByRole("link", { name: "Events", exact: true }).click();
      await page.waitForURL(/\/app\/events/);
      await nav.getByRole("link", { name: "Command Center", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/app" && !url.search);
      await expect(list).toHaveAttribute("data-total", "250");
      try {
        await switchSite(page, other.name);
        // visible confirmation in the panel's context line (also a polite live region) and in the header's announcement
        await expect(context.getByRole("status")).toHaveText(`Track AI now works on ${other.name}.`);
        await expect(context).toContainText(`Site: ${other.name}`);
        await expect(page.getByTestId("workspace-switcher").getByRole("status")).toHaveText(`Workspace switched to ${other.name}.`);
        // the new site's own conversation: nothing of the 250 seeded messages, no mixed data
        await expect(list).not.toHaveAttribute("aria-busy", "true");
        await expect(list).toHaveAttribute("data-total", "0");
        await expect(page.locator('[data-message-id^="fixture-"]')).toHaveCount(0);
        const switched = await panelState(page);
        // back to the seeded site: its transcript is still there (kept in the store per site, the URL has no fixture to reload)
        await switchSite(page, SEEDED_SITE);
        await expect(context.getByRole("status")).toHaveText(`Track AI now works on ${SEEDED_SITE}.`);
        await expect(list).toHaveAttribute("data-total", "250");
        fs.writeFileSync(evidencePath(testInfo, "site-switch.json"), JSON.stringify({ otherSite: other.name, switched, restored: await panelState(page) }, null, 2));
      } finally {
        // the active site is a stored preference of the owner: always leave the seeded site active for the other specs
        await switchSite(page, SEEDED_SITE).catch(() => undefined);
      }
    });
  });
});
