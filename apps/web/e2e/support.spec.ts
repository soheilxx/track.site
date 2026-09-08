import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test as base,
  type Page,
  type PlaywrightWorkerArgs,
} from "@playwright/test";

/**
 * Support desk (docs/18-support-desk.md): one ticket travels from the customer portal through the operator
 * console and back. Runs against the same server as the other specs (`support` project, after `ops`), which
 * must trust its own origin (HOST_MARKETING / HOST_APP on the e2e port) and run with
 *
 *   OPS_REQUIRE_2FA=false         the seeded operators have no two-factor enrolment
 *   AI_DEV_FIXTURES=1             `/api/support/dev-fixture` on a production build (the SLA breach fixture)
 *   RESEND_WEBHOOK_SECRET=…       the Svix secret the spec signs its simulated inbound webhook with
 *                                 (E2E_RESEND_WEBHOOK_SECRET here, default `whsec_test`)
 *   SUPPORT_AUTHSERV_ID=e2e.mta   the authserv-id of the `Authentication-Results` header the simulated mail
 *                                 carries (E2E_SUPPORT_AUTHSERV_ID); without it the desk treats the mail as
 *                                 unauthenticated and opens a new ticket instead of appending (docs/18 §4 step 6)
 *
 * and no mail transport (`SMTP_URL` / `RESEND_API_KEY` empty), so replies land in the local outbox
 * `apps/web/.local/mail`, which the spec reads. Accounts (`SEED_DEMO=true pnpm db:seed`): the customer owner
 * (`owner@acme.test`, stored session of `auth.setup.ts`), the platform admin `ops@acme.test` (agent one) and the
 * platform support agent `support@acme.test` (agent two, `PLATFORM_SUPPORT`) — both operators sign in once
 * through the auth API (3 sign-ins per 10 s; the retry waits the window out).
 *
 * Covered, in order: the owner opens a ticket with an attachment from /app/support; agent one finds it in the
 * Unassigned queue, assigns it to themself, sees agent two's presence banner (and vice versa), applies a macro
 * and replies (the reply is "Sent" and written to the outbox with the ticket's plus address as Reply-To), sets
 * pending (SLA paused); the owner replies from the portal (status open, SLA resumed); a correctly signed
 * `email.received` webhook from the owner's address to the plus address appends to the ticket; a fixture
 * ticket received a month ago is marked breached by one run of the worker's `support-sla` job (executed through
 * a throw-away tsx script, deleted afterwards); the reports page renders; the support agent is refused on
 * Settings and Controls; axe serious/critical is empty on the queue, the ticket, the portal list and the portal
 * ticket at 1440 and 375 px. Tickets created by a run stay in the database (agents cannot delete tickets; each
 * run uses its own subjects).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPS_AUTH_FILE = path.resolve(HERE, ".auth/ops.json");
const SUPPORT_AUTH_FILE = path.resolve(HERE, ".auth/support.json");
/** the local outbox of `apps/web/src/server/mail.ts` (`process.cwd()` of `next start` = apps/web) */
const OUTBOX_DIR = path.resolve(HERE, "../.local/mail");
const WORKER_DIR = path.resolve(HERE, "../../worker");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OPS_EMAIL = process.env.E2E_OPS_EMAIL ?? "ops@acme.test";
const OPS_PASSWORD = process.env.E2E_OPS_PASSWORD ?? "Demo-Password-123!";
const OPS_NAME = "Otto Operator";
const SUPPORT_EMAIL = process.env.E2E_SUPPORT_EMAIL ?? "support@acme.test";
const SUPPORT_PASSWORD = process.env.E2E_SUPPORT_PASSWORD ?? "Demo-Password-123!";
const SUPPORT_NAME = "Sam Support";
const OWNER_EMAIL = process.env.E2E_EMAIL ?? "owner@acme.test";
const WEBHOOK_SECRET = process.env.E2E_RESEND_WEBHOOK_SECRET ?? "whsec_test";
const AUTHSERV_ID = process.env.E2E_SUPPORT_AUTHSERV_ID ?? "e2e.mta";

