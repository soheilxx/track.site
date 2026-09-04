import { describe, expect, it, vi } from "vitest";

/**
 * Pure measurement helpers of the Destination Health Center: credential expiry classification,
 * plain-language failure reasons, error rate, snapshot freshness, queue lag and the prioritised
 * attention rules. The module also exports the DB loader and the diagnosis, which pull in the
 * session, vault and env; those are mocked away here (same approach as ai/turn.test.ts).
 */
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({ VENDOR_ALLOW_PRIVATE: false }) }));
vi.mock("@/server/db", () => ({ logger: { warn: () => undefined, child: () => ({}) }, vault: () => null }));
vi.mock("@/server/oauth", () => ({ providerConfig: () => null }));
vi.mock("@/server/session", () => ({ withOrg: async () => [] }));

const { API_SUNSET_WARN_DAYS, CREDENTIAL_EXPIRING_DAYS, DESTINATION_HEALTH_STALE_AFTER_MS, QUEUE_LAG_WARN_MS, attentionFor, credentialExpiry, errorRateOf, failureReason, queueLagMs, snapshotFreshness, statusAfterDiagnosis, summarizeCredentials, sunsetDays } = await import("./destination-health");

const NOW = new Date("2026-09-04T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("credentialExpiry", () => {
  it("classifies active credentials by their expiry date", () => {
    expect(credentialExpiry({ status: "active", expiresAt: null }, NOW)).toEqual({ state: "no_expiry", daysLeft: null });
    expect(credentialExpiry({ status: "active", expiresAt: days(30) }, NOW)).toEqual({ state: "ok", daysLeft: 30 });
    expect(credentialExpiry({ status: "active", expiresAt: days(CREDENTIAL_EXPIRING_DAYS) }, NOW).state).toBe("expiring");
    expect(credentialExpiry({ status: "active", expiresAt: days(-1).toISOString() }, NOW)).toEqual({ state: "expired", daysLeft: -1 });
  });

  it("treats rotated and revoked credentials as inactive regardless of their date", () => {
    expect(credentialExpiry({ status: "rotated", expiresAt: days(30) }, NOW).state).toBe("inactive");
    expect(credentialExpiry({ status: "revoked", expiresAt: null }, NOW).state).toBe("inactive");
  });
});

describe("summarizeCredentials", () => {
  it("reports missing required kinds and the worst active credential", () => {
    const refs = [
      { kind: "oauth_access_token", status: "active", expiresAt: days(1), lastValidatedAt: days(-2) },
      { kind: "oauth_refresh_token", status: "active", expiresAt: null, lastValidatedAt: days(-1) },
      { kind: "access_token", status: "rotated", expiresAt: days(-3) },
    ];
    const summary = summarizeCredentials(refs, ["oauth_refresh_token", "client_secret"], NOW);
    expect(summary.state).toBe("expiring");
    expect(summary.daysLeft).toBe(1);
    expect(summary.missingKinds).toEqual(["client_secret"]);
    expect(summary.lastValidatedAt).toBe(days(-1).toISOString());
  });

  it("is honest without any active credential", () => {
    expect(summarizeCredentials([], ["access_token"], NOW)).toEqual({ state: "none", expiresAt: null, daysLeft: null, missingKinds: ["access_token"], lastValidatedAt: null });
    expect(summarizeCredentials([{ kind: "access_token", status: "active", expiresAt: null }], ["access_token"], NOW).state).toBe("no_expiry");
  });
});

describe("failureReason", () => {
  it("maps error classes and codes to plain-language reasons", () => {
    expect(failureReason("auth", "http_401", 401)).toBe("credentials_rejected");
    expect(failureReason("credential_expired", "missing_access_token", null)).toBe("credential_missing");
    expect(failureReason("credential_expired", "expired", null)).toBe("credential_expired");
    expect(failureReason("rate_limited", "http_429", 429)).toBe("rate_limited");
    expect(failureReason("temporary", null, 429)).toBe("rate_limited");
    expect(failureReason("invalid_payload", "validation", null)).toBe("invalid_payload");
    expect(failureReason("policy_blocked", "consent_missing", null)).toBe("consent_missing");
    expect(failureReason("policy_blocked", "destination_paused", null)).toBe("destination_paused");
    expect(failureReason("policy_blocked", "gpc_opt_out", null)).toBe("gpc_opt_out");
    expect(failureReason("policy_blocked", "other", null)).toBe("policy_blocked");
    expect(failureReason("timeout", null, null)).toBe("vendor_timeout");
    expect(failureReason("temporary", "http_503", 503)).toBe("vendor_temporary");
    expect(failureReason("permanent", "http_400", 400)).toBe("vendor_rejected");
    expect(failureReason("permanent", "destination_missing", null)).toBe("destination_missing");
    expect(failureReason("none", null, null)).toBe("unknown");
  });
});

