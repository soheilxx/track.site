import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "owner@acme.test";
const password = process.env.E2E_PASSWORD ?? "Demo-Password-123!";

/** Auth pages live under the locale prefix; the dashboard (/app) stays unprefixed. */
const LOGIN = "/en/login";

test.describe("dashboard", () => {
  test("signs in with the seeded owner, lists sites and opens the shop connection page", async ({ page }) => {
    await page.goto(LOGIN);
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.locator("form button[type=submit]").first().click();
    await page.waitForURL(/\/app/);
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

  test("the debugger and data quality pages render for the signed-in owner", async ({ page }) => {
    await page.goto(LOGIN);
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.locator("form button[type=submit]").first().click();
    await page.waitForURL(/\/app/);
    for (const path of ["/app/debugger", "/app/data-quality", "/app/consent", "/app/settings"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });
});
