import { describe, expect, it } from "vitest";
import { shouldTriggerAlert } from "@track-site/db";
import {
  baselineMean,
  evaluateRule,
  normalizeThreshold,
  windowsFor,
  type SiteFacts,
} from "./alerts.ts";
import { renderAlertText } from "./alerts-text.ts";

/** Rule evaluation with fixtures only — no database, no clock other than NOW. */
const NOW = new Date("2026-09-04T12:30:00.000Z");
const SITE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const META = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GA4 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return {
    siteId: SITE,
    siteName: "Acme Shop",
    events: {},
    conversions: {},
    consent: {},
    destinations: [],
    credentials: [],
    ...overrides,
  };
}

const rule = (
  kind: Parameters<typeof evaluateRule>[0]["kind"],
  threshold: Record<string, number> = {},
) => ({ id: "rule-1", kind, threshold });

describe("normalizeThreshold", () => {
  it("fills defaults, clamps into bounds and rounds integer fields", () => {
    expect(normalizeThreshold("event_drop", {})).toEqual({
      dropPercent: 50,
      windowMinutes: 60,
      minBaseline: 50,
    });
    expect(
      normalizeThreshold("event_drop", { dropPercent: 500, windowMinutes: 10, minBaseline: 12.6 }),
    ).toEqual({ dropPercent: 100, windowMinutes: 60, minBaseline: 13 });
    expect(normalizeThreshold("queue_lag", { lagSeconds: "120" })).toEqual({ lagSeconds: 120 });
    expect(normalizeThreshold("credential_expiry", "garbage")).toEqual({ daysBefore: 7 });
  });
});

describe("baselineMean", () => {
  it("averages only the weeks that had data", () => {
    expect(baselineMean([100, 0, 80, 0])).toBe(90);
    expect(baselineMean([0, 0, 0, 0])).toBeNull();
    expect(baselineMean([])).toBeNull();
  });
});

