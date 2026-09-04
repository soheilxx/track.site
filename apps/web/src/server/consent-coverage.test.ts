import { describe, expect, it } from "vitest";
import { summarizeCoverage, type ConsentSnapshotRow } from "./consent-coverage";

const at = (iso: string) => new Date(iso);
const snapshot = (overrides: Partial<ConsentSnapshotRow>): ConsentSnapshotRow => ({ granted: ["necessary"], source: "api", region: "DE", gpc: false, eventCount: 1, firstSeenAt: at("2026-08-01T00:00:00Z"), lastSeenAt: at("2026-08-20T00:00:00Z"), ...overrides });

describe("consent coverage", () => {
  it("has no figure without recorded decisions", () => {
    expect(summarizeCoverage([])).toBeNull();
    expect(summarizeCoverage([snapshot({ eventCount: 0 })])).toBeNull();
  });
  it("weights shares by stored events and applies GPC to marketing", () => {
    const summary = summarizeCoverage(
      [
        snapshot({ granted: ["necessary", "analytics", "marketing"], eventCount: 60 }),
        snapshot({ granted: ["necessary", "analytics"], source: "cmp:usercentrics", region: "FR", eventCount: 20 }),
        snapshot({ granted: ["necessary"], source: "default", region: "US", eventCount: 15 }),
        snapshot({ granted: ["necessary", "analytics", "marketing", "personalization"], source: "gpc", region: "US", gpc: true, eventCount: 5, lastSeenAt: at("2026-08-25T00:00:00Z"), firstSeenAt: at("2026-07-15T00:00:00Z") }),
      ],
      at("2026-08-26T00:00:00Z"),
    )!;
    expect(summary.events).toBe(100);
    expect(summary.states).toBe(4);
    expect(summary.explicitShare).toBeCloseTo(0.85);
    expect(summary.purposeShare).toEqual({ analytics: 0.85, marketing: 0.6, personalization: 0 });
    expect(summary.gpcShare).toBeCloseTo(0.05);
    expect(summary.byRegion.map((s) => s.key)).toEqual(["EU", "US"]);
    expect(summary.byRegion[0]).toMatchObject({ events: 80, share: 0.8, explicitShare: 1, marketingShare: 0.75 });
    expect(summary.byRegion[1]).toMatchObject({ events: 20, explicitShare: 0.25, marketingShare: 0 });
    expect(summary.bySource.map((s) => s.key)).toEqual(["api", "cmp:usercentrics", "default", "gpc"]);
    expect(summary.firstSeenAt.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(summary.lastSeenAt.toISOString()).toBe("2026-08-25T00:00:00.000Z");
    expect(summary.stale).toBe(false);
  });
  it("flags coverage as stale after a week without decisions", () => {
    expect(summarizeCoverage([snapshot({})], at("2026-08-28T00:00:00Z"))!.stale).toBe(true);
    expect(summarizeCoverage([snapshot({})], at("2026-08-26T00:00:00Z"))!.stale).toBe(false);
  });
});
