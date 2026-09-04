import { expect, test as setup } from "@playwright/test";
import { AUTH_FILE } from "./auth-file";

const email = process.env.E2E_EMAIL ?? "owner@acme.test";
const password = process.env.E2E_PASSWORD ?? "Demo-Password-123!";

/**
 * Signs in once per run and stores the session for the dashboard specs. better-auth limits
 * `/sign-in/email` to 3 attempts per 10 s per IP, so every spec signing in on its own (with two
 * workers) trips the limit — the tests then time out on the "Too many attempts" alert.
 */
setup("signs in as the seeded owner and stores the session", async ({ page }) => {
  await page.goto("/en/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/\/app/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
