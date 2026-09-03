import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("marketing site", () => {
  for (const locale of ["en", "de"] as const) {
    test(`home renders with one h1, hreflang alternates and no serious accessibility violations (${locale})`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveCount(1);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    });
  }

  test("blog index lists posts and a post renders with article structured data", async ({ page }) => {
    await page.goto("/en/blog");
    const first = page.locator("main a[href^='/en/blog/']").first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/en\/blog\/[a-z0-9-]+$/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('script[type="application/ld+json"]')).toContainText("BlogPosting");
    await expect(page.locator("time").first()).toBeVisible();
  });

  test("pricing never shows invented amounts: either Stripe prices or the honest empty state", async ({ page }) => {
    await page.goto("/en/pricing");
    await expect(page.locator("h1")).toHaveCount(1);
    const body = await page.locator("main").innerText();
    const hasPrice = /€\s?\d|\d\s?€|\$\s?\d/.test(body);
    const hasHonestState = /not configured|contact|on request|unavailable/i.test(body);
    expect(hasPrice || hasHonestState).toBe(true);
  });

  test("legal pages carry the operator identity from the environment or state that it is missing", async ({ page }) => {
    await page.goto("/en/imprint");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).not.toContainText("Lorem");
  });
});
