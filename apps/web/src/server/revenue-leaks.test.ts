import { describe, expect, it } from "vitest";
import { aggregateSnapshots, dominantReason, leakShare, utcDay, type SnapshotRow } from "./revenue-leaks";

function row(over: Partial<SnapshotRow> = {}): SnapshotRow {
  const day = over.periodStart ?? new Date("2026-09-01T00:00:00Z");
  return {
    id: "s",
    organizationId: "o",
    siteId: "site",
    integrationId: null,
    kind: "purchase",
    granularity: "day",
    periodStart: day,
    periodEnd: new Date(day.getTime() + 86_400_000),
    authoritativeCount: 0,
    authoritativeValuedCount: 0,
    authoritativeValue: null,
    currency: null,
    currencyMixed: false,
    observedBrowserCount: 0,
    deduplicatedCount: 0,
    deliveredCount: 0,
    gapNoConsent: 0,
    gapBlocked: 0,
    gapNotCaptured: 0,
    gapDeliveryFailed: 0,
    gapUnknown: 0,
    leakValueMin: null,
    leakValueMax: null,
    leakUnvaluedCount: 0,
    sources: { shop_connections: [], server_keys: 0, delivery_attempts: 0, destination_mode: null },
    computedAt: new Date("2026-09-04T10:00:00Z"),
    ...over,
  };
}

describe("aggregateSnapshots", () => {
  it("returns null without snapshots (no data is not zero)", () => {
    expect(aggregateSnapshots([])).toBeNull();
  });

  it("sums counts and values across days of one currency and keeps the range", () => {
    const totals = aggregateSnapshots([
      row({ authoritativeCount: 10, authoritativeValuedCount: 10, authoritativeValue: "1000.00", currency: "EUR", deliveredCount: 7, gapNoConsent: 2, gapUnknown: 1, leakValueMin: "150.50", leakValueMax: "250.50", observedBrowserCount: 8 }),
      row({ periodStart: new Date("2026-09-02T00:00:00Z"), authoritativeCount: 5, authoritativeValuedCount: 4, authoritativeValue: "400.00", currency: "EUR", deliveredCount: 3, gapDeliveryFailed: 1, gapNotCaptured: 1, leakValueMin: "80.00", leakValueMax: "80.00", leakUnvaluedCount: 1, computedAt: new Date("2026-09-04T11:00:00Z") }),
    ])!;
    expect(totals.authoritative).toBe(15);
    expect(totals.valued).toBe(14);
    expect(totals.value).toBe(1400);
    expect(totals.currency).toBe("EUR");
    expect(totals.delivered).toBe(10);
    expect(totals.gaps).toEqual({ no_consent: 2, blocked: 0, not_captured: 1, delivery_failed: 1, unknown: 1 });
    expect(totals.definiteGaps).toBe(4);
    expect(totals.leakMin).toBe(230.5);
    expect(totals.leakMax).toBe(330.5);
    expect(totals.leakUnvalued).toBe(1);
    expect(totals.observedBrowser).toBe(8);
    expect(totals.days).toBe(2);
    expect(totals.computedAt?.toISOString()).toBe("2026-09-04T11:00:00.000Z");
    expect(leakShare(totals)).toBeCloseTo(4 / 15);
    expect(dominantReason(totals)).toBe("no_consent");
  });

  it("never sums mixed currencies: values become unknown and every gap is unvalued", () => {
    const totals = aggregateSnapshots([
      row({ authoritativeCount: 4, authoritativeValuedCount: 4, authoritativeValue: "100.00", currency: "EUR", gapBlocked: 2, leakValueMin: "50.00", leakValueMax: "50.00" }),
      row({ periodStart: new Date("2026-09-02T00:00:00Z"), authoritativeCount: 4, authoritativeValuedCount: 4, authoritativeValue: "100.00", currency: "USD", gapBlocked: 1, gapUnknown: 1, leakValueMin: "25.00", leakValueMax: "50.00" }),
    ])!;
    expect(totals.currencyMixed).toBe(true);
    expect(totals.currency).toBeNull();
    expect(totals.value).toBeNull();
    expect(totals.leakMin).toBeNull();
    expect(totals.leakMax).toBeNull();
    expect(totals.leakUnvalued).toBe(4);
    expect(dominantReason(totals)).toBe("blocked");
  });

  it("keeps counts without values when no record carries a value", () => {
    const totals = aggregateSnapshots([row({ authoritativeCount: 3, gapNotCaptured: 3, leakUnvaluedCount: 3 })])!;
    expect(totals.value).toBeNull();
    expect(totals.leakMin).toBeNull();
    expect(totals.leakUnvalued).toBe(3);
    expect(leakShare(totals)).toBe(1);
    expect(leakShare(aggregateSnapshots([row()]))).toBeNull();
    expect(dominantReason(aggregateSnapshots([row()]))).toBeNull();
  });

  it("floors to the UTC day", () => {
    expect(utcDay(new Date("2026-09-04T23:59:59Z")).toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });
});
