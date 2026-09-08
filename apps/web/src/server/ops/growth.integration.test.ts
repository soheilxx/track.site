import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  configPublications,
  configVersions,
  domains,
  environments,
  eventAggregates,
  integrations,
  organization,
  plans,
  sites,
  subscriptions,
  user,
  withPlatform,
  withWorker,
} from "@track-site/db";
import { testDb } from "@track-site/db/testing";

/**
 * Runs the growth loaders against the migrated test database as `tracksite_ops`: one organisation that
 * reached every milestone (site, verified domain, accepted aggregates in two relative weeks, connected
 * destination, publication, active subscription) and one fresh organisation with nothing. Other
 * integration tests share the database, so every assertion is relative to the rows seeded here.
 */
vi.mock("server-only", () => ({}));

import { DAY_MS, dayKey, growthView, loadGrowthHeadline, loadGrowthSnapshot } from "./growth";

const t = testDb();
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
const stamp = Date.now();
let userId = "";
let activeOrgId = "";
let freshOrgId = "";

const trackingId = () => Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");

beforeAll(async () => {
  const [account] = await t.db.insert(user).values({ name: "Growth tester", email: `growth-${stamp}@test.local`, createdAt: ago(20) }).returning({ id: user.id });
  userId = account!.id;
  const [active] = await t.db.insert(organization).values({ name: "Growth active", slug: `growth-active-${stamp}`, createdAt: ago(20) }).returning({ id: organization.id });
  activeOrgId = active!.id;
  const [fresh] = await t.db.insert(organization).values({ name: "Growth fresh", slug: `growth-fresh-${stamp}`, createdAt: ago(2) }).returning({ id: organization.id });
  freshOrgId = fresh!.id;
  await t.db
    .insert(plans)
    .values({ id: "starter", name: "Starter", sortOrder: 1, limits: { events: null, sites: null, destinations: null, seats: null, retentionDays: null } as never, stripePriceEnv: { monthly: null, yearly: null } })
    .onConflictDoNothing();

  await withWorker(t.db, async (tx) => {
    const [site] = await tx.insert(sites).values({ organizationId: activeOrgId, trackingId: trackingId(), name: "Shop", createdAt: ago(19) }).returning({ id: sites.id });
    const siteId = site!.id;
    await tx.insert(domains).values({ organizationId: activeOrgId, siteId, hostname: `shop-${stamp}.example`, verificationToken: "tok", verifiedAt: ago(18) });
    const [env] = await tx.insert(environments).values({ organizationId: activeOrgId, siteId, kind: "production", name: "Production", isDefault: true }).returning({ id: environments.id });
    const environmentId = env!.id;
    await tx.insert(eventAggregates).values([
      // week 0 after sign-up (day 18 → 2 days after creation) and week 2 (day 3 → 17 days after creation)
      { organizationId: activeOrgId, siteId, environmentId, bucketStart: ago(18), eventName: "page_view", source: "browser", received: 5, accepted: 5, billable: 5 },
      { organizationId: activeOrgId, siteId, environmentId, bucketStart: ago(3), eventName: "purchase", source: "server", received: 2, accepted: 2, billable: 2 },
      // dropped-only bucket: never counts as activity
      { organizationId: activeOrgId, siteId, environmentId, bucketStart: ago(1), eventName: "page_view", source: "browser", received: 3, accepted: 0, dropped: { consent: 3 } },
    ]);
    await tx.insert(integrations).values({ organizationId: activeOrgId, siteId, connectorType: "reddit", name: "Reddit", status: "connected", createdAt: ago(17) });
    const [version] = await tx
      .insert(configVersions)
      .values({ organizationId: activeOrgId, siteId, environmentId, version: 1, bundle: {}, digest: "d", signature: "s", keyId: "k", createdAt: ago(16) })
      .returning({ id: configVersions.id });
    await tx.insert(configPublications).values({ organizationId: activeOrgId, siteId, environmentId, versionId: version!.id, kind: "publish", publishedAt: ago(16) });
    await tx.insert(subscriptions).values({ organizationId: activeOrgId, planId: "starter", status: "active", interval: "monthly", createdAt: ago(15) });
  });
});

afterAll(async () => {
  await t.db.delete(organization).where(inArray(organization.id, [activeOrgId, freshOrgId].filter(Boolean)));
  if (userId) await t.db.delete(user).where(eq(user.id, userId));
  await t.close();
});

