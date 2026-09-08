import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

/**
 * Security settings (`/app/settings/security`, docs/17 §3 "Enrolment"): the dedicated e2e account
 * (`security@acme.test`, ANALYST of the demo organisation, seeded by `SEED_DEMO=true pnpm db:seed`)
 * enables two-factor authentication through the wizard (password → QR code + manual key → six-digit
 * code → backup codes shown once), the status card reflects it, the account menu carries the Security
 * shortcut, the account logs out and signs in again through the existing two-factor form with a code
 * generated here (RFC 6238, HMAC-SHA1 over the base32 secret from the manual key), and finally
 * disables two-factor with the password so the account is back in its initial state.
 *
 * The account is this spec's alone: the enrolment rotates the session token and, while two-factor is
 * on, every password sign-in of the account lands on the two-factor page — the seeded owner (stored
 * session of `auth.setup.ts`, sign-ins of the other specs and engines) is never touched. The spec signs
 * in on its own (no stored session); better-auth allows 3 sign-ins per 10 s per IP, so every sign-in
 * here retries after the window. `afterAll` disables two-factor through the auth API even when a step
 * failed, using the secret captured from the wizard; a run that crashed before that is repaired by the
 * next `db:seed`, which resets the account.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_SECURITY_EMAIL ?? "security@acme.test";
const PASSWORD = process.env.E2E_SECURITY_PASSWORD ?? process.env.E2E_PASSWORD ?? "Demo-Password-123!";
const LOGIN = "/en/login";
const SECURITY = "/app/settings/security";
const RATE_LIMIT_WINDOW_MS = 11_000;

/* ------------------------------------------------------------------ RFC 6238 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const index = BASE32.indexOf(ch);
    if (index < 0) throw new Error(`invalid base32 character ${ch}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Time-based one-time password (SHA-1, 30 s, six digits) for a base32 secret, as authenticator apps compute it. */
function totp(secret: string, atMs = Date.now(), period = 30, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / period)));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[offset]! & 0x7f) << 24) | ((mac[offset + 1]! & 0xff) << 16) | ((mac[offset + 2]! & 0xff) << 8) | (mac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/* ------------------------------------------------------------------ helpers */

/** Waits until React has hydrated the login page (the same rule as auth.setup.ts / app.spec.ts). */
async function waitForLoginHydration(page: Page) {
  await page.waitForFunction(() => {
    const hydrated = (el: Element | null) => el !== null && Object.keys(el).some((key) => key.startsWith("__reactProps$"));
    return hydrated(document.documentElement) && hydrated(document.querySelector("form"));
  });
}

/**
 * Signs in through the login form and returns where it landed: the dashboard, or the two-factor page
 * when the account already has two-factor enabled. Retries after the rate-limit window.
 */
async function signInWithForm(page: Page): Promise<"app" | "two-factor"> {
  for (let attempt = 0; ; attempt++) {
    await page.goto(LOGIN);
    await waitForLoginHydration(page);
    const emailInput = page.locator("input[name=email]");
    const passwordInput = page.locator("input[name=password]");
    await emailInput.fill(EMAIL);
    await passwordInput.fill(PASSWORD);
    await expect(emailInput).toHaveValue(EMAIL);
    await expect(passwordInput).toHaveValue(PASSWORD);
    await page.locator("form button[type=submit]").first().click();
    // the losing waits settle later (navigation timeout) — mapped to a value so nothing rejects unobserved
    const settled = () => "timeout" as const;
    const outcome = await Promise.race([
      page.waitForURL(/\/two-factor/).then(() => "two-factor" as const, settled),
      page.waitForURL((url) => url.pathname.startsWith("/app")).then(() => "app" as const, settled),
      page
        .getByRole("alert")
        .filter({ hasText: "Too many attempts" })
        .waitFor()
        .then(() => "rate-limited" as const, settled),
    ]);
    if (outcome === "timeout") throw new Error("sign-in neither reached the dashboard nor the two-factor page");
    if (outcome !== "rate-limited") return outcome;
    if (attempt >= 3) throw new Error("sign-in kept hitting the rate limit");
    await page.waitForTimeout(RATE_LIMIT_WINDOW_MS);
  }
}

/** Sign-in through the auth API for the cleanup; returns the JSON body (with `twoFactorRedirect` when a code is due). */
async function apiSignIn(api: APIRequestContext): Promise<{ twoFactorRedirect?: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const response = await api.post("/api/auth/sign-in/email", { data: { email: EMAIL, password: PASSWORD } });
    if (response.ok()) return (await response.json()) as { twoFactorRedirect?: boolean };
    if (response.status() === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WINDOW_MS));
      continue;
    }
    throw new Error(`cleanup sign-in failed: ${response.status()} ${await response.text()}`);
  }
}

/**
 * Brings the e2e account back to "no two-factor" whatever state the test left behind: signs in through
 * the API, completes the second factor with the captured secret when asked, and disables two-factor.
 */
