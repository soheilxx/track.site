import { describe, expect, it, vi } from "vitest";

// the loader's runtime dependencies are server-only; the helpers under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ HOST_INGEST: "http://localhost:3100", QUEUE_DRIVER: "pg" }) }));
vi.mock("@/server/health-status", () => ({ aiStatus: vi.fn(), mailStatus: vi.fn(), billingStatus: vi.fn(), databaseProbe: vi.fn() }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));
vi.mock("@track-site/connectors", () => ({ getConnector: () => null }));

import {
  checkCollector,
  deliveryWarn,
  deliveryWindow,
  errorRateOf,
  hostOf,
  jobState,
  overallState,
  parseCollectorHealth,
  redactError,
  stripeEventState,
  worstJobState,
  type PlatformHealthView,
} from "./health";

const now = new Date("2026-09-08T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("jobState", () => {
  it("is never without a heartbeat, stale after twice the interval, failing when the last run did not succeed", () => {
    expect(jobState(null, 60_000, now)).toBe("never");
    expect(jobState({ lastRunAt: ago(30_000), lastOkAt: ago(30_000) }, 60_000, now)).toBe("ok");
    expect(jobState({ lastRunAt: ago(121_000), lastOkAt: ago(121_000) }, 60_000, now)).toBe("stale");
    expect(jobState({ lastRunAt: ago(119_000), lastOkAt: ago(119_000) }, 60_000, now)).toBe("ok");
    expect(jobState({ lastRunAt: ago(10_000), lastOkAt: ago(70_000) }, 60_000, now)).toBe("failing");
    expect(jobState({ lastRunAt: ago(10_000), lastOkAt: null }, 60_000, now)).toBe("failing");
    // a job the schedule mirror does not know can fail but never be judged stale
    expect(jobState({ lastRunAt: ago(10 * 86_400_000), lastOkAt: ago(10 * 86_400_000) }, null, now)).toBe("ok");
    expect(jobState({ lastRunAt: "2026-09-08T09:59:50.000Z", lastOkAt: "2026-09-08T09:59:50.000Z" }, 60_000, now)).toBe("ok");
  });
});

describe("worstJobState", () => {
  it("ranks stale over failing over never over ok", () => {
    expect(worstJobState([])).toBe("never");
    expect(worstJobState(["ok", "ok"])).toBe("ok");
    expect(worstJobState(["ok", "never"])).toBe("never");
    expect(worstJobState(["failing", "never", "ok"])).toBe("failing");
    expect(worstJobState(["failing", "stale"])).toBe("stale");
  });
});

describe("parseCollectorHealth", () => {
  it("reads the collector's answer and classifies it", () => {
    const ok = parseCollectorHealth(200, { ok: true, db: "ok", queue: { driver: "pg", ready: 3, dlq: 0 }, killSwitch: false, ts: "2026-09-08T09:59:59.000Z" }, now, 12, "localhost:3100");
    expect(ok).toEqual({
      host: "localhost:3100",
      state: "ok",
      httpStatus: 200,
      latencyMs: 12,
      db: "ok",
      queue: { driver: "pg", ready: 3, dlq: 0 },
      killSwitch: false,
      reportedAt: "2026-09-08T09:59:59.000Z",
      checkedAt: now.toISOString(),
    });
    expect(parseCollectorHealth(503, { ok: false, db: "error", queue: { driver: "pg", ready: null, dlq: null }, killSwitch: false, ts: "x" }, now, 5, "h").state).toBe("degraded");
    expect(parseCollectorHealth(503, { ok: false, db: "ok", killSwitch: true }, now, 5, "h").state).toBe("kill_switch");
    const invalid = parseCollectorHealth(200, null, now, 5, "h");
    expect(invalid.state).toBe("invalid");
    expect(invalid.db).toBeNull();
    expect(invalid.queue).toBeNull();
    // unknown values stay null instead of being guessed
    expect(parseCollectorHealth(200, { ok: true, db: "weird", queue: { ready: "3" } }, now, 5, "h")).toMatchObject({ db: null, queue: { driver: null, ready: null, dlq: null }, killSwitch: null, reportedAt: null });
  });
});

describe("checkCollector", () => {
  it("never throws: a timeout and a network error are states", async () => {
    const timeout = await checkCollector("http://collector.test/", now, (() => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }))) as unknown as typeof fetch);
    expect(timeout).toMatchObject({ host: "collector.test", state: "timeout", httpStatus: null, latencyMs: null });
    const down = await checkCollector("http://collector.test", now, (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch);
    expect(down.state).toBe("unreachable");
    const calls: string[] = [];
    const up = await checkCollector("http://collector.test/", now, ((url: string) => {
      calls.push(url);
      return Promise.resolve(new Response(JSON.stringify({ ok: true, db: "ok", queue: { driver: "pg", ready: 0, dlq: 0 }, killSwitch: false, ts: now.toISOString() }), { status: 200 }));
    }) as unknown as typeof fetch);
    expect(calls).toEqual(["http://collector.test/health"]);
    expect(up.state).toBe("ok");
    expect(up.latencyMs).not.toBeNull();
    const notJson = await checkCollector("http://collector.test", now, (() => Promise.resolve(new Response("<html>", { status: 200 }))) as unknown as typeof fetch);
    expect(notJson.state).toBe("invalid");
  });
});