const stamp = Date.now().toString(36);
const SUBJECT = `E2E support round trip ${stamp}`;
const BODY = `Our purchase events stopped arriving after the last release (${stamp}). Screenshot attached.`;
const ATTACHMENT_NAME = `e2e-screenshot-${stamp}.png`;
/** 1 × 1 transparent PNG */
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const CUSTOMER_REPLY = `Thanks — here is the site id you asked for: A7K2Q9 (${stamp}).`;
const WEBHOOK_TEXT = `Replying from my mail client instead of the portal (${stamp}).`;
const BREACH_SUBJECT = `E2E SLA breach fixture ${stamp}`;

/**
 * A message that next-intl could not resolve is rendered as its full path (`supportTicket.composer.title`).
 * Audit action names (`support.ticket.auto_assign`) contain underscores and never match.
 */
const RAW_KEY =
  /\b(ops|opsAudit|opsInbox|opsOrganisations|shell|support|supportTickets|supportTicket|supportMacros|supportSla|supportPortal|supportReports|supportNotifications)(\.[a-zA-Z][a-zA-Z0-9]*)+\b/;

const test = base.extend<{ ops: Page; agent: Page }>({
  /** agent one: the platform admin with its own stored session */
  ops: async ({ browser }, provide) => {
    const context = await browser.newContext({ storageState: OPS_AUTH_FILE, locale: "en-US" });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
  /** agent two: the platform support agent (second browser context) */
  agent: async ({ browser }, provide) => {
    const context = await browser.newContext({ storageState: SUPPORT_AUTH_FILE, locale: "en-US" });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

async function signIn(playwright: PlaywrightWorkerArgs["playwright"], email: string, password: string, file: string) {
  const api = await playwright.request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await api.post("/api/auth/sign-in/email", { data: { email, password } });
      if (response.ok()) break;
      if (response.status() === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        continue;
      }
      throw new Error(`sign-in of ${email} failed: ${response.status()} ${await response.text()}`);
    }
    await api.storageState({ path: file });
  } finally {
    await api.dispose();
  }
}

async function axeSeriousOrCritical(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

/** A console page: 200, the operator shell, one h1, no raw keys, viewport-fixed shell, no horizontal overflow, axe. */
async function expectConsolePage(page: Page, pathname: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
  const response = await page.goto(pathname);
  expect(response?.status(), `${pathname} @ ${width}`).toBe(200);
  await expect(page.getByTestId("ops-shell"), `${pathname} @ ${width}`).toBeVisible();
  await expect(page.locator("main [aria-busy='true']"), `${pathname} @ ${width}`).toHaveCount(0);
  await expect(page.locator("h1"), `${pathname} @ ${width}`).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "403" }), `${pathname} @ ${width}`).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text.match(RAW_KEY)?.[0], `${pathname} @ ${width}: raw translation key`).toBeUndefined();
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="ops-shell"]')!;
    return {
      shellHeight: Math.round(shell.getBoundingClientRect().height),
      innerHeight: window.innerHeight,
      documentFits: document.documentElement.scrollHeight <= window.innerHeight + 1,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(Math.abs(metrics.shellHeight - metrics.innerHeight), `${pathname} @ ${width}: shell height`).toBeLessThanOrEqual(1);
  expect(metrics.documentFits, `${pathname} @ ${width}: document scrolls`).toBe(true);
  expect(metrics.documentWidth, `${pathname} @ ${width}: horizontal overflow`).toBeLessThanOrEqual(width);
  expect(await axeSeriousOrCritical(page), `${pathname} @ ${width}: axe`).toEqual([]);
}

/** A customer dashboard page: 200, the app shell, one h1, no raw keys, no horizontal overflow, axe. */
async function expectDashboardPage(page: Page, pathname: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
  const response = await page.goto(pathname);
  expect(response?.status(), `${pathname} @ ${width}`).toBe(200);
  await expect(page.getByTestId("app-shell"), `${pathname} @ ${width}`).toBeVisible();
  await expect(page.locator("main [aria-busy='true']"), `${pathname} @ ${width}`).toHaveCount(0);
  await expect(page.locator("h1"), `${pathname} @ ${width}`).toHaveCount(1);
  const text = await page.locator("body").innerText();
  expect(text.match(RAW_KEY)?.[0], `${pathname} @ ${width}: raw translation key`).toBeUndefined();
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth, `${pathname} @ ${width}: horizontal overflow`).toBeLessThanOrEqual(width);
  expect(await axeSeriousOrCritical(page), `${pathname} @ ${width}: axe`).toEqual([]);
}

