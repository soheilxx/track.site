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

  test("signs in with the seeded owner, lists sites and opens the shop connection page", async ({ page }) => {
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
  test("the module pages render one h1 each inside the shell for the signed-in owner", async ({ page }) => {
    for (const path of ["/app/events", "/app/destinations", "/app/data-quality", "/app/consent", "/app/insights", "/app/releases", "/app/team", "/app/billing", "/app/settings", "/app/ai-setup"]) {
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

test.describe("viewport-fixed shell", () => {
  test("keeps the document at viewport height with independent scroll areas and the Track AI panel docked on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const overflow = await page.evaluate(() => [getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow, document.documentElement.scrollHeight <= window.innerHeight + 1]);
    expect(overflow).toEqual(["hidden", "hidden", true]);
    const main = page.getByTestId("app-main");
    await expect(main).toHaveCSS("overflow-y", "auto");
    // task-oriented navigation
    const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
    for (const label of ["Command Center", "AI Setup", "Events", "Destinations", "Data Quality", "Consent & Privacy", "Insights", "Releases", "Team & Access", "Billing", "Settings"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    // workspace switcher + environment indicator
    await expect(page.getByTestId("workspace-switcher")).toBeVisible();
    await expect(page.getByTestId("environment-indicator").first()).toContainText(/Production|Staging|Test/);
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
    await page.getByRole("navigation", { name: "Dashboard" }).first().getByRole("link", { name: "Events", exact: true }).click();
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

  test("shows the launcher in the safe area and a full-height bottom sheet on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/app");
    await expect(page.getByTestId("assistant-fab")).toBeVisible();
    await page.getByTestId("assistant-fab").click();
    const sheet = page.getByRole("dialog", { name: /Track AI/ });
    await expect(sheet).toBeVisible();
    const height = await sheet.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(height - 740)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("assistant-composer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
});