describe("delivery helpers", () => {
  it("computes the error rate over attempted deliveries and warns only with enough attempts", () => {
    expect(errorRateOf({ success: 0, failed: 0, retry: 0 })).toBeNull();
    expect(errorRateOf({ success: 8, failed: 1, retry: 1 })).toBe(0.2);
    const quiet = deliveryWindow({ total: 3, success: 1, failed: 2, retry: 0, skipped: 0 });
    expect(quiet.errorRate).toBeCloseTo(2 / 3);
    expect(deliveryWarn(quiet)).toBe(false);
    const loud = deliveryWindow({ total: 12, success: 7, failed: 2, retry: 1, skipped: 2 });
    expect(loud.errorRate).toBeCloseTo(0.3);
    expect(deliveryWarn(loud)).toBe(true);
    expect(deliveryWarn(deliveryWindow({ total: 100, success: 95, failed: 3, retry: 2, skipped: 0 }))).toBe(false);
  });
});

describe("stripeEventState / redactError / hostOf", () => {
  it("classifies ledger rows and redacts vendor texts", () => {
    expect(stripeEventState({ processedAt: now, error: null })).toBe("processed");
    expect(stripeEventState({ processedAt: null, error: null })).toBe("pending");
    expect(stripeEventState({ processedAt: now, error: "boom" })).toBe("failed");
    expect(redactError(null)).toBeNull();
    expect(redactError("   ")).toBeNull();
    expect(redactError("customer jane@example.com rejected")).not.toContain("jane@example.com");
    expect(redactError("x".repeat(400), 300)).toHaveLength(301);
    expect(hostOf("https://ingest.track.site/")).toBe("ingest.track.site");
    expect(hostOf("not a url")).toBe("not a url");
  });
});

function healthy(): Omit<PlatformHealthView, "overall" | "generatedAt"> {
  return {
    collector: { host: "h", state: "ok", httpStatus: 200, latencyMs: 3, db: "ok", queue: { driver: "pg", ready: 0, dlq: 0 }, killSwitch: false, reportedAt: null, checkedAt: now.toISOString() },
    worker: { jobs: [], state: "ok", latestRunAt: null },
    queues: { driver: "pg", measured: true, rows: [], totals: { ready: 0, scheduled: 0, inFlight: 0, dead: 0, maxLagMs: null }, deadLetterReferences: 0 },
    deliveries: { rows: [], totals: { last24h: deliveryWindow({ total: 0, success: 0, failed: 0, retry: 0, skipped: 0 }), last7d: deliveryWindow({ total: 0, success: 0, failed: 0, retry: 0, skipped: 0 }) } },
    destinations: { snapshots: 0, fresh: 0, stale: 0, latestComputedAt: null, oldestComputedAt: null, organizations: 0, attempts: { total: 0, success: 0, failed: 0, retry: 0, rateLimited: 0, authFailed: 0, errorRate: null }, highErrorRate: 0, withDeadLetters: 0, queueReady: 0, oldestQueuedAt: null, byStatus: {}, integrations: 0 },
    stripe: { configured: false, webhookSecretConfigured: false, rows: [], summary: { received24h: 0, processed24h: 0, failed24h: 0, pendingTotal: 0, lastReceivedAt: null } },
    vendors: { ai: { ai: "not_configured", aiModels: null, aiCheckedAt: null }, mail: { mail: "file", mailDomain: null }, billing: { billing: "not_configured", billingPrices: null }, migrations: 14, dbProbe: true },
    database: { state: "ok", sizeBytes: 1, version: "PostgreSQL 18.0", connections: 1, tableCount: 73, tables: [] },
    recent: { alerts: [], openAlerts: { critical: 0, warning: 0, info: 0 }, audit: [] },
  };
}

describe("overallState", () => {
  it("is ok when nothing is wrong, bad when ingestion, the worker or the database is down, warn otherwise", () => {
    expect(overallState(healthy())).toEqual({ state: "ok", reasons: [] });
    const collectorDown = healthy();
    collectorDown.collector.state = "unreachable";
    expect(overallState(collectorDown)).toMatchObject({ state: "bad", reasons: ["collector"] });
    const killed = healthy();
    killed.collector.state = "kill_switch";
    expect(overallState(killed).reasons).toEqual(["collector_kill_switch"]);
    const workerStale = healthy();
    workerStale.worker.state = "stale";
    expect(overallState(workerStale)).toMatchObject({ state: "bad", reasons: ["worker_stale"] });
    const failing = healthy();
    failing.worker.state = "failing";
    failing.queues.totals.dead = 2;
    failing.recent.openAlerts.critical = 1;
    expect(overallState(failing)).toEqual({ state: "warn", reasons: ["worker_failing", "dead_letters", "critical_alerts"] });
    // an unconfigured vendor is not a problem; a misconfigured one is
    const vendors = healthy();
    vendors.vendors.ai.ai = "models_missing";
    vendors.vendors.billing.billing = "prices_failing";
    vendors.vendors.mail = { mail: "resend", mailDomain: { domain: "track.site", status: "pending" } };
    expect(overallState(vendors).reasons).toEqual(["ai", "billing_prices", "mail_domain"]);
    const sendingOnly = healthy();
    sendingOnly.vendors.mail = { mail: "resend", mailDomain: { domain: "track.site", status: "sending_only_key" } };
    expect(overallState(sendingOnly).state).toBe("ok");
    // a queue driver outside the database is not judged by the tables
    const sqs = healthy();
    sqs.queues.measured = false;
    sqs.queues.totals.dead = 5;
    expect(overallState(sqs).state).toBe("ok");
    const stripe = healthy();
    stripe.stripe.configured = true;
    stripe.stripe.summary.failed24h = 1;
    expect(overallState(stripe).reasons).toEqual(["stripe_failures", "stripe_webhook_secret"]);
    const db = healthy();
    db.vendors.dbProbe = false;
    expect(overallState(db).state).toBe("bad");
  });
});