/** The ticket page of the operator console: `#<number> · <subject>` in the h1 → the number. */
async function ticketNumberOf(page: Page): Promise<number> {
  const heading = (await page.locator("h1").textContent()) ?? "";
  const match = heading.match(/#(\d+)/);
  expect(match, `ticket number in "${heading}"`).not.toBeNull();
  return Number(match![1]);
}

interface OutboxMail {
  from: string;
  to: string;
  subject: string;
  replyTo?: string;
  text: string;
  html?: string;
  messageId?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; contentType: string | null; size: number }>;
  at: string;
}

/** Mails the server wrote to its local outbox after `since` (newest first). */
function outboxSince(since: number): OutboxMail[] {
  if (!existsSync(OUTBOX_DIR)) return [];
  return readdirSync(OUTBOX_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(OUTBOX_DIR, name))
    .filter((file) => statSync(file).mtimeMs >= since - 2_000)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .map((file) => JSON.parse(readFileSync(file, "utf8")) as OutboxMail);
}

/** Svix signature of a webhook payload (docs/18 §4 step 1): HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 secret after `whsec_`. */
function svixHeaders(rawBody: string, secret: string): Record<string, string> {
  const id = `msg_e2e_${stamp}_${Date.now().toString(36)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`, "content-type": "application/json" };
}

/**
 * Runs the worker's `support-sla` job once (`apps/worker/src/jobs/support-sla.ts`) through a throw-away tsx
 * script inside the worker package (so `@track-site/*` and the worker's `.env` resolve like for the worker
 * itself); the script is removed again whatever happens. Returns the job's summary.
 */
