import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// the module is server-only at runtime; here it runs against the migrated test database
vi.mock("server-only", () => ({}));

import { planRecord } from "@track-site/catalog";
import { usagePeriodKey } from "@track-site/core";
import { organization, plans, subscriptions, usagePeriods, withPlatform, withWorker } from "@track-site/db";
import { testDb } from "@track-site/db/testing";
import { loadRevenueSnapshot, overageCsv, revenueView, subscriptionsCsv } from "./revenue";

/**
 * Runs the Revenue loader as `tracksite_ops` (migration 0014) against the migrated test database: a
 * throwaway organisation with an active yearly Growth subscription, a past-due Starter one on a second
 * organisation, an overage of the current period with the `allow` policy, and asserts that the snapshot,
 * the view and the CSV exports carry exactly those facts — metadata and aggregates, nothing else.
 */
const t = testDb();
const now = new Date();
const stamp = Date.now();
let growthOrg = "";
let starterOrg = "";

beforeAll(async () => {
  for (const id of ["starter", "growth"] as const) {
    const p = planRecord(id);
    await t.db.insert(plans).values({ id: p.id, name: p.name, sortOrder: p.sortOrder, limits: p.limits, features: p.features, stripePriceEnv: p.stripePriceEnv, isPublic: p.isPublic, contactSales: p.contactSales }).onConflictDoNothing();
  }
  const [g] = await t.db.insert(organization).values({ name: "Revenue, Growth", slug: `ops-revenue-growth-${stamp}` }).returning({ id: organization.id });
  const [s] = await t.db.insert(organization).values({ name: "Revenue Starter", slug: `ops-revenue-starter-${stamp}` }).returning({ id: organization.id });
  growthOrg = g!.id;
  starterOrg = s!.id;
  await t.db.insert(subscriptions).values([
    { organizationId: growthOrg, planId: "growth", status: "active", interval: "yearly", stripeCustomerId: `cus_test_${stamp}`, stripeSubscriptionId: `sub_test_${stamp}`, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) },
    { organizationId: starterOrg, planId: "starter", status: "past_due", interval: "monthly", graceUntil: new Date(now.getTime() + 3 * 86_400_000) },
  ]);
  // raw insert of the columns the loader reads: the schema may carry columns of other slices whose migrations the test database has not received yet
  await withWorker(t.db, async (tx) => {
    await tx.execute(sql`insert into organization_settings (organization_id, usage_overage_policy) values (${starterOrg}, 'allow')`);
    await tx.insert(usagePeriods).values({ organizationId: starterOrg, periodKey: usagePeriodKey(now), acceptedEvents: 760_000, billableEvents: 750_000, droppedEvents: 10_000, limitEvents: 500_000, siteCount: 2 });
  });
});

afterAll(async () => {
  await t.close();
});

describe("loadRevenueSnapshot (test database, tracksite_ops)", () => {
  it("reads subscriptions with organisation metadata, the period's usage and the ledger freshness", async () => {
    const snapshot = await withPlatform(t.db, (tx) => loadRevenueSnapshot(tx, now));
    expect(snapshot.periodKey).toBe(usagePeriodKey(now));
    const growth = snapshot.subscriptions.find((r) => r.organizationId === growthOrg);
    expect(growth).toMatchObject({ organizationName: "Revenue, Growth", planId: "growth", status: "active", interval: "yearly", stripeCustomerId: `cus_test_${stamp}`, suspendedAt: null });
    expect(growth!.currentPeriodEnd).toBeInstanceOf(Date);
    const starter = snapshot.subscriptions.find((r) => r.organizationId === starterOrg);
    expect(starter).toMatchObject({ planId: "starter", status: "past_due", interval: "monthly" });
    const usage = snapshot.usage.find((r) => r.organizationId === starterOrg);
    expect(usage).toMatchObject({ organizationSlug: `ops-revenue-starter-${stamp}`, planId: "starter", subscriptionStatus: "past_due", billableEvents: 750_000, acceptedEvents: 760_000, siteCount: 2, limitEvents: 500_000, overagePolicy: "allow", costLimitCents: null, hardLimitHitAt: null });
    expect(typeof snapshot.ledger.failedEvents).toBe("number");
    expect(snapshot.ledger.subscriptionsUpdatedAt).toBeInstanceOf(Date);
  });

  it("derives the view and the CSV exports from those facts", async () => {
    const snapshot = await withPlatform(t.db, (tx) => loadRevenueSnapshot(tx, now));
    const view = revenueView(snapshot);
    expect(view.summary.mrrCents).toBeGreaterThanOrEqual(90_000 / 12);
    expect(view.pastDue.some((r) => r.organizationId === starterOrg)).toBe(true);
    const over = view.overage.rows.find((r) => r.organizationId === starterOrg);
    expect(over).toMatchObject({ overEvents: 250_000, packs: 3, listCents: 1_800, effectivePolicy: "allow", exposureCents: 1_800, contractual: false });
    expect(view.topUsage.some((r) => r.organizationId === starterOrg)).toBe(true);
    expect(view.customers.get(`cus_test_${stamp}`)).toMatchObject({ organizationId: growthOrg, name: "Revenue, Growth" });

    const csv = subscriptionsCsv(snapshot.subscriptions);
    expect(csv).toContain(`${growthOrg},ops-revenue-growth-${stamp},"Revenue, Growth",growth,active,yearly,7500,`);
    expect(csv).toContain(`${starterOrg},ops-revenue-starter-${stamp},Revenue Starter,starter,past_due,monthly,,`);
    const overCsv = overageCsv(view.overage);
    expect(overCsv).toContain(`${snapshot.periodKey},${starterOrg},ops-revenue-starter-${stamp},Revenue Starter,starter,750000,500000,250000,100000,600,3,1800,allow,1800,false,`);
  });
});