async function disableTwoFactorViaApi(playwright: PlaywrightWorkerArgs["playwright"], secret: string | null) {
  const api = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  try {
    const signIn = await apiSignIn(api);
    if (signIn.twoFactorRedirect) {
      if (!secret) throw new Error(`two-factor is enabled for ${EMAIL} but the secret was not captured — run SEED_DEMO=true pnpm db:seed to reset the account`);
      const verify = await api.post("/api/auth/two-factor/verify-totp", { data: { code: totp(secret) } });
      if (!verify.ok()) throw new Error(`cleanup verify-totp failed: ${verify.status()} ${await verify.text()}`);
    }
    const session = await api.get("/api/auth/get-session");
    const body = (await session.json()) as { user?: { twoFactorEnabled?: boolean } } | null;
    if (!body?.user?.twoFactorEnabled) return;
    const disable = await api.post("/api/auth/two-factor/disable", { data: { password: PASSWORD } });
    if (!disable.ok()) throw new Error(`cleanup disable failed: ${disable.status()} ${await disable.text()}`);
  } finally {
    await api.dispose();
  }
}

/* ------------------------------------------------------------------ the flow */

test.describe("security settings — two-factor enrolment", () => {
  // own, signed-out context: the flow signs in as the dedicated account, never as the stored owner session of auth.setup.ts
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: "serial" });

  /** captured from the wizard's manual key; the cleanup needs it to pass the second factor */
  let secret: string | null = null;
  /** true from the first enrolment step until the test has seen the account disabled again */
  let needsCleanup = false;

  // the cleanup signs in through the API (one more attempt against the shared 3-per-10-s limit), so it
  // runs only when the test did not finish with the account disabled itself
  test.afterAll(async ({ playwright }) => {
    if (!needsCleanup) return;
    await disableTwoFactorViaApi(playwright, secret);
  });

  test("enables two-factor with a generated code, signs in again through the two-factor form and disables it", async ({ page }) => {
    test.setTimeout(180_000);
    // the generator agrees with the RFC 6238 SHA-1 test vector (secret "12345678901234567890", T = 59 s → 94287082)
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");

    // --- status before: not enabled, reachable through the settings sub-navigation
    expect(await signInWithForm(page)).toBe("app");
    await page.goto(SECURITY);
    await expect(page.locator("h1")).toHaveText("Security");
    await expect(page.getByTestId("settings-subnav-security")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("security-status")).toHaveAttribute("data-enabled", "false");

    // --- enable: password → QR + manual key → code → backup codes
    needsCleanup = true;
    await page.getByTestId("security-enable").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("security-step-password")).toBeVisible();
    await dialog.getByTestId("security-password").fill(PASSWORD);
    await dialog.getByTestId("security-password-submit").click();

    await expect(dialog.getByTestId("security-step-scan")).toBeVisible();
    await expect(dialog.getByTestId("security-qr")).toBeVisible();
    const manualKey = dialog.getByTestId("security-manual-key");
    secret = await manualKey.getAttribute("data-secret");
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    // the visible key is the same secret in groups of four
    expect(((await manualKey.textContent()) ?? "").replace(/\s+/g, "")).toBe(secret);
    await dialog.getByTestId("security-scan-next").click();

    await expect(dialog.getByTestId("security-step-verify")).toBeVisible();
    await dialog.getByTestId("security-code").fill(totp(secret!));
    await dialog.getByTestId("security-verify-submit").click();

    await expect(dialog.getByTestId("security-step-backup")).toBeVisible();
    const codes = dialog.getByTestId("security-backup-code");
    await expect(codes).toHaveCount(10);
    for (const code of await codes.allTextContents()) expect(code).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
    const done = dialog.getByTestId("security-done");
    await expect(done).toBeDisabled();
    await dialog.getByTestId("security-backup-confirm").check();
    await expect(done).toBeEnabled();
    await done.click();

    // --- status after: enabled, ten codes left, notice announced
    await expect(page.getByTestId("security-notice")).toContainText("Two-factor authentication is enabled.");
    await expect(page.getByTestId("security-status")).toHaveAttribute("data-enabled", "true");
    await expect(page.getByTestId("security-backup-remaining")).toHaveText("10 backup codes left");
    await expect(page.getByTestId("security-disable")).toBeVisible();
    await expect(page.getByTestId("security-regenerate")).toBeVisible();

    // --- account menu: the Security shortcut, then log out through the menu
    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    await expect(menu.getByRole("menuitem", { name: "Security" })).toHaveAttribute("href", SECURITY);
    await menu.getByRole("menuitem", { name: "Log out" }).click();
    await page.waitForURL(/\/login/);

    // --- sign in again: password, then the existing two-factor form with a fresh code
    expect(await signInWithForm(page)).toBe("two-factor");
    await expect(page.locator("h1")).toHaveText("Two-factor authentication");
    await page.locator("input[name=code]").fill(totp(secret!));
    await page.locator("form button[type=submit]").first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/app"));
    await expect(page.getByTestId("app-shell")).toBeVisible();

    // --- disable with the password so the account returns to its initial state
    await page.goto(SECURITY);
    await expect(page.getByTestId("security-status")).toHaveAttribute("data-enabled", "true");
    await page.getByTestId("security-disable").click();
    const disable = page.getByRole("dialog");
    await disable.getByTestId("security-disable-password").fill(PASSWORD);
    await expect(disable.getByTestId("security-disable-submit")).toBeDisabled();
    await disable.getByTestId("security-disable-confirm").check();
    await disable.getByTestId("security-disable-submit").click();
    await expect(page.getByTestId("security-notice")).toContainText("Two-factor authentication is disabled.");
    await expect(page.getByTestId("security-status")).toHaveAttribute("data-enabled", "false");
    await expect(page.getByTestId("security-enable")).toBeVisible();
    needsCleanup = false;
  });
});