function runSupportSlaJobOnce(): { evaluated: number; warnings: number; breaches: number; autoClosed: number } {
  const tsxCli = path.join(WORKER_DIR, "node_modules/tsx/dist/cli.mjs");
  expect(existsSync(tsxCli), `tsx of the worker package at ${tsxCli}`).toBe(true);
  const script = path.join(WORKER_DIR, `.e2e-support-sla-${stamp}.ts`);
  writeFileSync(
    script,
    [
      'import { config as loadDotenv } from "dotenv";',
      'import path from "node:path";',
      'import { createWorkerContext } from "./src/context.ts";',
      'import { workerEnv } from "./src/env.ts";',
      'import { runSupportSla } from "./src/jobs/support-sla.ts";',
      'loadDotenv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });',
      "loadDotenv({ quiet: true });",
      "const ctx = await createWorkerContext(workerEnv());",
      "try {",
      "  const summary = await runSupportSla(ctx);",
      '  process.stdout.write(`SUPPORT_SLA_SUMMARY ${JSON.stringify(summary)}\\n`);',
      "} finally {",
      "  await ctx.queue.close();",
      "  await ctx.eventStore.close();",
      "  await ctx.pool.end();",
      "}",
      "",
    ].join("\n"),
  );
  try {
    const output = execFileSync(process.execPath, [tsxCli, script], { cwd: WORKER_DIR, env: process.env, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
    const line = output.split(/\r?\n/).find((l) => l.startsWith("SUPPORT_SLA_SUMMARY "));
    expect(line, `job summary in\n${output}`).toBeDefined();
    return JSON.parse(line!.slice("SUPPORT_SLA_SUMMARY ".length));
  } finally {
    rmSync(script, { force: true });
  }
}

let ticketId = "";
let ticketNumber = 0;
let replyTo = "";
let breachTicketId = "";

test.beforeAll(async ({ playwright }) => {
  mkdirSync(path.dirname(OPS_AUTH_FILE), { recursive: true });
  await signIn(playwright, OPS_EMAIL, OPS_PASSWORD, OPS_AUTH_FILE);
  await signIn(playwright, SUPPORT_EMAIL, SUPPORT_PASSWORD, SUPPORT_AUTH_FILE);
});

test.describe("ticket round trip", () => {
  test.describe.configure({ mode: "serial" });

  test("the customer opens a ticket with an attachment from the portal", async ({ page }) => {
    await page.goto("/app/support");
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await page.getByTestId("support-new-link").click();
    await page.waitForURL(/\/app\/support\/new/);
    await page.getByTestId("support-new-subject").fill(SUBJECT);
    await page.getByTestId("support-new-body").fill(BODY);
    await page.locator("input[name=attachments]").setInputFiles({ name: ATTACHMENT_NAME, mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.getByText("1 file selected")).toBeVisible();
    await page.getByTestId("support-new-submit").click();
    await page.waitForURL(/\/app\/support\/[0-9a-f-]{36}\?notice=created/);
    ticketId = new URL(page.url()).pathname.split("/").pop()!;
    expect(ticketId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText("Your ticket was opened.")).toBeVisible();
    await expect(page.locator("h1")).toContainText(SUBJECT);
    await expect(page.getByText(BODY)).toBeVisible();
    // the list shows it as the newest open ticket
    await page.goto("/app/support");
    await expect(page.getByTestId("support-ticket-link").filter({ hasText: SUBJECT })).toBeVisible();
  });

  test("agent one finds it in the Unassigned queue and assigns it to themself", async ({ ops }) => {
    await ops.goto("/ops/support?view=unassigned");
    await expect(ops.getByTestId("ops-shell")).toBeVisible();
    await expect(ops.locator("main [aria-busy='true']")).toHaveCount(0);
    await expect(ops.getByTestId("support-view-unassigned")).toHaveAttribute("aria-current", "page");
    const row = ops.getByTestId("support-ticket-row").filter({ hasText: SUBJECT });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Unassigned");
    await expect(row).toContainText("Dashboard");
    await row.getByRole("link", { name: SUBJECT }).click();
    await ops.waitForURL(new RegExp(`/ops/support/${ticketId}$`));
    ticketNumber = await ticketNumberOf(ops);
    expect(ticketNumber).toBeGreaterThan(0);
    await expect(ops.getByTestId("ticket-status")).toHaveText("New");
    const inbound = ops.getByTestId("ticket-message-inbound");
    await expect(inbound).toHaveCount(1);
    await expect(inbound).toContainText(BODY);
    await expect(inbound.getByTestId("ticket-attachment")).toContainText(ATTACHMENT_NAME);
    await expect(inbound).toContainText("not virus-scanned");
    // the attachment downloads through the permission-checked route
    const href = await inbound.getByTestId("ticket-attachment").getAttribute("href");
    const download = await ops.request.get(href!);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await download.body()).equals(PNG_1PX)).toBe(true);

    await ops.getByTestId("ticket-assign-self").click();
    await expect(ops.getByTestId("ticket-properties")).toContainText("Saved.");
    await ops.reload();
    await expect(ops.getByTestId("ticket-assign-self")).toHaveCount(0);
    await expect(ops.getByTestId("ticket-assignee-select").locator("option:checked")).toContainText(OPS_NAME);
    await expect(ops.getByTestId("ticket-event-assignee")).toHaveCount(1);
    await ops.goto("/ops/support?view=mine");
    await expect(ops.locator("main [aria-busy='true']")).toHaveCount(0);
    await expect(ops.getByTestId("support-ticket-row").filter({ hasText: SUBJECT })).toContainText(/\byou\b/);
  });

  test("both agents on the ticket see each other in the presence banner", async ({ ops, agent }) => {
    test.setTimeout(120_000);
    await ops.goto(`/ops/support/${ticketId}`);
    await expect(ops.getByTestId("ticket-composer")).toBeVisible();
    // agent one's first heartbeat has landed once the page reports it is alone
    await expect(ops.getByText("No other operator is on this ticket.")).toBeAttached();
    await agent.goto(`/ops/support/${ticketId}`);
    await expect(agent.getByTestId("ops-shell")).toBeVisible();
    // agent two's render already lists agent one (server-side presence)
    const seenByTwo = agent.getByTestId("ticket-presence");
    await expect(seenByTwo).toBeVisible();
    await expect(seenByTwo).toContainText(`${OPS_NAME} is viewing this ticket.`);
    await expect(seenByTwo).toContainText("Agree who answers before both of you reply.");
    // agent one learns about agent two with the next heartbeat (15 s cadence)
    const seenByOne = ops.getByTestId("ticket-presence");
    await expect(seenByOne).toBeVisible({ timeout: 40_000 });
    await expect(seenByOne).toContainText(`${SUPPORT_NAME} is viewing this ticket.`);
    // the queue shows the viewers as well
    await agent.goto("/ops/support?view=mine");
    await expect(agent.locator("main [aria-busy='true']")).toHaveCount(0);
    await agent.goto("/ops/support?view=open");
    await expect(agent.locator("main [aria-busy='true']")).toHaveCount(0);
    await expect(agent.getByTestId("support-ticket-row").filter({ hasText: SUBJECT }).getByRole("list", { name: /operator viewing/ })).toBeVisible();
  });

  test("agent one applies a macro and replies; the mail lands in the local outbox with the ticket's plus address", async ({ ops }) => {
    const before = Date.now();
    await ops.goto(`/ops/support/${ticketId}`);
    // option labels carry the category ("Acknowledge receipt · general"): pick the option by its value
    const macroSelect = ops.getByTestId("ticket-macro-select");
    const macroValue = await macroSelect.locator("option", { hasText: "Acknowledge receipt" }).getAttribute("value");
    expect(macroValue, "seeded global macro").toBeTruthy();
    await macroSelect.selectOption(macroValue!);
    await ops.getByTestId("ticket-macro-insert").click();
    const body = ops.getByTestId("ticket-body");
    await expect(body).toHaveValue(new RegExp(`received it as ticket #${ticketNumber}\\b`));
    await expect(body).toHaveValue(/Hello Olivia/);
    await expect(body).toHaveValue(new RegExp(`${OPS_NAME}\\s+Track Support`));
    await ops.getByTestId("ticket-submit").click();
    await expect(ops.getByTestId("ticket-composer").getByText("Reply written to the local outbox")).toBeVisible();
    await ops.reload();
    const outbound = ops.getByTestId("ticket-message-outbound");
    await expect(outbound).toHaveCount(1);
    await expect(outbound).toContainText("Sent");
    await expect(outbound).toContainText(`received it as ticket #${ticketNumber}`);
    await expect(outbound).toContainText(`To: ${OWNER_EMAIL}`);
    await expect(ops.getByTestId("ticket-status")).toHaveText("Open");
    await expect(ops.getByTestId("ticket-event-reply")).toHaveCount(1);
    // first response met
    await expect(ops.getByTestId("ticket-sla").getByTestId("ticket-sla-met")).toHaveCount(1);

    const mail = outboxSince(before).find((m) => m.to === OWNER_EMAIL && m.subject.includes(`[Track #${ticketNumber}]`));
    expect(mail, `outbox mail for ticket #${ticketNumber} in ${OUTBOX_DIR}`).toBeDefined();
    expect(mail!.subject).toBe(`Re: [Track #${ticketNumber}] ${SUBJECT}`);
    expect(mail!.replyTo).toMatch(new RegExp(`^support\\+t${ticketNumber}@[^@\\s]+$`));
    expect(mail!.text).toContain(`received it as ticket #${ticketNumber}`);
    expect(mail!.headers?.["X-Track-Ticket"]).toBe(String(ticketNumber));
    replyTo = mail!.replyTo!;
  });

  test("agent one sets the ticket to pending, which pauses the SLA clock", async ({ ops }) => {
    await ops.goto(`/ops/support/${ticketId}`);
    await expect(ops.getByTestId("ticket-sla-paused")).toHaveCount(0);
    await ops.getByTestId("ticket-status-select").selectOption("pending");
    await expect(ops.getByTestId("ticket-properties")).toContainText("Saved.");
    await ops.reload();
    await expect(ops.getByTestId("ticket-status")).toHaveText("Pending");
    // the pause line of the panel and the paused resolution clock carry the same test id
    await expect(ops.getByTestId("ticket-sla-paused").first()).toBeVisible();
    await expect(ops.getByTestId("ticket-sla")).toContainText("Paused");
    await expect(ops.getByTestId("ticket-event-status")).toHaveCount(2);
  });

  test("the customer replies from the portal: the ticket reopens to open and the SLA clock resumes", async ({ page, ops }) => {
    await page.goto(`/app/support/${ticketId}`);
    await expect(page.locator("h1")).toContainText(`#${ticketNumber}`);
    await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();
    // the agent's reply is visible, the customer never sees internal fields
    await expect(page.getByText(`received it as ticket #${ticketNumber}`)).toBeVisible();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/Assignee|SLA|virus-scanned/);
    await page.getByTestId("support-reply-body").fill(CUSTOMER_REPLY);
    await page.getByTestId("support-reply-send").click();
    await expect(page.getByText("Your reply was added to the ticket.")).toBeVisible();
    await expect(page.getByText(CUSTOMER_REPLY)).toBeVisible();
    await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();

    await ops.goto(`/ops/support/${ticketId}`);
    await expect(ops.getByTestId("ticket-status")).toHaveText("Open");
    await expect(ops.getByTestId("ticket-sla-paused")).toHaveCount(0);
    await expect(ops.getByTestId("ticket-sla")).toContainText("Paused for");
    await expect(ops.getByTestId("ticket-message-inbound")).toHaveCount(2);
    await expect(ops.getByTestId("ticket-message-inbound").last()).toContainText(CUSTOMER_REPLY);
  });

  test("a correctly signed inbound webhook to the plus address appends the mail to the ticket", async ({ ops }) => {
    expect(replyTo, "Reply-To of the agent's mail").toMatch(/^support\+t\d+@/);
    const domain = replyTo.slice(replyTo.indexOf("@") + 1);
    const emailId = `e2e-inbound-${stamp}`;
    const payload = JSON.stringify({
      type: "email.received",
      created_at: new Date().toISOString(),
      data: {
        email_id: emailId,
        from: `Olivia Owner <${OWNER_EMAIL}>`,
        to: [replyTo],
        subject: `Re: [Track #${ticketNumber}] ${SUBJECT}`,
        message_id: `<e2e.${stamp}@acme.test>`,
        // the receiving MTA's verdict; the server trusts it only when SUPPORT_AUTHSERV_ID names the id
        headers: [
          { name: "Authentication-Results", value: `${AUTHSERV_ID}; dmarc=pass header.from=${OWNER_EMAIL.split("@")[1]}` },
          { name: "Message-ID", value: `<e2e.${stamp}@acme.test>` },
        ],
        text: WEBHOOK_TEXT,
        attachments: [],
      },
    });
    // a bad signature is refused before anything is parsed
    const forged = await ops.request.post("/api/support/inbound", { data: payload, headers: { ...svixHeaders(payload, "whsec_" + Buffer.from("wrong-secret").toString("base64")) } });
    expect(forged.status()).toBe(400);
    expect(await forged.json()).toMatchObject({ ok: false, code: "SIGNATURE_INVALID" });

    const response = await ops.request.post("/api/support/inbound", { data: payload, headers: svixHeaders(payload, WEBHOOK_SECRET) });
    const answer = (await response.json()) as Record<string, unknown>;
    expect(response.status(), JSON.stringify(answer)).toBe(200);
    expect(answer, `the mail must append to #${ticketNumber} via ${replyTo} (server needs SUPPORT_AUTHSERV_ID=${AUTHSERV_ID}); domain ${domain}`).toMatchObject({ ok: true, ticketId, number: ticketNumber, created: false });

    // the same delivery again is a duplicate, not a second message
    const again = await ops.request.post("/api/support/inbound", { data: payload, headers: svixHeaders(payload, WEBHOOK_SECRET) });
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, ticketId, created: false });

    await ops.goto(`/ops/support/${ticketId}`);
    const inbound = ops.getByTestId("ticket-message-inbound");
    await expect(inbound).toHaveCount(3);
    await expect(inbound.last()).toContainText(WEBHOOK_TEXT);
    await expect(inbound.last()).toContainText(OWNER_EMAIL);
    await expect(ops.getByTestId("ticket-status")).toHaveText("Open");
  });

  test("one run of the support-sla worker job marks a fixture ticket received a month ago as breached", async ({ ops }) => {
    test.setTimeout(180_000);
    const receivedAt = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const fixture = await ops.request.post("/api/support/dev-fixture", {
      data: {
        from: `Breach Fixture <sla-breach-${stamp}@example.test>`,
        subject: BREACH_SUBJECT,
        text: `This ticket was received a month ago and never answered (${stamp}).`,
        receivedAt,
        eventId: `e2e-breach-${stamp}`,
        emailId: `e2e-breach-${stamp}`,
      },
      headers: { "content-type": "application/json" },
    });
    const created = (await fixture.json()) as { ok: boolean; outcome: { status: string; ticketId?: string; created?: boolean; ticketNumber?: number } };
    expect(fixture.status(), JSON.stringify(created)).toBe(200);
    expect(created.outcome).toMatchObject({ status: "processed", created: true });
    breachTicketId = created.outcome.ticketId!;
    expect(breachTicketId).toMatch(/^[0-9a-f-]{36}$/);

    await ops.goto(`/ops/support/${breachTicketId}`);
    await expect(ops.locator("h1")).toContainText(BREACH_SUBJECT);
    // the clocks already read "breached" from the due times; the job's work is the flag and the event
    await expect(ops.getByTestId("ticket-event-sla_breach")).toHaveCount(0);

    const summary = runSupportSlaJobOnce();
    expect(summary.evaluated).toBeGreaterThanOrEqual(1);
    expect(summary.breaches).toBeGreaterThanOrEqual(1);

    await ops.reload();
    await expect(ops.getByTestId("ticket-breached")).toBeVisible();
    await expect(ops.getByTestId("ticket-event-sla_breach")).toHaveCount(2);
    await expect(ops.getByTestId("ticket-sla").getByTestId("ticket-sla-breached")).toHaveCount(2);
    // a second run finds nothing new for this ticket
    const again = runSupportSlaJobOnce();
    expect(again.breaches).toBe(0);
    await ops.goto("/ops/support?view=breached");
    await expect(ops.locator("main [aria-busy='true']")).toHaveCount(0);
    await expect(ops.getByTestId("support-ticket-row").filter({ hasText: BREACH_SUBJECT })).toContainText("Breached");
  });
});