describe("errorRateOf / snapshotFreshness / queueLagMs / sunsetDays", () => {
  it("computes the error rate over non-skipped attempts and stays null without attempts", () => {
    expect(errorRateOf({ success: 0, failed: 0, retry: 0 })).toBeNull();
    expect(errorRateOf({ success: 8, failed: 1, retry: 1 })).toBeCloseTo(0.2);
  });

  it("marks snapshots fresh, stale or missing", () => {
    expect(snapshotFreshness(null, NOW)).toBe("missing");
    expect(snapshotFreshness(new Date(NOW.getTime() - 60_000), NOW)).toBe("fresh");
    expect(snapshotFreshness(new Date(NOW.getTime() - DESTINATION_HEALTH_STALE_AFTER_MS - 1).toISOString(), NOW)).toBe("stale");
  });

  it("measures queue lag from the oldest waiting message", () => {
    expect(queueLagMs(null, NOW)).toBeNull();
    expect(queueLagMs(new Date(NOW.getTime() - 90_000), NOW)).toBe(90_000);
    expect(queueLagMs(new Date(NOW.getTime() + 5_000), NOW)).toBe(0);
  });

  it("counts days until an API sunset", () => {
    expect(sunsetDays(null, NOW)).toBeNull();
    expect(sunsetDays("not a date", NOW)).toBeNull();
    expect(sunsetDays("2026-10-04", NOW)).toBe(30);
  });
});

describe("attentionFor", () => {
  const base = { status: "connected" as const, healthStatus: "healthy" as const, credentialState: "ok" as const, missingKinds: [], deliveries: { success: 10, failed: 0, retry: 0, rateLimited: 0, authFailed: 0, errorRate: 0 }, queueLagMs: 0, deadLetters: 0, sunsetDays: null, lastSuccessAt: NOW.toISOString() };

  it("reports no issue for a connected destination that delivers", () => {
    expect(attentionFor(base)).toEqual({ level: "none", issues: [] });
  });

  it("ranks critical issues first and derives the level from the worst issue", () => {
    const result = attentionFor({ ...base, credentialState: "expired", deliveries: { ...base.deliveries, authFailed: 2, rateLimited: 1 }, deadLetters: 3 });
    expect(result.level).toBe("critical");
    expect(result.issues).toEqual(["credential_expired", "auth_failures", "rate_limited", "dead_letters"]);
  });

  it("raises warnings for error rate, queue lag, sunset and missing credentials only above the thresholds", () => {
    expect(attentionFor({ ...base, deliveries: { ...base.deliveries, success: 3, failed: 1, errorRate: 0.25 } }).issues).toEqual([]);
    expect(attentionFor({ ...base, deliveries: { ...base.deliveries, success: 4, failed: 1, errorRate: 0.2 } }).issues).toEqual(["high_error_rate"]);
    expect(attentionFor({ ...base, queueLagMs: QUEUE_LAG_WARN_MS - 1 }).issues).toEqual([]);
    expect(attentionFor({ ...base, queueLagMs: QUEUE_LAG_WARN_MS }).issues).toEqual(["queue_lag"]);
    expect(attentionFor({ ...base, sunsetDays: API_SUNSET_WARN_DAYS + 1 }).issues).toEqual([]);
    expect(attentionFor({ ...base, sunsetDays: API_SUNSET_WARN_DAYS }).issues).toEqual(["api_sunset"]);
    expect(attentionFor({ ...base, missingKinds: ["access_token"], credentialState: "none" })).toEqual({ level: "warning", issues: ["credential_missing"] });
  });

  it("keeps paused, draft and not-yet-delivering destinations informational", () => {
    expect(attentionFor({ ...base, status: "paused" })).toEqual({ level: "info", issues: ["paused"] });
    expect(attentionFor({ ...base, status: "draft", credentialState: "expired" })).toEqual({ level: "info", issues: ["draft"] });
    expect(attentionFor({ ...base, lastSuccessAt: null })).toEqual({ level: "info", issues: ["no_delivery_yet"] });
    expect(attentionFor({ ...base, status: "not_connected", lastSuccessAt: null })).toEqual({ level: "warning", issues: ["not_connected"] });
  });
});

describe("statusAfterDiagnosis", () => {
  const ok = { ok: true, validation: { ok: true, status: "valid" as const, detail: "", apiVersion: "v1", checkedAt: NOW.toISOString() }, health: null, error: null };
  const rejected = { ...ok, ok: false, validation: { ...ok.validation, ok: false, status: "invalid" as const } };
  const none = { ...ok, ok: false, validation: { ...ok.validation, ok: false, status: "not_connected" as const } };
  const failed = { ok: false, validation: null, health: null, error: "timeout" as const };

  it("keeps a paused destination paused when only diagnosing, and reconnects on resume", () => {
    expect(statusAfterDiagnosis("paused", ok, "diagnose")).toBe("paused");
    expect(statusAfterDiagnosis("paused", ok, "resume")).toBe("connected");
    expect(statusAfterDiagnosis("paused", rejected, "resume")).toBe("error");
    expect(statusAfterDiagnosis("paused", none, "resume")).toBe("not_connected");
    expect(statusAfterDiagnosis("paused", failed, "resume")).toBe("not_connected");
  });

  it("sets the status from the vendor verdict and leaves it unchanged when the check could not run", () => {
    expect(statusAfterDiagnosis("error", ok, "diagnose")).toBe("connected");
    expect(statusAfterDiagnosis("connected", rejected, "diagnose")).toBe("error");
    expect(statusAfterDiagnosis("connected", none, "diagnose")).toBe("not_connected");
    expect(statusAfterDiagnosis("connected", failed, "diagnose")).toBe("connected");
    expect(statusAfterDiagnosis("draft", failed, "diagnose")).toBe("draft");
  });
});
