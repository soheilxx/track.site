import { describe, expect, it } from "vitest";
import { OVERAGE_PACKS } from "@track-site/catalog";
import {
  BASELINE_DAYS,
  RECENT_DAYS,
  compareOptions,
  dayKey,
  dayStart,
  describePolicy,
  detectUnusualLoad,
  evaluateHardLimit,
  fillDays,
  forecastPeriodEnd,
  overageFor,
  periodBounds,
  periodKeysBetween,
  thresholdStates,
  type DailyCount,
} from "./usage";

const now = new Date("2026-09-04T12:00:00Z");
const starterPack = OVERAGE_PACKS.starter;

/** `events` per day for the `days` complete days ending yesterday (recent window) and/or the 28 days before them (baseline). */
function series(opts: { recent?: number; baseline?: number; today?: number }): DailyCount[] {
  const rows: DailyCount[] = [];
  for (let offset = -(RECENT_DAYS + BASELINE_DAYS); offset <= 0; offset++) {
    const day = dayKey(dayStart(now, offset));
    const events = offset === 0 ? (opts.today ?? 0) : offset >= -RECENT_DAYS ? (opts.recent ?? 0) : (opts.baseline ?? 0);
    rows.push({ day, events });
  }
  return rows;
}

describe("periods and days", () => {
  it("bounds the UTC calendar month that contains now", () => {
    const p = periodBounds(now);
    expect(p.key).toBe("2026-09");
    expect(p.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(p.totalDays).toBe(30);
    expect(p.elapsedDays).toBe(3.5);
    expect(p.remainingDays).toBe(26.5);
  });

  it("lists every period key a range touches", () => {
    expect(periodKeysBetween(new Date("2026-07-31T23:00:00Z"), now)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(periodKeysBetween(now, now)).toEqual(["2026-09"]);
  });

  it("fills missing days with zero", () => {
    const filled = fillDays([{ day: "2026-09-02", events: 5 }], new Date("2026-09-01T10:00:00Z"), now);
    expect(filled).toEqual([
      { day: "2026-09-01", events: 0 },
      { day: "2026-09-02", events: 5 },
      { day: "2026-09-03", events: 0 },
      { day: "2026-09-04", events: 0 },
    ]);
  });
});

describe("forecast", () => {
  it("projects linearly from the average of the last 7 complete days", () => {
    const f = forecastPeriodEnd({ billable: 40_000, daily: series({ recent: 1_000, today: 300 }), now });
    expect(f.method).toBe("linear_7d");
    expect(f.window).toEqual({ from: "2026-08-28", to: "2026-09-03", days: 7, events: 7_000 });
    expect(f.dailyRate).toBe(1_000);
    expect(f.remainingDays).toBe(26.5);
    expect(f.projected).toBe(40_000 + 26_500);
    expect(f.basis).toBe("ledger");
  });

  it("has no basis without ledger rows and then projects the current count", () => {
    const f = forecastPeriodEnd({ billable: 1_234, daily: series({}), now });
    expect(f.basis).toBe("none");
    expect(f.dailyRate).toBe(0);
    expect(f.projected).toBe(1_234);
  });
});

describe("unusual load", () => {
  it("calls the load elevated at 1.5× the 4-week baseline", () => {
    const l = detectUnusualLoad(series({ baseline: 100, recent: 200 }), now);
    expect(l.verdict).toBe("elevated");
    expect(l.baseline).toEqual({ from: "2026-07-31", to: "2026-08-27", days: 28, events: 2_800 });
    expect(l.baselineRate).toBe(100);
    expect(l.recentRate).toBe(200);
    expect(l.deviation).toBe(1);
    expect(l.peakDay?.events).toBe(200);
  });

  it("is normal inside the band and reduced at half the baseline", () => {
    expect(detectUnusualLoad(series({ baseline: 100, recent: 120 }), now).verdict).toBe("normal");
    expect(detectUnusualLoad(series({ baseline: 100, recent: 40 }), now).verdict).toBe("reduced");
  });

  it("never calls tiny volumes elevated and stays unknown without a baseline", () => {
    expect(detectUnusualLoad(series({ baseline: 2, recent: 5 }), now).verdict).toBe("normal");
    const l = detectUnusualLoad(series({ recent: 500 }), now);
    expect(l.verdict).toBe("unknown");
    expect(l.reason).toBe("no_baseline");
    expect(l.deviation).toBeNull();
  });
});

describe("thresholds", () => {
  const warned = { 70: new Date("2026-09-03T08:00:00Z"), 90: null, 100: null } as const;

  it("marks reached thresholds and dates the next ones from the forecast", () => {
    const forecast = forecastPeriodEnd({ billable: 360_000, daily: series({ recent: 10_000 }), now });
    const states = thresholdStates({ limit: 500_000, billable: 360_000, warned, forecast, now })!;
    expect(states.map((s) => s.events)).toEqual([350_000, 450_000, 500_000]);
    expect(states[0]).toMatchObject({ pct: 70, reached: true, remaining: 0, expectedAt: null, warnedAt: warned[70] });
    expect(states[1]).toMatchObject({ pct: 90, reached: false, remaining: 90_000, warnedAt: null });
    expect(states[1]!.expectedAt?.toISOString()).toBe("2026-09-13T12:00:00.000Z");
    expect(states[2]!.expectedAt?.toISOString()).toBe("2026-09-18T12:00:00.000Z");
  });

  it("does not expect a threshold beyond the period end or without a rate", () => {
    const slow = forecastPeriodEnd({ billable: 360_000, daily: series({ recent: 1_000 }), now });
    const states = thresholdStates({ limit: 500_000, billable: 360_000, warned, forecast: slow, now })!;
    expect(states[1]!.expectedAt).toBeNull();
    const none = forecastPeriodEnd({ billable: 360_000, daily: series({}), now });
    expect(thresholdStates({ limit: 500_000, billable: 360_000, warned, forecast: none, now })![1]!.expectedAt).toBeNull();
  });

  it("is null for plans without a fixed cap", () => {
    const forecast = forecastPeriodEnd({ billable: 1, daily: series({}), now });
    expect(thresholdStates({ limit: null, billable: 1, warned, forecast, now })).toBeNull();
  });
});

describe("overage and the hard-limit rule", () => {
  it("counts packs for events above the limit", () => {
    expect(overageFor(550_000, 500_000, starterPack)).toMatchObject({ events: 50_000, packs: 1, costCents: 600, contractual: false });
    expect(overageFor(400_000, 500_000, starterPack)).toMatchObject({ events: 0, packs: 0, costCents: 0 });
    expect(overageFor(600_000, 500_000, null)).toMatchObject({ events: 100_000, packs: 0, costCents: 0, contractual: true });
    expect(overageFor(1_000, null, starterPack).events).toBe(0);
  });

  it("mirrors the worker: allow never pauses, pause pauses at 120 %, a cost limit pauses when the packs cost more", () => {
    expect(evaluateHardLimit({ policy: "allow", billable: 5_000_000, limit: 500_000, pack: starterPack, costLimitCents: null })).toBe(false);
    expect(evaluateHardLimit({ policy: "pause", billable: 599_999, limit: 500_000, pack: starterPack, costLimitCents: null })).toBe(false);
    expect(evaluateHardLimit({ policy: "pause", billable: 600_000, limit: 500_000, pack: starterPack, costLimitCents: null })).toBe(true);
    // 700k = 2 packs = €12 > €10 limit
    expect(evaluateHardLimit({ policy: "cost_limit", billable: 700_000, limit: 500_000, pack: starterPack, costLimitCents: 1_000 })).toBe(true);
    expect(evaluateHardLimit({ policy: "cost_limit", billable: 700_000, limit: 500_000, pack: starterPack, costLimitCents: 1_200 })).toBe(false);
    // no amount configured: the pause rule applies
    expect(evaluateHardLimit({ policy: "cost_limit", billable: 599_000, limit: 500_000, pack: starterPack, costLimitCents: null })).toBe(false);
    expect(evaluateHardLimit({ policy: "cost_limit", billable: 600_000, limit: 500_000, pack: starterPack, costLimitCents: null })).toBe(true);
    expect(evaluateHardLimit({ policy: "pause", billable: 1e9, limit: null, pack: null, costLimitCents: null })).toBe(false);
  });
});

describe("policy consequence", () => {
  it("names the events at which processing pauses", () => {
    expect(describePolicy({ policy: "allow", costLimitCents: null, limit: 500_000, pack: starterPack })).toMatchObject({ effective: "allow", pauseAtEvents: null, packsAllowed: null, note: null });
    expect(describePolicy({ policy: "pause", costLimitCents: null, limit: 500_000, pack: starterPack })).toMatchObject({ effective: "pause", pauseAtEvents: 600_000, gracePercent: 20 });
    // €18 pays for three €6 packs of 100k → pauses beyond 800k
    expect(describePolicy({ policy: "cost_limit", costLimitCents: 1_800, limit: 500_000, pack: starterPack })).toMatchObject({ effective: "cost_limit", packsAllowed: 3, pauseAtEvents: 800_001 });
    expect(describePolicy({ policy: "cost_limit", costLimitCents: null, limit: 500_000, pack: starterPack })).toMatchObject({ effective: "pause", pauseAtEvents: 600_000, note: "cost_limit_unset" });
    expect(describePolicy({ policy: "cost_limit", costLimitCents: 1_800, limit: 500_000, pack: null })).toMatchObject({ effective: "pause", note: "no_pack" });
    expect(describePolicy({ policy: "pause", costLimitCents: null, limit: null, pack: null })).toMatchObject({ pauseAtEvents: null, packsAllowed: null });
  });
});

describe("pack vs. plan comparison", () => {
  it("keeps the current plan when packs are cheaper", () => {
    const c = compareOptions({ planId: "starter", eventsPerMonth: 700_000, interval: "monthly" });
    expect(c.options.map((o) => [o.planId, o.kind, o.totalCents])).toEqual([
      ["starter", "current", 1_900 + 2 * 600],
      ["growth", "upgrade", 9_000],
      ["pro", "upgrade", 18_000],
    ]);
    expect(c.recommendation).toBe("stay");
    expect(c.cheapestPlanId).toBe("starter");
    expect(c.options[0]!.cheapest).toBe(true);
    expect(c.savingsCents).toBeNull();
  });

  it("names the cheaper higher plan with the savings, without changing anything", () => {
    const c = compareOptions({ planId: "starter", eventsPerMonth: 3_000_000, interval: "monthly" });
    expect(c.options[0]).toMatchObject({ packs: 25, overageCents: 15_000, totalCents: 16_900 });
    expect(c.recommendation).toBe("upgrade");
    expect(c.cheapestPlanId).toBe("growth");
    expect(c.savingsCents).toBe(16_900 - 9_000);
  });

  it("prices a yearly interval for twelve months of packs", () => {
    const c = compareOptions({ planId: "starter", eventsPerMonth: 700_000, interval: "yearly" });
    expect(c.options[0]).toMatchObject({ periodMonths: 12, baseCents: 19_000, overageCents: 2 * 600 * 12, totalCents: 19_000 + 14_400 });
  });

  it("is contractual for Enterprise and empty for unknown plans", () => {
    expect(compareOptions({ planId: "enterprise", eventsPerMonth: 1, interval: "monthly" }).recommendation).toBe("contractual");
    expect(compareOptions({ planId: "legacy", eventsPerMonth: 1, interval: "monthly" })).toMatchObject({ recommendation: "none", options: [] });
  });
});
