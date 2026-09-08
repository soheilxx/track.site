import { describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the reducers under test are pure
vi.mock("server-only", () => ({}));

import {
  DAILY_WINDOW_DAYS,
  FUNNEL_STAGES,
  MIN_COHORT_SIZE,
  RETENTION_COHORT_WEEKS,
  RETENTION_WEEKS,
  SMALL_SAMPLE_ORGANIZATIONS,
  WEEKLY_WINDOW_WEEKS,
  activeView,
  cohortSince,
  connectorsView,
  dayKey,
  funnelView,
  growthView,
  median,
  planMixView,
  retentionView,
  signupSince,
  signupsView,
  stageAt,
  weekStartUtc,
  type GrowthSnapshot,
  type OrgMilestones,
} from "./growth";

// Tuesday 2026-09-08 12:00 UTC; the current ISO week starts Monday 2026-09-07
const now = new Date("2026-09-08T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

let seq = 0;
function org(over: Partial<OrgMilestones> & { createdAt: Date }): OrgMilestones {
  seq++;
  return {
    organizationId: `org-${seq}`,
    firstSiteAt: null,
    verifiedAt: null,
    firstEventAt: null,
    firstDestinationAt: null,
    firstPublishedAt: null,
    payingAt: null,
    ...over,
  };
}

describe("calendar helpers", () => {
  it("starts ISO weeks on Monday 00:00 UTC", () => {
    expect(dayKey(weekStartUtc(now))).toBe("2026-09-07");
    expect(dayKey(weekStartUtc(new Date("2026-09-07T00:00:00Z")))).toBe("2026-09-07");
    expect(dayKey(weekStartUtc(new Date("2026-09-06T23:59:59Z")))).toBe("2026-08-31");
    expect(dayKey(weekStartUtc(new Date("2026-09-13T23:59:59Z")))).toBe("2026-09-07");
  });

  it("fetches sign-ups far enough back for both the weekly buckets and the previous 30 days", () => {
    const since = signupSince(now);
    expect(since.getTime()).toBeLessThanOrEqual(weekStartUtc(now).getTime() - (WEEKLY_WINDOW_WEEKS - 1) * 7 * 86_400_000);
    expect(since.getTime()).toBeLessThanOrEqual(now.getTime() - (2 * DAILY_WINDOW_DAYS - 1) * 86_400_000);
    expect(dayKey(cohortSince(now))).toBe(dayKey(new Date(weekStartUtc(now).getTime() - (RETENTION_COHORT_WEEKS - 1) * 7 * 86_400_000)));
  });

  it("computes medians for odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("signupsView", () => {
  it("gap-fills the daily window, buckets weeks on Monday and marks the current week partial", () => {
    const view = signupsView(
      [
        { day: "2026-09-08", users: 2, organizations: 1 },
        { day: "2026-09-06", users: 1, organizations: 0 },
        { day: "2026-08-10", users: 4, organizations: 2 },
        { day: "2026-07-01", users: 9, organizations: 9 },
      ],
      now,
    );
    expect(view.daily).toHaveLength(DAILY_WINDOW_DAYS);
    expect(view.daily.at(-1)).toEqual({ day: "2026-09-08", users: 2, organizations: 1 });
    expect(view.daily[0]?.day).toBe("2026-08-10");
    expect(view.daily.filter((d) => d.users === 0 && d.organizations === 0)).toHaveLength(DAILY_WINDOW_DAYS - 3);

    expect(view.weekly).toHaveLength(WEEKLY_WINDOW_WEEKS);
    const current = view.weekly.at(-1)!;
    expect(current).toEqual({ weekStart: "2026-09-07", users: 2, organizations: 1, partial: true });
    expect(view.weekly.at(-2)).toEqual({ weekStart: "2026-08-31", users: 1, organizations: 0, partial: false });
    expect(view.weekly.find((w) => w.weekStart === "2026-08-10")).toEqual({ weekStart: "2026-08-10", users: 4, organizations: 2, partial: false });
    expect(view.weekly[0]?.weekStart).toBe("2026-06-22");

    expect(view.last7).toEqual({ days: 7, users: 3, organizations: 1 });
    expect(view.last30).toEqual({ days: 30, users: 7, organizations: 3 });
    // 2026-07-01 lies before the previous 30 days (2026-07-11 … 2026-08-09)
    expect(view.previous30).toEqual({ days: 30, users: 0, organizations: 0 });
    expect(view.any).toBe(true);
  });

  it("reports an empty window honestly", () => {
    const view = signupsView([], now);
    expect(view.any).toBe(false);
    expect(view.last30).toEqual({ days: 30, users: 0, organizations: 0 });
    expect(view.weekly.every((w) => w.users === 0 && w.organizations === 0)).toBe(true);
  });

  it("merges duplicate day rows", () => {
    const view = signupsView(
      [
        { day: "2026-09-08", users: 1, organizations: 0 },
        { day: "2026-09-08", users: 0, organizations: 1 },
      ],
      now,
    );
    expect(view.daily.at(-1)).toEqual({ day: "2026-09-08", users: 1, organizations: 1 });
  });
});

describe("funnelView", () => {
  it("counts milestones independently, derives step and total rates and medians", () => {
    const rows = [
      org({ createdAt: days(-100), firstSiteAt: days(-99), verifiedAt: days(-98), firstEventAt: days(-97), firstDestinationAt: days(-96), firstPublishedAt: days(-95), payingAt: days(-90) }),
      org({ createdAt: days(-50), firstSiteAt: days(-49), verifiedAt: days(-45), firstEventAt: days(-44) }),
      org({ createdAt: days(-10), firstSiteAt: days(-9) }),
      // paying without a verified domain still counts at "paying" (milestones are independent)
      org({ createdAt: days(-5), firstSiteAt: days(-5), payingAt: days(-4) }),
      org({ createdAt: days(-1) }),
    ];
    const view = funnelView(rows, now);
    expect(view.organizations).toBe(5);
    expect(view.recentOrganizations).toBe(4);
    expect(view.recentDays).toBe(90);
    expect(view.stages.map((s) => s.key)).toEqual([...FUNNEL_STAGES]);
    const by = Object.fromEntries(view.stages.map((s) => [s.key, s]));

    expect(by.created).toMatchObject({ count: 5, stepRate: null, totalRate: null, medianDays: null });
    expect(by.site).toMatchObject({ count: 4, stepRate: 0.8, totalRate: 0.8 });
    // days to first site: 1, 1, 1, 0 → median 1
    expect(by.site!.medianDays).toBe(1);
    expect(by.verified).toMatchObject({ count: 2, stepRate: 0.5, totalRate: 0.4 });
    expect(by.verified!.medianDays).toBe(3.5);
    expect(by.event).toMatchObject({ count: 2, stepRate: 1, totalRate: 0.4 });
    expect(by.destination).toMatchObject({ count: 1, stepRate: 0.5, totalRate: 0.2, medianDays: 4 });
    expect(by.published).toMatchObject({ count: 1, stepRate: 1, totalRate: 0.2, medianDays: 5 });
    expect(by.paying).toMatchObject({ count: 2, stepRate: 2, totalRate: 0.4 });
    expect(by.paying!.medianDays).toBe(5.5);

    expect(by.created!.recent).toEqual({ count: 4, stepRate: null, totalRate: null });
    expect(by.site!.recent).toEqual({ count: 3, stepRate: 0.75, totalRate: 0.75 });
    // no recent organisation published a configuration → the step rate of "paying" has no base
    expect(by.published!.recent).toEqual({ count: 0, stepRate: null, totalRate: 0 });
    expect(by.paying!.recent).toEqual({ count: 1, stepRate: null, totalRate: 0.25 });
  });

  it("returns null rates and medians without organisations", () => {
    const view = funnelView([], now);
    expect(view.organizations).toBe(0);
    expect(view.stages.every((s) => s.count === 0 && s.stepRate === null && s.totalRate === null && s.medianDays === null)).toBe(true);
  });

  it("clamps a milestone before the creation instant to zero days", () => {
    const view = funnelView([org({ createdAt: days(-1), firstSiteAt: days(-2) })], now);
    expect(view.stages.find((s) => s.key === "site")?.medianDays).toBe(0);
    expect(stageAt(org({ createdAt: now }), "created")).toEqual(now);
  });
});

describe("retentionView", () => {
  it("builds Monday cohorts with complete, partial and pending cells", () => {
    const monday = weekStartUtc(now); // 2026-09-07
    const wk = (n: number) => new Date(monday.getTime() - n * 7 * 86_400_000);
    const organizations = [
      { organizationId: "a", createdAt: new Date(wk(3).getTime() + 3_600_000) },
      { organizationId: "b", createdAt: new Date(wk(3).getTime() + 2 * 86_400_000) },
      { organizationId: "c", createdAt: new Date(wk(1).getTime() + 86_400_000) },
      { organizationId: "d", createdAt: new Date(monday.getTime() + 3_600_000) },
    ];
    const activity = [
      { organizationId: "a", week: 0 },
      { organizationId: "a", week: 1 },
      { organizationId: "b", week: 0 },
      { organizationId: "b", week: 2 },
      { organizationId: "c", week: 0 },
      { organizationId: "d", week: 0 },
    ];
    const view = retentionView(organizations, activity, now, new Date("2026-01-01T00:00:00Z"));
    expect(view.measured).toBe(true);
    expect(view.weeks).toBe(RETENTION_WEEKS);
    expect(view.cohorts).toHaveLength(RETENTION_COHORT_WEEKS);
    expect(view.aggregatesSince).toBe("2026-01-01T00:00:00.000Z");
    expect(view.cohorts.at(-1)?.weekStart).toBe("2026-09-07");

    const cohort3 = view.cohorts.find((c) => c.weekStart === dayKey(wk(3)))!;
    expect(cohort3.size).toBe(2);
    expect(cohort3.small).toBe(true);
    // weeks 0 and 1 have elapsed for every member (Monday + 7 + 7(n+1) ≤ now): 3 weeks ago + 14 days ≤ now
    expect(cohort3.cells[0]).toEqual({ week: 0, active: 2, rate: 1, state: "complete" });
    expect(cohort3.cells[1]).toEqual({ week: 1, active: 1, rate: 0.5, state: "complete" });
    // week 2 starts 1 week ago and completes 3 weeks ago + 7 + 21 days = next week → partial
    expect(cohort3.cells[2]).toEqual({ week: 2, active: 1, rate: 0.5, state: "partial" });
    // week 3 starts this Monday → partial (started, not complete); week 4 is pending
    expect(cohort3.cells[3]?.state).toBe("partial");
    expect(cohort3.cells[4]).toEqual({ week: 4, active: 0, rate: null, state: "pending" });

    const current = view.cohorts.at(-1)!;
    expect(current.size).toBe(1);
    expect(current.cells[0]).toEqual({ week: 0, active: 1, rate: 1, state: "partial" });
    expect(current.cells[1]?.state).toBe("pending");

    const empty = view.cohorts.find((c) => c.weekStart === dayKey(wk(5)))!;
    expect(empty.size).toBe(0);
    expect(empty.cells[0]).toEqual({ week: 0, active: 0, rate: null, state: "complete" });
    expect(empty.small).toBe(true);
    expect(MIN_COHORT_SIZE).toBeGreaterThan(2);
  });

  it("reports no measurement without organisations in the window", () => {
    const view = retentionView([], [], now, null);
    expect(view.measured).toBe(false);
    expect(view.aggregatesSince).toBeNull();
    expect(view.cohorts.every((c) => c.size === 0)).toBe(true);
  });
});

describe("activeView / planMixView / connectorsView", () => {
  it("relates active organisations to the total", () => {
    const view = activeView([{ days: 7, organizations: 2 }, { days: 30, organizations: 5 }], 10);
    expect(view.windows).toEqual([
      { days: 7, organizations: 2, share: 0.2 },
      { days: 30, organizations: 5, share: 0.5 },
    ]);
    expect(activeView([{ days: 7, organizations: 0 }], 0).windows[0]?.share).toBeNull();
  });

  it("groups organisations by catalogue plan and subscription state, unknown plans and missing rows included", () => {
    const view = planMixView(
      [
        { planId: "starter", status: "active", count: 3 },
        { planId: "starter", status: "trialing", count: 1 },
        { planId: "growth", status: "past_due", count: 1 },
        { planId: "growth", status: "canceled", count: 2 },
        { planId: "legacy-x", status: "paused", count: 1 },
        { planId: null, status: null, count: 4 },
      ],
      12,
    );
    expect(view.organizations).toBe(12);
    expect(view.paying).toBe(3);
    const starter = view.rows.find((r) => r.planId === "starter")!;
    expect(starter).toMatchObject({ known: true, organizations: 4, active: 3, trialing: 1, pastDue: 0, canceled: 0, other: 0 });
    expect(starter.name).toBeTruthy();
    expect(starter.share).toBeCloseTo(4 / 12);
    expect(view.rows.find((r) => r.planId === "growth")).toMatchObject({ organizations: 3, pastDue: 1, canceled: 2 });
    expect(view.rows.find((r) => r.planId === "legacy-x")).toMatchObject({ known: false, name: null, organizations: 1, other: 1 });
    const none = view.rows.at(-1)!;
    expect(none).toMatchObject({ planId: null, known: true, organizations: 4, other: 4 });
    expect(none.share).toBeCloseTo(4 / 12);
  });

  it("ranks connector types by organisations with a connected integration and counts the tail", () => {
    const view = connectorsView(
      [
        { connectorType: "meta", status: "connected", integrations: 5, organizations: 4 },
        { connectorType: "meta", status: "error", integrations: 1, organizations: 1 },
        { connectorType: "ga4", status: "connected", integrations: 6, organizations: 3 },
        { connectorType: "ga4", status: "paused", integrations: 2, organizations: 2 },
        { connectorType: "webhook", status: "draft", integrations: 3, organizations: 3 },
        { connectorType: "tiktok", status: "connected", integrations: 1, organizations: 1 },
      ],
      6,
      2,
    );
    expect(view.rows.map((r) => r.connectorType)).toEqual(["meta", "ga4"]);
    expect(view.rows[0]).toEqual({ connectorType: "meta", organizations: 4, connected: 5, paused: 0, error: 1, notConnected: 0, total: 6 });
    expect(view.rows[1]).toEqual({ connectorType: "ga4", organizations: 3, connected: 6, paused: 2, error: 0, notConnected: 0, total: 8 });
    expect(view.more).toBe(2);
    expect(view.connected).toBe(12);
    expect(view.organizationsWithConnected).toBe(6);
  });
});

describe("growthView", () => {
  it("assembles the page view and flags small samples", () => {
    const snapshot: GrowthSnapshot = {
      now,
      totals: { users: 3, organizations: 2, sites: 1 },
      signupDays: [{ day: "2026-09-08", users: 1, organizations: 1 }],
      milestones: [org({ createdAt: days(-3), firstSiteAt: days(-2) }), org({ createdAt: days(-1) })],
      cohortOrganizations: [{ organizationId: "x", createdAt: days(-3) }],
      activity: [{ organizationId: "x", week: 0 }],
      aggregatesSince: days(-3),
      activeOrganizations: [
        { days: 7, organizations: 1 },
        { days: 30, organizations: 1 },
      ],
      planRows: [{ planId: null, status: null, count: 2 }],
      connectorRows: [],
      organizationsWithConnected: 0,
    };
    const view = growthView(snapshot);
    expect(view.generatedAt).toBe(now.toISOString());
    expect(view.smallSample).toBe(true);
    expect(SMALL_SAMPLE_ORGANIZATIONS).toBeGreaterThan(2);
    expect(view.funnel.stages[1]).toMatchObject({ key: "site", count: 1, stepRate: 0.5 });
    expect(view.active.windows[0]).toEqual({ days: 7, organizations: 1, share: 0.5 });
    expect(view.planMix.rows).toHaveLength(1);
    expect(view.connectors.rows).toHaveLength(0);
    expect(view.retention.measured).toBe(true);
    expect(view.signups.last7.organizations).toBe(1);
  });
});
