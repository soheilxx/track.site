import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "owner@acme.test";
const password = process.env.E2E_PASSWORD ?? "Demo-Password-123!";

/** Auth pages live under the locale prefix; the dashboard (/app) stays unprefixed. */
const LOGIN = "/en/login";

/** Fresh browser state (no stored session) for the explicit sign-in test. */
const SIGNED_OUT = { cookies: [], origins: [] };

async function signIn(page: Page) {
  await page.goto(LOGIN);
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
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
