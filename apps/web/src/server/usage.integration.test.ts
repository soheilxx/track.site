import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRecord } from "@track-site/catalog";
import { newUlid, usagePeriodKey } from "@track-site/core";
import { orgSettings, organization, sites, usageLedger, usagePeriods, withTenant, withWorker } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import { BASELINE_DAYS, RECENT_DAYS, dayKey, dayStart, usageGuard, type PlanFacts } from "./usage";

/**
 * Runs the Usage & Cost Guard queries against the migrated test database through RLS: a throwaway
 * organization with one site, one ledger row per UTC day (quantity = that day's billable events) for the
 * baseline window, the recent window and today, the period counters the worker would have written and a
 * `cost_limit` policy. Asserts that the loader reads the same facts back and derives the labelled numbers.
 */
const t = testDb();
const now = new Date();
let orgId = "";
let siteId = "";
let periodTotal = 0;

const starter: PlanFacts = { planId: "starter", limits: planRecord("starter").limits, status: "active" };

beforeAll(async () => {
  const [org] = await t.db
    .insert(organization)
    .values({ name: "Usage guard", slug: `usage-guard-${Date.now()}` })
    .returning({ id: organization.id });
  orgId = org!.id;
  const trackingId = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  const [site] = await withTenant(t.db, orgId, (tx) => tx.insert(sites).values({ organizationId: orgId, trackingId, name: "Shop" }).returning({ id: sites.id }));
  siteId = site!.id;
  // raw insert of the three columns the guard reads: the schema may carry columns of other slices whose migrations the test database has not received yet
  await withTenant(t.db, orgId, (tx) => tx.execute(sql`insert into ${orgSettings} (organization_id, usage_overage_policy, usage_cost_limit_cents) values (${orgId}, 'cost_limit', 1800)`));

  const period = usagePeriodKey(now);
  const rows: (typeof usageLedger.$inferInsert)[] = [];
  for (let offset = -(RECENT_DAYS + BASELINE_DAYS); offset <= 0; offset++) {
    const at = new Date(dayStart(now, offset).getTime() + 6 * 3_600_000);
    if (at.getTime() > now.getTime()) continue;
    const quantity = offset === 0 ? 50 : offset >= -RECENT_DAYS ? 200 : 100;
    const key = usagePeriodKey(at);
    if (key === period) periodTotal += quantity;
    rows.push({ id: newUlid(), organizationId: orgId, siteId, periodKey: key, eventId: `usage-guard-${orgId}-${dayKey(at)}`, kind: "billable_event", quantity, recordedAt: at });
  }
  await withWorker(t.db, async (tx) => {
    await tx.insert(usageLedger).values(rows);
    await tx.insert(usagePeriods).values({ organizationId: orgId, periodKey: period, acceptedEvents: periodTotal + 10, billableEvents: periodTotal, droppedEvents: 10, limitEvents: 500_000, siteCount: 1 });
  });
});

afterAll(async () => {
  await t.close();
});

describe("usageGuard (test database)", () => {
  it("reads the period counters, the daily ledger and the policy back through RLS", async () => {
    const guard = await withTenant(t.db, orgId, (tx) => usageGuard(tx, orgId, starter, now));
    expect(guard.period.key).toBe(usagePeriodKey(now));
    expect(guard.plan).toMatchObject({ id: "starter", name: "Starter", limit: 500_000, interval: "monthly" });
    expect(guard.current).toMatchObject({ billable: periodTotal, accepted: periodTotal + 10, dropped: 10, source: "period", hardLimitHitAt: null });
    expect(guard.daily).toHaveLength(RECENT_DAYS + BASELINE_DAYS + 1);
    expect(guard.daily.at(-1)).toEqual({ day: dayKey(now), events: now.getUTCHours() >= 6 ? 50 : 0 });
    expect(guard.forecast.window.events).toBe(RECENT_DAYS * 200);
    expect(guard.forecast.basis).toBe("ledger");
    expect(guard.forecast.projected).toBeGreaterThanOrEqual(periodTotal);
    expect(guard.load.baseline.events).toBe(BASELINE_DAYS * 100);
    expect(guard.load.verdict).toBe("elevated");
    expect(guard.thresholds?.map((th) => th.pct)).toEqual([70, 90, 100]);
    expect(guard.policy).toMatchObject({ policy: "cost_limit", costLimitCents: 1_800, effective: "cost_limit", packsAllowed: 3, pauseAtEvents: 800_001 });
    expect(guard.sites).toEqual([{ siteId, name: "Shop", trackingId: expect.any(String), events: periodTotal, share: 1 }]);
    expect(guard.ledger.latestAt).not.toBeNull();
    expect(guard.comparison.options[0]).toMatchObject({ planId: "starter", kind: "current" });
    expect(guard.subscription).toBeNull();
  });

  it("is empty for an organization that never recorded usage", async () => {
    const [other] = await t.db
      .insert(organization)
      .values({ name: "Usage guard (empty)", slug: `usage-guard-empty-${Date.now()}` })
      .returning({ id: organization.id });
    const guard = await withTenant(t.db, other!.id, (tx) => usageGuard(tx, other!.id, starter, now));
    expect(guard.current).toMatchObject({ billable: 0, source: "none", accepted: null });
    expect(guard.forecast).toMatchObject({ projected: 0, basis: "none" });
    expect(guard.load).toMatchObject({ verdict: "unknown", reason: "no_baseline" });
    expect(guard.policy).toMatchObject({ policy: "pause", effective: "pause", pauseAtEvents: 600_000 });
    expect(guard.sites).toEqual([]);
    expect(guard.ledger).toEqual({ latestAt: null, stale: false });
  });

  it("never shows another tenant's usage", async () => {
    const [other] = await t.db
      .insert(organization)
      .values({ name: "Usage guard (other)", slug: `usage-guard-other-${Date.now()}` })
      .returning({ id: organization.id });
    // the loader is handed the wrong organization id on purpose: RLS scopes every query to the transaction's tenant
    const guard = await withTenant(t.db, other!.id, (tx) => usageGuard(tx, orgId, starter, now));
    expect(guard.current.billable).toBe(0);
    expect(guard.sites).toEqual([]);
    expect(guard.daily.every((d) => d.events === 0)).toBe(true);
  });
});
