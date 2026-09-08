import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test as base,
  type Browser,
  type Page,
  type PlaywrightWorkerArgs,
} from "@playwright/test";

/**
 * Track Operations console (docs/17-operations-console.md). Runs against the same server as the other specs;
 * the server must trust its own origin (HOST_MARKETING / HOST_APP on the e2e port) and run with
 * OPS_REQUIRE_2FA=false, because the seeded operator (`ops@acme.test`, PLATFORM_ADMIN, `SEED_DEMO=true pnpm
 * db:seed`) has no two-factor enrolment. The operator signs in once through the auth API (better-auth allows
 * 3 sign-ins per 10 s per IP; the retry below waits the window out) and keeps its own storage state in
 * `.auth/ops.json`; the customer owner comes from the stored session of `auth.setup.ts`.
 *
 * Covered: the customer owner is refused on /ops; every module page renders for the operator (one h1, no raw
 * translation keys, viewport-fixed shell, no serious/critical axe violations at 1440 and 375 px); feature
 * flag and announcement creation with the banner in the customer dashboard; the break-glass round trip
 * (request → self-approval as the single admin → read-only tenant view with banner and refused mutation →
 * leave → revoke); tenant suspension and its notice for the owner; one audited CSV export.
 */

const OPS_AUTH_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".auth/ops.json");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OPS_EMAIL = process.env.E2E_OPS_EMAIL ?? "ops@acme.test";
const OPS_PASSWORD = process.env.E2E_OPS_PASSWORD ?? "Demo-Password-123!";
/** The seeded demo organisation the owner session belongs to (packages/db/src/cli/seed.ts). */
const ORG_SLUG = "acme-demo";
const SUSPENSION_NOTICE = "This organisation is currently suspended by Track";

const stamp = Date.now().toString(36);
const FLAG_KEY = `e2e.smoke_${stamp}`;
const ANNOUNCEMENT_PREFIX = "E2E announcement";
const ANNOUNCEMENT_TITLE = `${ANNOUNCEMENT_PREFIX} ${stamp}`;

/** Module pages of the console (docs/17 §2 plus the sub-pages of Controls, Inbox, Users and Content). */
const MODULE_PATHS = [
  "/ops",
  "/ops/organisations",
  "/ops/break-glass",
  "/ops/health",
  "/ops/revenue",
  "/ops/controls",
  "/ops/controls/flags",
  "/ops/controls/announcements",
  "/ops/controls/announcements/new",
  "/ops/inbox",
  "/ops/inbox/alerts",
  "/ops/inbox/knowledge",
  "/ops/inbox/privacy",
  "/ops/growth",
  "/ops/audit",
  "/ops/users",
  "/ops/users/directory",
  "/ops/content",
  "/ops/content/feedback",
  "/ops/content/freshness",
  "/ops/content/integrations",
  "/ops/content/paths",
] as const;

/**
 * A message that next-intl could not resolve is rendered as its full path (`opsControls.flags.title`). Audit
 * action names (`ops.break_glass.open`) contain underscores and never match; flag keys are not namespaced.
 */
const RAW_KEY =
  /\b(ops|opsAudit|opsBreakGlass|opsContent|opsControls|opsGrowth|opsHealth|opsInbox|opsOrganisations|opsRevenue|opsUsers|shell)(\.[a-zA-Z][a-zA-Z0-9]*)+\b/;