test.describe("pages and roles", () => {
  test("the reports page renders for the operator at 1440 and 375 px", async ({ ops }) => {
    test.setTimeout(120_000);
    await expectConsolePage(ops, "/ops/support/reports", 1440);
    await expect(ops.getByTestId("ops-support-reports")).toBeVisible();
    await expect(ops.getByTestId("support-reports-kpis")).toBeVisible();
    await expectConsolePage(ops, "/ops/support/reports", 375);
    await expect(ops.getByTestId("ops-support-reports")).toBeVisible();
  });

  test("a platform support agent works the desk but is refused on Settings and Controls", async ({ agent }) => {
    await agent.goto("/ops/support");
    await expect(agent.getByTestId("ops-shell")).toBeVisible();
    await expect(agent.getByRole("alert").filter({ hasText: "403" })).toHaveCount(0);
    // the admin-only entry points are not offered …
    await expect(agent.getByTestId("support-open-settings")).toHaveCount(0);
    await expect(agent.getByTestId("support-open-macros")).toBeVisible();
    // … and the pages themselves refuse the role
    for (const pathname of ["/ops/support/settings", "/ops/support/settings/general", "/ops/support/settings/sla", "/ops/controls", "/ops/controls/flags"]) {
      await agent.goto(pathname);
      const notice = agent.getByRole("alert").filter({ hasText: "403" });
      await expect(notice, pathname).toBeVisible();
      await expect(notice.locator("h1"), pathname).toHaveText("Platform admin required");
    }
  });

  test("queue, ticket, portal list and portal ticket: axe serious/critical empty at 1440 and 375 px", async ({ ops, page }) => {
    test.setTimeout(240_000);
    expect(ticketId, "the round trip created the ticket").toMatch(/^[0-9a-f-]{36}$/);
    for (const width of [1440, 375]) {
      await expectConsolePage(ops, "/ops/support", width);
      await expectConsolePage(ops, `/ops/support/${ticketId}`, width);
      await expectDashboardPage(page, "/app/support", width);
      await expectDashboardPage(page, `/app/support/${ticketId}`, width);
    }
  });
});
