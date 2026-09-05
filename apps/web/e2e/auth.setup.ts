import { expect, test as setup, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth-file";

const email = process.env.E2E_EMAIL ?? "owner@acme.test";
const password = process.env.E2E_PASSWORD ?? "Demo-Password-123!";

/**
 * Waits until React has hydrated the login page (docs/16 D20). The inputs are server HTML until then;
 * hydration re-registers them with react-hook-form, which resets their value to the default — text
 * typed before that moment is lost (WebKit hydrates after Playwright's `fill`, Chromium before it).
 * React marks every hydrated DOM node with a `__reactProps$…` key; `<html>` is the last node the
 * root hydration pass completes before it commits, and the form's own key covers a lazily hydrated
 * boundary. The same helper lives in `app.spec.ts`.
 */
async function waitForLoginHydration(page: Page) {
  await page.waitForFunction(() => {
    const hydrated = (el: Element | null) => el !== null && Object.keys(el).some((key) => key.startsWith("__reactProps$"));
    return hydrated(document.documentElement) && hydrated(document.querySelector("form"));
  });
}

/**
 * Signs in once per run and stores the session for the dashboard specs. better-auth limits
 * `/sign-in/email` to 3 attempts per 10 s per IP, so every spec signing in on its own (with two
 * workers) trips the limit — the tests then time out on the "Too many attempts" alert.
 */
setup("signs in as the seeded owner and stores the session", async ({ page }) => {
  await page.goto("/en/login");
  await waitForLoginHydration(page);
  const emailInput = page.locator("input[name=email]");
  const passwordInput = page.locator("input[name=password]");
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL(/\/app/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