const test = base.extend<{ ops: Page }>({
  /** Operator page with its own stored session (written once per worker by the sign-in below). */
  ops: async ({ browser }, provide) => {
    const context = await browser.newContext({ storageState: OPS_AUTH_FILE, locale: "en-US" });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

async function signInOperator(playwright: PlaywrightWorkerArgs["playwright"]) {
  const api = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await api.post("/api/auth/sign-in/email", {
        data: { email: OPS_EMAIL, password: OPS_PASSWORD },
      });
      if (response.ok()) break;
      if (response.status() === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        continue;
      }
      throw new Error(`operator sign-in failed: ${response.status()} ${await response.text()}`);
    }
    await api.storageState({ path: OPS_AUTH_FILE });
  } finally {
    await api.dispose();
  }
}

async function withOperator<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ storageState: OPS_AUTH_FILE, locale: "en-US" });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Ends every break-glass row of the operator for the demo organisation (active grants and open requests). */
async function endBreakGlassRows(page: Page) {
  for (let i = 0; i < 4; i++) {
    await page.goto("/ops/break-glass");
    const revoke = page.getByTestId("break-glass-revoke").first();
    if (await revoke.isVisible()) {
      await revoke.click();
      await page.getByRole("dialog").getByRole("button", { name: "Revoke access" }).click();
      await expect(page.getByTestId("break-glass-notice")).toContainText("Access revoked.");
      continue;
    }
    const withdraw = page.getByRole("button", { name: "Withdraw", exact: true }).first();
    if (await withdraw.isVisible()) {
      await withdraw.click();
      await page.getByRole("dialog").getByRole("button", { name: "Withdraw request" }).click();
      await expect(page.getByTestId("break-glass-notice")).toContainText("Request withdrawn.");
      continue;
    }
    return;
  }
}

async function liftSuspension(page: Page) {
  await page.goto("/ops/controls");
  const row = page.getByTestId("ops-suspended-row").filter({ hasText: ORG_SLUG });
  if (!(await row.isVisible())) return;
  await row.getByRole("button", { name: "Lift suspension" }).click();
  await page.getByTestId("ops-suspend-confirm").click();
  await expect(page.getByText("Suspension lifted.")).toBeVisible();
}

/** Revokes every announcement this spec created (this run's and any left behind by an interrupted earlier run). */
async function revokeAnnouncements(page: Page) {
  await page.goto("/ops/controls/announcements");
  const candidates = page
    .getByTestId("ops-announcement-row")
    .filter({ hasText: ANNOUNCEMENT_PREFIX })
    .filter({ has: page.getByTestId("ops-announcement-revoke") });
  for (let i = 0; i < 10; i++) {
    const remaining = await candidates.count();
    if (remaining === 0) return;
    await candidates.first().getByTestId("ops-announcement-revoke").click();
    await page.getByTestId("ops-announcement-revoke-confirm").click();
    await expect(page.getByText("Announcement revoked.")).toBeVisible();
    await expect(candidates).toHaveCount(remaining - 1);
  }
}