describe("loadGrowthSnapshot (tracksite_ops)", () => {
  it("collects sign-ups, milestones, activity, plan and connector rows", async () => {
    const snapshot = await withPlatform(t.db, (tx) => loadGrowthSnapshot(tx, now));

    expect(snapshot.totals.organizations).toBeGreaterThanOrEqual(2);
    expect(snapshot.totals.users).toBeGreaterThanOrEqual(1);
    expect(snapshot.totals.sites).toBeGreaterThanOrEqual(1);

    const day20 = snapshot.signupDays.find((d) => d.day === dayKey(ago(20)));
    expect(day20?.users).toBeGreaterThanOrEqual(1);
    expect(day20?.organizations).toBeGreaterThanOrEqual(1);
    expect(snapshot.signupDays.find((d) => d.day === dayKey(ago(2)))?.organizations).toBeGreaterThanOrEqual(1);

    const active = snapshot.milestones.find((m) => m.organizationId === activeOrgId)!;
    expect(active).toBeDefined();
    expect(active.firstSiteAt?.toISOString()).toBe(ago(19).toISOString());
    expect(active.verifiedAt?.toISOString()).toBe(ago(18).toISOString());
    expect(active.firstEventAt?.toISOString()).toBe(ago(18).toISOString());
    expect(active.firstDestinationAt?.toISOString()).toBe(ago(17).toISOString());
    expect(active.firstPublishedAt?.toISOString()).toBe(ago(16).toISOString());
    expect(active.payingAt?.toISOString()).toBe(ago(15).toISOString());
    const fresh = snapshot.milestones.find((m) => m.organizationId === freshOrgId)!;
    expect(fresh).toMatchObject({ firstSiteAt: null, verifiedAt: null, firstEventAt: null, firstDestinationAt: null, firstPublishedAt: null, payingAt: null });

    expect(snapshot.cohortOrganizations.map((o) => o.organizationId)).toEqual(expect.arrayContaining([activeOrgId, freshOrgId]));
    const weeks = snapshot.activity.filter((a) => a.organizationId === activeOrgId).map((a) => a.week).sort();
    expect(weeks).toEqual([0, 2]);
    expect(snapshot.aggregatesSince).not.toBeNull();
    expect(snapshot.aggregatesSince!.getTime()).toBeLessThanOrEqual(ago(18).getTime());

    expect(snapshot.activeOrganizations.find((w) => w.days === 7)?.organizations).toBeGreaterThanOrEqual(1);
    expect(snapshot.activeOrganizations.find((w) => w.days === 30)?.organizations).toBeGreaterThanOrEqual(1);

    const starter = snapshot.planRows.find((r) => r.planId === "starter" && r.status === "active");
    expect(starter?.count).toBeGreaterThanOrEqual(1);
    expect(snapshot.planRows.find((r) => r.planId === null)?.count).toBeGreaterThanOrEqual(1);

    const reddit = snapshot.connectorRows.find((r) => r.connectorType === "reddit" && r.status === "connected");
    expect(reddit?.integrations).toBeGreaterThanOrEqual(1);
    expect(reddit?.organizations).toBeGreaterThanOrEqual(1);
    expect(snapshot.organizationsWithConnected).toBeGreaterThanOrEqual(1);

    const view = growthView(snapshot);
    const stage = (key: string) => view.funnel.stages.find((s) => s.key === key)!;
    expect(stage("created").count).toBe(snapshot.totals.organizations);
    for (const key of ["site", "verified", "event", "destination", "published", "paying"]) expect(stage(key).count).toBeGreaterThanOrEqual(1);
    expect(stage("paying").recent.count).toBeGreaterThanOrEqual(1);
    const cohort = view.retention.cohorts.find((c) => c.weekStart === dayKey(new Date(Math.floor(ago(20).getTime() / DAY_MS) * DAY_MS - ((new Date(ago(20)).getUTCDay() + 6) % 7) * DAY_MS)))!;
    expect(cohort.size).toBeGreaterThanOrEqual(1);
    expect(cohort.cells[0]!.active).toBeGreaterThanOrEqual(1);
    expect(cohort.cells[2]!.active).toBeGreaterThanOrEqual(1);
    expect(view.connectors.rows.some((r) => r.connectorType === "reddit")).toBe(true);
    expect(view.planMix.rows.find((r) => r.planId === "starter")?.active).toBeGreaterThanOrEqual(1);
  });

  it("answers the overview headline with the same counts", async () => {
    const headline = await withPlatform(t.db, (tx) => loadGrowthHeadline(tx, now));
    expect(headline.organizations).toBeGreaterThanOrEqual(2);
    expect(headline.newOrganizations7d).toBeGreaterThanOrEqual(1);
    expect(headline.newOrganizations30d).toBeGreaterThanOrEqual(2);
    expect(headline.paying).toBeGreaterThanOrEqual(1);
    expect(headline.active7d).toBeGreaterThanOrEqual(1);
    expect(headline.active30d).toBeGreaterThanOrEqual(headline.active7d);
  });
});
