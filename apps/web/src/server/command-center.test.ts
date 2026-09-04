import { describe, expect, it, vi } from "vitest";

// the loader's runtime dependencies are server-only; the rule table under test is pure
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("./session", () => ({ withOrg: vi.fn() }));
vi.mock("./entitlements", () => ({ planLimits: vi.fn() }));
vi.mock("./stats", () => ({ hourlyEventFlow: vi.fn(), deliveryOutcomesByDay: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({ QUEUE_DRIVER: "pg" }) }));

import { MEASUREMENT_KEYS, RULES, THRESHOLDS, evaluateActions, type CommandCenterFacts, type Measurement, type MeasurementKey } from "./command-center";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const at = NOW.toISOString();

const measured = <T>(value: T): Measurement<T> => ({ status: "measured", value, measuredAt: at });
const empty = <T>(): Measurement<T> => ({ status: "empty", value: null, measuredAt: at });
const unavailable = <T>(): Measurement<T> => ({ status: "unavailable", value: null, measuredAt: null });

/** A healthy, fully measured production site with events, a published policy and one connected destination. */
function healthyFacts(overrides: Partial<CommandCenterFacts> = {}): CommandCenterFacts {
  return {
    now: at,
    site: { id: "site-1", name: "Acme Shop", trackingId: "ABC123", primaryDomain: "shop.acme.test", platform: "shopify" },
    environment: { id: "env-1", kind: "production", name: "Production", testMode: false },
    siteStatus: measured({ status: "active", killSwitch: false, timezone: "Europe/Berlin" }),
    domain: measured({ hostname: "shop.acme.test", verified: true, verifiedAt: at }),
    config: measured({ version: 3, publishedAt: at, summary: null }),
    lastEvents: measured({ browserAt: "2026-09-04T11:55:00.000Z", serverAt: null, lastAt: "2026-09-04T11:55:00.000Z" }),
    recentEvents: measured([]),
    health: measured({ score: 91, components: {}, computedAt: at }),
    consent: measured({ policy: { version: 1, status: "published", publishedAt: at }, events: 500, explicitShare: 0.9, marketingShare: 0.6, lastSeenAt: at }),
    destinations: measured({ total: 1, connected: 1, error: 0, paused: 0, notConnected: 0, draft: 0, credentialProblems: [], errorNames: [], lastSuccessAt: at }),
    duplicates: measured({ received: 1000, deduplicated: 10, rate: 0.01 }),
    delivery: measured({ attempts: 100, success: 98, failed: 2, dead: 0, retry: 0, skipped: 0, failureRate: 0.02, deadLetters: 0, topErrorClass: "temporary", lastAttemptAt: at }),
    queue: measured({ pending: 0, inFlight: 0, oldestAgeSeconds: null, deadLetters: 0 }),
    usage: measured({ periodKey: "2026-09", billable: 1000, limit: 50_000, pct: 2, planId: "starter", policy: "pause", softLimitHitAt: null, hardLimitHitAt: null }),
    issues: measured({ open: 0, critical: 0, warning: 0, info: 0, top: [] }),
    flow: measured([]),
    deliveryHistory: measured([]),
    ...overrides,
  };
}