describe("event_drop", () => {
  it("fires when the current window is below the baseline by more than the threshold", () => {
    const f = facts({ events: { 60: { current: 20, baseline: [100, 110, 90, 100] } } });
    const [finding] = evaluateRule(
      rule("event_drop", { dropPercent: 50, windowMinutes: 60, minBaseline: 50 }),
      f,
      NOW,
    );
    expect(finding).toMatchObject({ subjectKey: `site:${SITE}`, severity: "warning" });
    expect(finding!.detail).toMatchObject({
      observed: 20,
      expected: 100,
      drop_percent: 80,
      threshold_percent: 50,
      baseline_weeks: 4,
      window_minutes: 60,
    });
  });
  it("is critical at zero events or twice the threshold", () => {
    const zero = evaluateRule(
      rule("event_drop", { dropPercent: 30 }),
      facts({ events: { 60: { current: 0, baseline: [100, 100, 100, 100] } } }),
      NOW,
    );
    expect(zero[0]!.severity).toBe("critical");
    const heavy = evaluateRule(
      rule("event_drop", { dropPercent: 30 }),
      facts({ events: { 60: { current: 30, baseline: [100, 100, 100, 100] } } }),
      NOW,
    );
    expect(heavy[0]!.severity).toBe("critical");
  });
  it("stays quiet below the threshold, without a baseline or below the minimum baseline", () => {
    expect(
      evaluateRule(
        rule("event_drop", { dropPercent: 50 }),
        facts({ events: { 60: { current: 60, baseline: [100, 100, 100, 100] } } }),
        NOW,
      ),
    ).toEqual([]);
    expect(
      evaluateRule(
        rule("event_drop"),
        facts({ events: { 60: { current: 0, baseline: [0, 0, 0, 0] } } }),
        NOW,
      ),
    ).toEqual([]);
    expect(
      evaluateRule(
        rule("event_drop", { minBaseline: 500 }),
        facts({ events: { 60: { current: 0, baseline: [100, 100, 100, 100] } } }),
        NOW,
      ),
    ).toEqual([]);
    // no facts for the requested window → nothing (never a made-up value)
    expect(
      evaluateRule(
        rule("event_drop", { windowMinutes: 180 }),
        facts({ events: { 60: { current: 0, baseline: [100] } } }),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("conversion_anomaly", () => {
  it("reports drops and spikes against the 4-week baseline", () => {
    const drop = evaluateRule(
      rule("conversion_anomaly", { deviationPercent: 30, windowMinutes: 180, minBaseline: 10 }),
      facts({ conversions: { 180: { current: 4, baseline: [20, 20, 0, 20] } } }),
      NOW,
    );
    expect(drop[0]).toMatchObject({ severity: "critical" });
    expect(drop[0]!.detail).toMatchObject({
      direction: "drop",
      deviation_percent: 80,
      expected: 20,
      baseline_weeks: 3,
    });
    const spike = evaluateRule(
      rule("conversion_anomaly", { deviationPercent: 30, windowMinutes: 180, minBaseline: 10 }),
      facts({ conversions: { 180: { current: 40, baseline: [20, 20, 20, 20] } } }),
      NOW,
    );
    expect(spike[0]).toMatchObject({ severity: "warning" });
    expect(spike[0]!.detail).toMatchObject({ direction: "spike", deviation_percent: 100 });
    expect(
      evaluateRule(
        rule("conversion_anomaly", { deviationPercent: 30, windowMinutes: 180, minBaseline: 10 }),
        facts({ conversions: { 180: { current: 15, baseline: [20, 20, 20, 20] } } }),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("consent_errors", () => {
  it("fires on the share of consent-blocked events once enough events were received", () => {
    const hit = evaluateRule(
      rule("consent_errors", { errorRatePercent: 20, windowMinutes: 60, minEvents: 50 }),
      facts({ consent: { 60: { received: 200, consentDropped: 60 } } }),
      NOW,
    );
    expect(hit[0]).toMatchObject({ severity: "warning" });
    expect(hit[0]!.detail).toMatchObject({ rate_percent: 30, received: 200, consent_dropped: 60 });
    expect(
      evaluateRule(
        rule("consent_errors", { errorRatePercent: 20, windowMinutes: 60, minEvents: 50 }),
        facts({ consent: { 60: { received: 20, consentDropped: 20 } } }),
        NOW,
      ),
    ).toEqual([]);
    expect(
      evaluateRule(
        rule("consent_errors", { errorRatePercent: 20, windowMinutes: 60, minEvents: 50 }),
        facts({ consent: { 60: { received: 200, consentDropped: 10 } } }),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("vendor_outage", () => {
  const dest = (over: Partial<SiteFacts["destinations"][number]>) => ({
    integrationId: META,
    name: "Meta Ads",
    connectorType: "meta",
    status: "connected",
    attemptsTotal: 100,
    errorRate: 0.05,
    lastErrorClass: null,
    queueOldestAvailableAt: null,
    queueReady: 0,
    ...over,
  });
  it("fires per destination on error rate or an error status and skips paused and draft destinations", () => {
    const f = facts({
      destinations: [
        dest({}),
        dest({
          integrationId: GA4,
          name: "GA4",
          connectorType: "ga4",
          errorRate: 0.4,
          attemptsTotal: 50,
          lastErrorClass: "auth",
        }),
        dest({
          integrationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          name: "Paused",
          status: "paused",
          errorRate: 1,
        }),
        dest({
          integrationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          name: "Broken",
          status: "error",
          errorRate: null,
          attemptsTotal: 0,
        }),
      ],
    });
    const findings = evaluateRule(
      rule("vendor_outage", { errorRatePercent: 25, minAttempts: 20 }),
      f,
      NOW,
    );
    expect(findings.map((x) => [x.subjectKey, x.severity])).toEqual([
      [`integration:${GA4}`, "warning"],
      ["integration:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "critical"],
    ]);
    expect(findings[0]!.detail).toMatchObject({
      integration_name: "GA4",
      error_rate_percent: 40,
      attempts: 50,
      last_error_class: "auth",
    });
  });
  it("needs the minimum number of attempts", () => {
    expect(
      evaluateRule(
        rule("vendor_outage", { errorRatePercent: 25, minAttempts: 20 }),
        facts({ destinations: [dest({ errorRate: 1, attemptsTotal: 3 })] }),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("credential_expiry", () => {
  it("flags expiring and expired credentials and disconnected OAuth connections", () => {
    const f = facts({
      credentials: [
        {
          integrationId: META,
          integrationName: "Meta Ads",
          kind: "access_token",
          expiresAt: "2026-09-08T00:00:00.000Z",
          status: "active",
          source: "credential",
        },
        {
          integrationId: GA4,
          integrationName: "GA4",
          kind: "api_secret",
          expiresAt: "2026-09-01T00:00:00.000Z",
          status: "active",
          source: "credential",
        },
        {
          integrationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          integrationName: "Google Ads",
          kind: "oauth",
          expiresAt: null,
          status: "revoked",
          source: "oauth",
        },
        {
          integrationId: "99999999-9999-4999-8999-999999999999",
          integrationName: "Fine",
          kind: "access_token",
          expiresAt: "2026-12-01T00:00:00.000Z",
          status: "active",
          source: "credential",
        },
      ],
    });
    const findings = evaluateRule(rule("credential_expiry", { daysBefore: 7 }), f, NOW);
    expect(findings.map((x) => [x.subjectKey, x.severity, x.detail.state])).toEqual([
      [`integration:${META}:access_token`, "warning", "expiring"],
      [`integration:${GA4}:api_secret`, "critical", "expired"],
      ["integration:ffffffff-ffff-4fff-8fff-ffffffffffff:oauth", "critical", "disconnected"],
    ]);
    expect(findings[0]!.detail).toMatchObject({ days_left: 3, expires_at: "2026-09-08" });
  });
});

describe("queue_lag", () => {
  it("measures the age of the oldest queued message per destination", () => {
    const f = facts({
      destinations: [
        {
          integrationId: META,
          name: "Meta Ads",
          connectorType: "meta",
          status: "connected",
          attemptsTotal: 0,
          errorRate: null,
          lastErrorClass: null,
          queueOldestAvailableAt: "2026-09-04T12:00:00.000Z",
          queueReady: 42,
        },
      ],
    });
    const [warn] = evaluateRule(rule("queue_lag", { lagSeconds: 900 }), f, NOW);
    expect(warn).toMatchObject({ subjectKey: `integration:${META}:queue`, severity: "warning" });
    expect(warn!.detail).toMatchObject({
      lag_seconds: 1800,
      threshold_seconds: 900,
      queue_ready: 42,
    });
    expect(evaluateRule(rule("queue_lag", { lagSeconds: 300 }), f, NOW)[0]!.severity).toBe(
      "critical",
    );
    expect(evaluateRule(rule("queue_lag", { lagSeconds: 3600 }), f, NOW)).toEqual([]);
  });
});

describe("cooldown", () => {
  it("never repeats an open event and respects the cooldown after a resolved one", () => {
    expect(shouldTriggerAlert(null, 60, NOW)).toBe(true);
    expect(
      shouldTriggerAlert(
        { triggeredAt: new Date("2026-09-04T10:00:00.000Z"), resolvedAt: null },
        60,
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldTriggerAlert(
        {
          triggeredAt: new Date("2026-09-04T12:00:00.000Z"),
          resolvedAt: new Date("2026-09-04T12:10:00.000Z"),
        },
        60,
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldTriggerAlert(
        {
          triggeredAt: new Date("2026-09-04T11:00:00.000Z"),
          resolvedAt: new Date("2026-09-04T11:10:00.000Z"),
        },
        60,
        NOW,
      ),
    ).toBe(true);
  });
});

describe("windowsFor", () => {
  it("collects the distinct windows per fact family", () => {
    expect(
      windowsFor([
        rule("event_drop", { windowMinutes: 60 }),
        rule("event_drop", { windowMinutes: 60 }),
        rule("conversion_anomaly", { windowMinutes: 180 }),
        rule("consent_errors"),
        rule("queue_lag"),
      ]),
    ).toEqual({ events: [60], conversions: [180], consent: [60] });
  });
});

describe("renderAlertText", () => {
  const detail = {
    site_name: "Acme Shop",
    window_minutes: 60,
    observed: 20,
    expected: 100,
    drop_percent: 80,
    threshold_percent: 50,
    baseline_weeks: 4,
  };
  it("fills the localized templates and falls back to English for unknown locales", () => {
    const en = renderAlertText("en", {
      type: "alert.triggered",
      kind: "event_drop",
      severity: "critical",
      detail,
      siteName: "Acme Shop",
      triggeredAt: NOW,
      url: "https://app.track.site/app/settings/alerts?event=1",
    });
    expect(en.title).toBe("Event volume dropped 80 % on Acme Shop");
    expect(en.subject).toBe("[Track alert] Critical: Event volume dropped 80 % on Acme Shop");
    expect(en.body).toContain("20 accepted events in the last 60 minutes instead of about 100");
    expect(en.body).toContain("https://app.track.site/app/settings/alerts?event=1");
    const de = renderAlertText("de", {
      type: "alert.triggered",
      kind: "event_drop",
      severity: "critical",
      detail,
      siteName: "Acme Shop",
      triggeredAt: NOW,
      url: "u",
    });
    expect(de.title).toBe("Eventvolumen auf Acme Shop um 80 % gesunken");
    expect(
      renderAlertText("xx", {
        type: "alert.triggered",
        kind: "event_drop",
        severity: "info",
        detail,
        siteName: null,
        triggeredAt: NOW,
        url: "u",
      }).title,
    ).toBe("Event volume dropped 80 % on All sites");
  });
  it("translates state and direction words and never re-interprets values as placeholders", () => {
    const fr = renderAlertText("fr", {
      type: "alert.triggered",
      kind: "credential_expiry",
      severity: "warning",
      detail: {
        integration_name: "{url}",
        credential_kind: "access_token",
        state: "expiring",
        days_left: 3,
        expires_at: "2026-09-08",
      },
      siteName: "Acme",
      triggeredAt: NOW,
      url: "SECRET-URL",
    });
    expect(fr.title).toBe("L'identifiant de {url} va expirer");
    expect(fr.summary).not.toContain("SECRET-URL");
    const nl = renderAlertText("nl", {
      type: "alert.triggered",
      kind: "conversion_anomaly",
      severity: "warning",
      detail: {
        direction: "spike",
        deviation_percent: 60,
        observed: 8,
        expected: 5,
        window_minutes: 180,
        threshold_percent: 50,
        baseline_weeks: 2,
      },
      siteName: "Acme",
      triggeredAt: NOW,
      url: "u",
    });
    expect(nl.title).toBe("Conversies op Acme zijn 60 % gestegen");
  });
  it("renders the test notification with the channel name", () => {
    const it_ = renderAlertText("it", {
      type: "alert.test",
      kind: "event_drop",
      severity: "info",
      detail: {},
      siteName: null,
      triggeredAt: NOW,
      url: "u",
      channelName: "Ops Slack",
    });
    expect(it_.title).toBe("Notifica di prova da Track");
    expect(it_.summary).toContain("«Ops Slack»");
  });
});
