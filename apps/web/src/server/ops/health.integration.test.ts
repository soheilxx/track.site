import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { newUlid } from "@track-site/core";
import {
  alertEvents,
  auditLog,
  deliveryAttempts,
  destinationHealthSnapshots,
  integrations,
  organization,
  queueDeadLetters,
  queueMessages,
  sites,
  stripeEvents,
  withWorker,
  workerHeartbeats,
} from "@track-site/db";
import { testDb } from "@track-site/db/testing";

/**
 * Runs the platform-health loader against the migrated test database as `tracksite_ops`: heartbeats in
 * three states, a queue backlog with a dead letter, delivery attempts of one connector, a destination
 * snapshot, two Stripe events and an open critical alert. The collector check points at a closed port,
 * the vendor checks are stubbed — everything else is the real SQL.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: () => ({ HOST_INGEST: "http://127.0.0.1:1", QUEUE_DRIVER: "pg", STRIPE_SECRET_KEY: undefined, STRIPE_PUBLISHABLE_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined }),
}));
vi.mock("@/server/health-status", () => ({
  aiStatus: async () => ({ ai: "not_configured", aiModels: null, aiCheckedAt: null }),
  mailStatus: async () => ({ mail: "file", mailDomain: null }),
  billingStatus: async () => ({ billing: "not_configured", billingPrices: null }),
  databaseProbe: async () => ({ db: true, migrations: 14 }),
}));
vi.mock("@/server/ops/platform", async () => {
  const { withPlatform: withOpsRole } = await import("@track-site/db");
  const { testDb: open } = await import("@track-site/db/testing");
  const handle = open();
  (globalThis as { __opsHealthPool?: typeof handle }).__opsHealthPool = handle;
  return { withPlatform: (_ctx: unknown, fn: (tx: Tx) => Promise<unknown>) => withOpsRole(handle.db, fn) };
});

import type { Tx } from "@track-site/db";
import { loadPlatformHealth } from "./health";
import type { PlatformContext } from "./platform";

const t = testDb();
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);
const QUEUE = `health-test-${Date.now()}`;
const DEAD_QUEUE = `${QUEUE}-dead`;
let orgId = "";
let siteId = "";
let integrationId = "";

const ctx = {
  user: { id: "00000000-0000-4000-8000-000000000001", email: "ops@test.local", name: "Ops", emailVerified: true, platformRole: "PLATFORM_ADMIN", locale: "en", twoFactorEnabled: true },
  platformRole: "PLATFORM_ADMIN",
  actor: { kind: "platform", userId: "00000000-0000-4000-8000-000000000001", email: "ops@test.local", platformRole: "PLATFORM_ADMIN" },
  requestId: "req-health-test",
} as PlatformContext;

beforeAll(async () => {
  const [org] = await t.db.insert(organization).values({ name: "Health org", slug: `health-${Date.now()}` }).returning({ id: organization.id });
  orgId = org!.id;
  const trackingId = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  await withWorker(t.db, async (tx) => {
    const [site] = await tx.insert(sites).values({ organizationId: orgId, trackingId, name: "Shop" }).returning({ id: sites.id });
    siteId = site!.id;
    const [integration] = await tx.insert(integrations).values({ organizationId: orgId, siteId, connectorType: "quora", name: "Quora", status: "connected" }).returning({ id: integrations.id });
    integrationId = integration!.id;
    const attempt = (status: "success" | "failed" | "retry" | "skipped" | "dead", startedAt: Date) => ({
      id: newUlid(),
      organizationId: orgId,
      siteId,
      eventId: newUlid(),
      eventName: "purchase",
      integrationId,
      connectorType: "quora",
      attempt: 1,
      status,
      startedAt,
    });
    await tx.insert(deliveryAttempts).values([
      ...Array.from({ length: 7 }, () => attempt("success", ago(3_600_000))),
      attempt("failed", ago(3_600_000)),
      attempt("dead", ago(3_600_000)),
      attempt("retry", ago(3_600_000)),
      attempt("skipped", ago(3_600_000)),
      attempt("skipped", ago(3_600_000)),
      attempt("success", ago(3 * 86_400_000)),
      attempt("success", ago(10 * 86_400_000)),
    ]);
    await tx.insert(workerHeartbeats).values([
      { job: "outbox", lastRunAt: ago(2_000), lastOkAt: ago(2_000), lastDurationMs: 12, host: "w1" },
      { job: "alerts", lastRunAt: ago(10_000), lastOkAt: ago(120_000), lastError: "boom for jane@example.com", lastDurationMs: 40, host: "w1" },
      { job: "retention", lastRunAt: ago(3 * 86_400_000), lastOkAt: ago(3 * 86_400_000), lastDurationMs: 900, host: "w1" },
    ]);
    await tx.insert(queueMessages).values([
      { id: newUlid(), queue: QUEUE, partitionKey: "p", body: {}, availableAt: ago(20 * 60_000) },
      { id: newUlid(), queue: QUEUE, partitionKey: "p", body: {}, availableAt: new Date(now.getTime() + 3_600_000) },
      { id: newUlid(), queue: QUEUE, partitionKey: "p", body: {}, availableAt: ago(60_000), lockedUntil: new Date(now.getTime() + 60_000), lockToken: "lock" },
    ]);
    await tx.insert(queueDeadLetters).values({ id: newUlid(), queue: DEAD_QUEUE, partitionKey: "p", body: {}, reason: "max attempts", deadAt: ago(3_600_000) });
    await tx.insert(stripeEvents).values([
      { id: `evt_health_ok_${Date.now()}`, type: "invoice.paid", payloadDigest: "d1", organizationId: orgId, processedAt: ago(60_000) },
      { id: `evt_health_bad_${Date.now()}`, type: "checkout.session.completed", payloadDigest: "d2", organizationId: orgId, error: "handler failed for john@example.com" },
    ]);
    await tx.insert(alertEvents).values({ organizationId: orgId, siteId, kind: "queue_lag", subjectKey: `site:${siteId}`, severity: "critical", title: "Queue lag", detail: {} });
    await tx.insert(auditLog).values({ id: newUlid(), organizationId: orgId, actor: { kind: "system" }, action: "config.schedule_failed", targetType: "config_draft", targetId: null });
    await tx.insert(destinationHealthSnapshots).values({
      organizationId: orgId,
      siteId,
      integrationId,
      computedAt: ago(30_000),
      attemptsTotal: 12,
      attemptsSuccess: 7,
      attemptsFailed: 2,
      attemptsRetry: 1,
      attemptsSkipped: 2,
      errorRate: 0.3,
      queueReady: 3,
      queueDead: 1,
    });
  });
});

afterAll(async () => {
  await t.close();
  await (globalThis as { __opsHealthPool?: { close: () => Promise<void> } }).__opsHealthPool?.close();
});

describe("loadPlatformHealth (test database)", () => {
  it("reads heartbeats, queues, deliveries, snapshots, the Stripe ledger and recent errors as tracksite_ops", async () => {
    const view = await loadPlatformHealth(ctx, { now });

    expect(view.collector.state).toBe("unreachable");
    expect(view.collector.host).toBe("127.0.0.1:1");

    const jobs = Object.fromEntries(view.worker.jobs.map((j) => [j.job, j]));
    expect(jobs.outbox).toMatchObject({ state: "ok", intervalMs: 5_000, host: "w1", lastError: null });
    expect(jobs.alerts?.state).toBe("failing");
    expect(jobs.alerts?.lastError).not.toContain("jane@example.com");
    expect(jobs.retention?.state).toBe("stale");
    expect(jobs.usage?.state).toBe("never");
    expect(view.worker.state).toBe("stale");

    const queue = view.queues.rows.find((r) => r.queue === QUEUE);
    expect(queue).toMatchObject({ ready: 1, scheduled: 1, inFlight: 1, dead: 0 });
    expect(queue?.lagMs).toBeGreaterThanOrEqual(19 * 60_000);
    const dead = view.queues.rows.find((r) => r.queue === DEAD_QUEUE);
    expect(dead).toMatchObject({ ready: 0, scheduled: 0, inFlight: 0, dead: 1 });
    expect(dead?.oldestDeadAt).not.toBeNull();
    expect(view.queues.measured).toBe(true);
    expect(view.queues.totals.dead).toBeGreaterThanOrEqual(1);

    const quora = view.deliveries.rows.find((r) => r.connectorType === "quora");
    expect(quora?.displayName).toMatch(/^Quora/);
    expect(quora).toMatchObject({
      organizations: 1,
      last24h: { total: 12, success: 7, failed: 2, retry: 1, skipped: 2 },
      last7d: { total: 13, success: 8, failed: 2, retry: 1, skipped: 2 },
      warn: true,
    });
    expect(quora?.last24h.errorRate).toBeCloseTo(0.3);
    expect(view.deliveries.totals.last24h.total).toBeGreaterThanOrEqual(12);

    expect(view.destinations.snapshots).toBeGreaterThanOrEqual(1);
    expect(view.destinations.fresh).toBeGreaterThanOrEqual(1);
    expect(view.destinations.highErrorRate).toBeGreaterThanOrEqual(1);
    expect(view.destinations.withDeadLetters).toBeGreaterThanOrEqual(1);
    expect(view.destinations.queueReady).toBeGreaterThanOrEqual(3);
    expect(view.destinations.byStatus.connected).toBeGreaterThanOrEqual(1);

    const ok = view.stripe.rows.find((r) => r.type === "invoice.paid" && r.organization?.id === orgId);
    const bad = view.stripe.rows.find((r) => r.type === "checkout.session.completed" && r.organization?.id === orgId);
    expect(ok).toMatchObject({ state: "processed", error: null, organization: { id: orgId, name: "Health org" } });
    expect(bad?.state).toBe("failed");
    expect(bad?.error).not.toContain("john@example.com");
    expect(view.stripe.configured).toBe(false);
    expect(view.stripe.summary.received24h).toBeGreaterThanOrEqual(2);
    expect(view.stripe.summary.failed24h).toBeGreaterThanOrEqual(1);

    expect(view.recent.alerts.some((a) => a.kind === "queue_lag" && a.severity === "critical" && a.organization?.id === orgId && a.resolvedAt === null)).toBe(true);
    expect(view.recent.openAlerts.critical).toBeGreaterThanOrEqual(1);
    expect(view.recent.audit.some((a) => a.action === "config.schedule_failed" && a.organization?.name === "Health org")).toBe(true);

    expect(view.database.state).toBe("ok");
    expect(view.database.sizeBytes).toBeGreaterThan(0);
    expect(view.database.version).toMatch(/^PostgreSQL \d/);
    expect(view.database.tables.length).toBeGreaterThan(0);
    expect(view.database.tables[0]!.totalBytes).toBeGreaterThanOrEqual(view.database.tables[1]?.totalBytes ?? 0);

    expect(view.vendors.migrations).toBe(14);
    expect(view.overall.state).toBe("bad");
    expect(view.overall.reasons).toEqual(expect.arrayContaining(["collector", "worker_stale", "dead_letters", "queue_lag", "delivery_errors", "critical_alerts"]));
    expect(view.generatedAt).toBe(now.toISOString());
  });
});