describe("command center rules", () => {
  it("names every measurement a rule can require", () => {
    for (const rule of RULES) for (const key of rule.requires) expect(MEASUREMENT_KEYS).toContain(key);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it("finds nothing to do on a healthy site and reports every rule as checked", () => {
    const result = evaluateActions(healthyFacts(), NOW);
    expect(result.actions).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.checked).toEqual(RULES.map((r) => r.id));
  });

  it("sends a fresh site to AI Setup first, then to consent and the domain", () => {
    const facts = healthyFacts({
      config: empty(),
      lastEvents: measured({ browserAt: null, serverAt: null, lastAt: null }),
      consent: measured({ policy: { version: 1, status: "draft", publishedAt: null }, events: 0, explicitShare: null, marketingShare: null, lastSeenAt: null }),
      domain: measured({ hostname: "shop.acme.test", verified: false, verifiedAt: null }),
      destinations: measured({ total: 0, connected: 0, error: 0, paused: 0, notConnected: 0, draft: 0, credentialProblems: [], errorNames: [], lastSuccessAt: null }),
      duplicates: empty(),
      delivery: measured({ attempts: 0, success: 0, failed: 0, dead: 0, retry: 0, skipped: 0, failureRate: null, deadLetters: 0, topErrorClass: null, lastAttemptAt: null }),
    });
    const { actions } = evaluateActions(facts, NOW);
    expect(actions.map((a) => a.id)).toEqual(["no_config", "no_consent_policy", "domain_unverified"]);
    expect(actions[0]).toMatchObject({ severity: "critical", href: "/app/ai-setup", params: { environment: "Production" } });
    expect(actions[1]!.params).toEqual({ status: "draft" });
    // the snippet step only follows once a configuration is live, and destinations only once events arrive
    const published = evaluateActions(healthyFacts({ ...facts, config: measured({ version: 1, publishedAt: at, summary: null }) }), NOW);
    expect(published.actions[0]).toMatchObject({ id: "no_events", severity: "critical", href: "/app/sites/site-1", params: { trackingId: "ABC123" } });
    expect(published.actions.map((a) => a.id)).not.toContain("no_destinations");
  });

  it("orders by severity first and by rule position within a level", () => {
    const facts = healthyFacts({
      usage: measured({ periodKey: "2026-09", billable: 36_000, limit: 50_000, pct: 72, planId: "starter", policy: "pause", softLimitHitAt: null, hardLimitHitAt: null }),
      duplicates: measured({ received: 1000, deduplicated: 80, rate: 0.08 }),
      delivery: measured({ attempts: 100, success: 40, failed: 50, dead: 10, retry: 3, skipped: 0, failureRate: 0.6, deadLetters: 2, topErrorClass: "rate_limited", lastAttemptAt: at }),
      issues: measured({ open: 3, critical: 1, warning: 2, info: 0, top: [{ id: "i1", kind: "missing_currency", severity: "critical", summary: "purchase without currency", occurrences: 12, lastSeenAt: at, fixTool: null }] }),
    });
    const { actions } = evaluateActions(facts, NOW);
    expect(actions.map((a) => `${a.severity}:${a.id}`)).toEqual(["critical:dead_letters", "critical:delivery_failures", "critical:critical_issues", "warn:duplicates", "info:warning_issues", "info:usage_warning"]);
    const failures = actions.find((a) => a.id === "delivery_failures")!;
    expect(failures.params).toEqual({ pct: 60, failed: 60, attempts: 100, thresholdPct: 20, criticalPct: 50, minAttempts: THRESHOLDS.deliveryMinAttempts, hours: 24, errorClass: "rate_limited" });
    expect(actions.find((a) => a.id === "critical_issues")!.params).toEqual({ count: 1, summary: "purchase without currency" });
    expect(actions.find((a) => a.id === "duplicates")!.params).toMatchObject({ pct: 8, deduplicated: 80, received: 1000, thresholdPct: 5 });
  });

  it("keeps thresholds: small samples and low rates never fire", () => {
    const facts = healthyFacts({
      delivery: measured({ attempts: 10, success: 2, failed: 8, dead: 0, retry: 0, skipped: 0, failureRate: 0.8, deadLetters: 0, topErrorClass: "timeout", lastAttemptAt: at }),
      duplicates: measured({ received: 50, deduplicated: 25, rate: 0.5 }),
      consent: measured({ policy: { version: 1, status: "published", publishedAt: at }, events: 20, explicitShare: 0.1, marketingShare: 0.1, lastSeenAt: at }),
      queue: measured({ pending: 4, inFlight: 1, oldestAgeSeconds: THRESHOLDS.queueLagSeconds - 1, deadLetters: 0 }),
      usage: measured({ periodKey: "2026-09", billable: 34_999, limit: 50_000, pct: 69.998, planId: "starter", policy: "pause", softLimitHitAt: null, hardLimitHitAt: null }),
    });
    expect(evaluateActions(facts, NOW).actions).toEqual([]);
    const warn = evaluateActions(
      healthyFacts({
        delivery: measured({ attempts: 20, success: 15, failed: 5, dead: 0, retry: 0, skipped: 0, failureRate: 0.25, deadLetters: 0, topErrorClass: "timeout", lastAttemptAt: at }),
        queue: measured({ pending: 4, inFlight: 1, oldestAgeSeconds: THRESHOLDS.queueLagSeconds, deadLetters: 0 }),
      }),
      NOW,
    ).actions;
    expect(warn.map((a) => `${a.severity}:${a.id}`)).toEqual(["warn:delivery_failures", "warn:queue_lag"]);
    expect(warn[1]!.params).toEqual({ seconds: 300, minutes: 5, pending: 4, thresholdMinutes: 5 });
  });

  it("treats a paused site, the kill switch and a hard plan limit as the most important actions", () => {
    const paused = evaluateActions(healthyFacts({ siteStatus: measured({ status: "paused", killSwitch: false, timezone: "UTC" }) }), NOW).actions;
    expect(paused[0]).toMatchObject({ id: "site_paused", severity: "critical", params: { site: "Acme Shop", reason: "paused" } });
    const kill = evaluateActions(healthyFacts({ siteStatus: measured({ status: "active", killSwitch: true, timezone: "UTC" }) }), NOW).actions;
    expect(kill[0]!.params.reason).toBe("kill_switch");
    const limit = evaluateActions(healthyFacts({ usage: measured({ periodKey: "2026-09", billable: 55_000, limit: 50_000, pct: 110, planId: "starter", policy: "pause", softLimitHitAt: at, hardLimitHitAt: at }) }), NOW).actions;
    expect(limit.map((a) => a.id)).toEqual(["usage_hard_limit"]);
    expect(limit[0]!.params).toEqual({ used: 55_000, limit: 50_000, policy: "pause", period: "2026-09" });
  });

  it("flags silence only for an active production environment that received events before", () => {
    const stale = { browserAt: "2026-09-02T10:00:00.000Z", serverAt: null, lastAt: "2026-09-02T10:00:00.000Z" };
    const prod = evaluateActions(healthyFacts({ lastEvents: measured(stale) }), NOW).actions;
    expect(prod.map((a) => a.id)).toEqual(["silence"]);
    expect(prod[0]!.params).toMatchObject({ hours: 50, threshold: 24, environment: "Production" });
    const staging = evaluateActions(healthyFacts({ lastEvents: measured(stale), environment: { id: "env-2", kind: "staging", name: "Staging", testMode: true } }), NOW).actions;
    expect(staging).toEqual([]);
  });

  it("links credential problems to the affected destination", () => {
    const facts = healthyFacts({
      destinations: measured({ total: 2, connected: 2, error: 0, paused: 0, notConnected: 0, draft: 0, credentialProblems: [{ integrationId: "int-9", name: "Meta CAPI", kind: "expiring", at: at }], errorNames: [], lastSuccessAt: at }),
    });
    const { actions } = evaluateActions(facts, NOW);
    expect(actions[0]).toMatchObject({ id: "credentials", severity: "critical", href: "/app/sites/site-1/destinations/int-9", params: { count: 1, destination: "Meta CAPI", kind: "expiring", days: THRESHOLDS.credentialExpiryDays } });
  });

  it("skips rules whose inputs were not measured and says which measurement was missing", () => {
    const facts = healthyFacts({ queue: { status: "not_measurable", value: null, measuredAt: at }, delivery: unavailable(), usage: unavailable() });
    const result = evaluateActions(facts, NOW);
    expect(result.skipped).toEqual([
      { id: "usage_hard_limit", measurement: "usage", status: "unavailable" },
      { id: "dead_letters", measurement: "delivery", status: "unavailable" },
      { id: "delivery_failures", measurement: "delivery", status: "unavailable" },
      { id: "usage_soft_limit", measurement: "usage", status: "unavailable" },
      { id: "queue_lag", measurement: "queue", status: "not_measurable" },
      { id: "usage_warning", measurement: "usage", status: "unavailable" },
    ]);
    expect(result.checked).not.toContain("queue_lag");
    expect(result.checked.length + result.skipped.length).toBe(RULES.length);
  });

  it("is deterministic for the same facts and clock", () => {
    const facts = healthyFacts({ issues: measured({ open: 2, critical: 0, warning: 2, info: 0, top: [] }) });
    const a = evaluateActions(facts, NOW);
    const b = evaluateActions(structuredClone(facts), new Date(NOW));
    expect(b).toEqual(a);
    const keys: MeasurementKey[] = [...MEASUREMENT_KEYS];
    expect(keys.sort()).toEqual([...new Set(RULES.flatMap((r) => r.requires)), "recentEvents", "health", "flow", "deliveryHistory"].sort());
  });
});