async function expectConsolePage(page: Page, pathname: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
  const response = await page.goto(pathname);
  expect(response?.status(), `${pathname} @ ${width}`).toBe(200);
  await expect(page.getByTestId("ops-shell"), `${pathname} @ ${width}`).toBeVisible();
  await expect(page.locator("h1"), `${pathname} @ ${width}`).toHaveCount(1);
  await expect(
    page.getByRole("alert").filter({ hasText: "403" }),
    `${pathname} @ ${width}`,
  ).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text.match(RAW_KEY)?.[0], `${pathname} @ ${width}: raw translation key`).toBeUndefined();
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="ops-shell"]')!;
    const main = document.querySelector<HTMLElement>('[data-testid="ops-main"]')!;
    return {
      shellHeight: Math.round(shell.getBoundingClientRect().height),
      innerHeight: window.innerHeight,
      documentFits: document.documentElement.scrollHeight <= window.innerHeight + 1,
      documentWidth: document.documentElement.scrollWidth,
      mainScrolls: getComputedStyle(main).overflowY,
    };
  });
  expect(
    Math.abs(metrics.shellHeight - metrics.innerHeight),
    `${pathname} @ ${width}: shell height`,
  ).toBeLessThanOrEqual(1);
  expect(metrics.documentFits, `${pathname} @ ${width}: document scrolls`).toBe(true);
  expect(metrics.documentWidth, `${pathname} @ ${width}: horizontal overflow`).toBeLessThanOrEqual(
    width,
  );
  expect(metrics.mainScrolls, `${pathname} @ ${width}`).toBe("auto");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`),
    `${pathname} @ ${width}: axe`,
  ).toEqual([]);
}

test.beforeAll(async ({ playwright }) => {
  await signInOperator(playwright);
});

test.describe("access", () => {
  test("the customer owner is refused on /ops and on the audit export", async ({ page }) => {
    await page.goto("/ops");
    // Next's route announcer is a second (empty) alert region
    const notice = page.getByRole("alert").filter({ hasText: "403" });
    await expect(notice).toBeVisible();
    await expect(notice.locator("h1")).toHaveText("No platform access");
    await expect(page.getByTestId("ops-shell")).toHaveCount(0);
    const exported = await page.request.get("/ops/audit/export");
    expect(exported.status()).toBe(403);
    expect(await exported.json()).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      reason: "no_role",
    });
  });

  test("the operator's dashboard account menu links to Track Operations only for platform roles", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Track Operations" })).toHaveCount(0);
  });
});

test.describe("module pages", () => {
  for (const pathname of MODULE_PATHS) {
    test(`${pathname} renders for the operator at 1440 and 375 px`, async ({ ops }) => {
      test.setTimeout(120_000);
      await expectConsolePage(ops, pathname, 1440);
      await expectConsolePage(ops, pathname, 375);
    });
  }

  test("the detail pages reachable from the lists render too", async ({ ops }) => {
    test.setTimeout(240_000);
    const details: string[] = [];
    for (const [list, selector] of [
      ["/ops/organisations", "main a[href^='/ops/organisations/']"],
      ["/ops/controls/flags", "main a[href^='/ops/controls/flags/']"],
      ["/ops/users", "main a[href^='/ops/users/']"],
      ["/ops/inbox", "main a[href^='/ops/inbox/']"],
    ] as const) {
      await ops.goto(list);
      const hrefs = await ops
        .locator(selector)
        .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
      const detail = hrefs.find(
        (href) =>
          !MODULE_PATHS.includes(href as (typeof MODULE_PATHS)[number]) &&
          !href.includes("/export"),
      );
      if (detail) details.push(detail);
    }
    // the seeded organisation always exists, so at least its detail page is exercised
    expect(details.some((href) => href.startsWith("/ops/organisations/"))).toBe(true);
    for (const pathname of details) {
      await expectConsolePage(ops, pathname, 1440);
      await expectConsolePage(ops, pathname, 375);
    }
  });
});

test.describe("operator flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    // a failed earlier run must not block the round trips below
    await withOperator(browser, async (page) => {
      await endBreakGlassRows(page);
      await liftSuspension(page);
    });
  });

  test.afterAll(async ({ browser }) => {
    await withOperator(browser, async (page) => {
      await endBreakGlassRows(page);
      await liftSuspension(page);
      await revokeAnnouncements(page);
    });
  });

  test("creates a feature flag with its global default", async ({ ops }) => {
    await ops.goto("/ops/controls/flags");
    const form = ops.getByTestId("ops-flag-create");
    await form.locator("input[name=key]").fill(FLAG_KEY);
    await form.locator("textarea[name=description]").fill("E2E smoke flag; not read by the app.");
    await form.locator("button[type=submit]").click();
    await expect(ops.getByText("Flag created.")).toBeVisible();
    const row = ops.getByTestId("ops-flag-row").filter({ hasText: FLAG_KEY });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Off");
    await expect(row).toContainText("manual");
    await ops.goto(`/ops/controls/flags/${encodeURIComponent(FLAG_KEY)}`);
    await expect(ops.getByTestId("ops-flag-detail")).toBeVisible();
    await expect(ops.getByTestId("ops-flag-default")).toContainText("Off");
  });

  test("creates an announcement that the customer owner sees in the dashboard banner", async ({
    ops,
    page,
  }) => {
    await ops.goto("/ops/controls/announcements/new");
    const form = ops.getByTestId("ops-announcement-form");
    await form.locator("select[name=severity]").selectOption("warn");
    await form.locator("input[name=title_en]").fill(ANNOUNCEMENT_TITLE);
    await form
      .locator("textarea[name=body_en]")
      .fill("Smoke test of the platform announcements; safe to ignore.");
    // empty start = now (UTC), no end, no audience = every organisation
    await form.locator("input[name=startsAt]").fill("");
    await ops.getByTestId("ops-announcement-submit").click();
    await expect(ops.getByText("Announcement created.")).toBeVisible();
    await ops.goto("/ops/controls/announcements");
    const row = ops.getByTestId("ops-announcement-row").filter({ hasText: ANNOUNCEMENT_TITLE });
    await expect(row).toHaveAttribute("data-status", "active");
    await expect(row).toContainText("Every organisation");

    await page.goto("/app");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const banner = page.getByTestId("announcements-banner");
    await expect(banner).toContainText(ANNOUNCEMENT_TITLE);
    await expect(banner).toContainText("Smoke test of the platform announcements");
  });

  test("break-glass: request, self-approval as the single admin, read-only tenant view, leave and revoke", async ({
    ops,
    page,
  }) => {
    test.setTimeout(120_000);
    await ops.goto("/ops/break-glass");
    const form = ops.getByTestId("break-glass-request-form");
    const organizationId = await form
      .locator("select[name=organizationId] option", { hasText: `(${ORG_SLUG})` })
      .getAttribute("value");
    expect(organizationId).toBeTruthy();
    await form.locator("select[name=organizationId]").selectOption(organizationId!);
    await form
      .locator("textarea[name=reason]")
      .fill("E2E round trip: verify the read-only support view of the demo organisation.");
    await form.locator("input[name=ticketRef]").fill(`SUP-E2E-${stamp}`);
    await form.locator("select[name=durationMinutes]").selectOption("15");
    await form.getByRole("button", { name: "Request read-only access" }).click();
    await expect(ops.getByText("Request filed.")).toBeVisible();

    // single admin: the approval is allowed with the ticket reference and recorded as self-approved
    const queueRow = ops
      .getByRole("table", { name: "Open break-glass requests" })
      .getByRole("row")
      .filter({ hasText: ORG_SLUG });
    await expect(queueRow).toContainText("self-approved");
    await queueRow.getByTestId("break-glass-approve").click();
    await ops.getByRole("dialog").getByRole("button", { name: "Approve access" }).click();
    // the approved request leaves the queue; the outcome (and the owner e-mail result) stays in the page-level notice
    const notice = ops.getByTestId("break-glass-notice");
    await expect(notice).toContainText("Access approved");
    await expect(notice).toContainText(/owner/);
    const activeRow = ops
      .getByRole("table", { name: "Currently active break-glass grants" })
      .getByRole("row")
      .filter({ hasText: ORG_SLUG });
    await expect(activeRow).toContainText("self-approved");
    await expect(activeRow.getByTestId("break-glass-countdown")).toContainText("remaining");
    const grantId = (await activeRow.locator("code").textContent())?.trim() ?? "";
    expect(grantId).toMatch(/^[0-9a-f-]{36}$/i);

    // the customer's shell tells the members that a read-only grant is active
    await page.goto("/app");
    const customerBanner = page.getByTestId("support-access-banner");
    await expect(customerBanner).toContainText(
      "Track support has read-only access to this organisation",
    );
    await expect(customerBanner).toContainText(grantId);
    await expect(customerBanner.getByRole("link", { name: "Open audit log" })).toBeVisible();

    // the operator opens the tenant read-only under the grant
    await activeRow.getByTestId("break-glass-open").click();
    await ops.waitForURL(/\/app(\/|$|\?)/);
    await expect(ops.getByTestId("app-shell")).toBeVisible();
    const banner = ops.getByTestId("support-access-banner");
    await expect(banner).toContainText("Support access active until");
    await expect(banner).toContainText(grantId);
    await expect(banner).toContainText("changes are refused");
    // a mutation attempt inside the support session is refused with the read-only reason (403)
    const refused = await ops.request.post("/api/ai/chat", {
      data: { siteId: "00000000-0000-0000-0000-000000000000", message: "hello" },
      headers: { origin: BASE_URL, "content-type": "application/json" },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      reason: "read_only_support_access",
    });
    // the read-only view still renders module pages
    await ops.goto("/app/events");
    await expect(ops.locator("h1")).toHaveCount(1);
    await expect(ops.getByTestId("support-access-banner")).toBeVisible();

    // leave the support view (member nowhere → back to the console), then revoke
    await ops.getByTestId("support-access-leave").click();
    await ops.waitForURL(/\/ops\/break-glass/);
    const stillActive = ops
      .getByRole("table", { name: "Currently active break-glass grants" })
      .getByRole("row")
      .filter({ hasText: ORG_SLUG });
    await stillActive.getByTestId("break-glass-revoke").click();
    await ops.getByRole("dialog").getByRole("button", { name: "Revoke access" }).click();
    await expect(ops.getByTestId("break-glass-notice")).toContainText("Access revoked.");
    await expect(ops.getByTestId("break-glass-revoke")).toHaveCount(0);
    await expect(ops.getByText("No active grant")).toBeVisible();

    // the customer's banner disappears with the next navigation
    await page.goto("/app");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await expect(page.getByTestId("support-access-banner")).toHaveCount(0);
  });

  test("suspends the organisation (the owner sees the notice) and lifts the suspension", async ({
    ops,
    page,
  }) => {
    await ops.goto("/ops/controls");
    const section = ops.getByTestId("ops-suspensions");
    await section.locator("input[name=ref]").fill(ORG_SLUG);
    await section.getByRole("button", { name: "Look up" }).click();
    await expect(ops.getByTestId("ops-suspend-found")).toContainText(ORG_SLUG);
    await ops.getByTestId("ops-suspend-open").click();
    const dialog = ops.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .locator("textarea[name=reason]")
      .fill(`E2E suspension round trip SUP-E2E-${stamp}`);
    await ops.getByTestId("ops-suspend-confirm").click();
    await expect(ops.getByText("Organisation suspended.")).toBeVisible();
    const row = ops.getByTestId("ops-suspended-row").filter({ hasText: ORG_SLUG });
    await expect(row).toBeVisible();

    // the owner: every dashboard page answers with the localized notice, the API with 403
    await page.goto("/app");
    await expect(page.getByText(SUSPENSION_NOTICE)).toBeVisible();
    const api = await page.request.get("/api/ai/chat?siteId=00000000-0000-0000-0000-000000000000");
    expect(api.status()).toBe(403);
    expect(await api.json()).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      reason: "organization_suspended",
    });

    await row.getByRole("button", { name: "Lift suspension" }).click();
    await ops.getByTestId("ops-suspend-confirm").click();
    await expect(ops.getByText("Suspension lifted.")).toBeVisible();
    await expect(ops.getByTestId("ops-suspended-row").filter({ hasText: ORG_SLUG })).toHaveCount(0);

    await page.goto("/app");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await expect(page.getByText(SUSPENSION_NOTICE)).toHaveCount(0);
  });

  test("exports the audit log as CSV", async ({ ops }) => {
    await ops.goto("/ops/audit");
    const href = await ops.getByTestId("ops-audit-export").getAttribute("href");
    expect(href).toMatch(/^\/ops\/audit\/export/);
    const response = await ops.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("audit-log-");
    const csv = await response.text();
    expect(csv.split("\n")[0]).toContain("action");
    // the export itself is audited and appears in the explorer
    await ops.goto("/ops/audit");
    await expect(ops.getByText("platform.audit.export").first()).toBeVisible();
  });
});
