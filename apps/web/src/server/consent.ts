import "server-only";
import { and, desc, eq, gte, ne } from "drizzle-orm";
import { consentPolicies, consentSnapshots, dataSubjectRequests, eventAggregates, eventDefinitions, integrations, retentionPolicies, sites } from "@track-site/db";
import { isConnectorType } from "@track-site/policy";
import { summarizeCoverage, type CoverageSummary } from "./consent-coverage";
import { isPurpose, policyFieldsFrom, type PolicyFields } from "./consent-policy";
import { isStandardEventName, type SimDestination } from "./consent-simulator";
import { withOrg, type OrgContext } from "./session";

/**
 * Read side of the Consent & Privacy module. Every query runs inside the tenant transaction
 * (`withOrg`, RLS enforced) and is additionally scoped by organization id; results are plain data
 * for server components. Nothing here estimates: a missing measurement is `null`.
 */
export type ConsentPolicyStatus = "draft" | "published" | "archived";

export interface ConsentPolicyView {
  id: string;
  siteId: string;
  siteName: string;
  version: number;
  status: ConsentPolicyStatus;
  fields: PolicyFields;
  cmp: { provider: string; settings: Record<string, unknown> } | null;
  consentMode: { mode: "basic" | "advanced"; legalReviewNote: string | null };
  legalBasisNote: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SitePolicyState {
  published: ConsentPolicyView | null;
  draft: ConsentPolicyView | null;
  /** Total versions (including archived) the site has. */
  versions: number;
}

type PolicyRow = typeof consentPolicies.$inferSelect & { siteName: string };

function toView(row: PolicyRow): ConsentPolicyView {
  return {
    id: row.id,
    siteId: row.siteId,
    siteName: row.siteName,
    version: row.version,
    status: row.status,
    fields: policyFieldsFrom(row),
    cmp: row.cmp ?? null,
    consentMode: row.consentMode ?? { mode: "basic", legalReviewNote: null },
    legalBasisNote: row.legalBasisNote ?? null,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const policyColumns = {
  id: consentPolicies.id,
  organizationId: consentPolicies.organizationId,
  siteId: consentPolicies.siteId,
  version: consentPolicies.version,
  status: consentPolicies.status,
  regionPolicies: consentPolicies.regionPolicies,
  purposes: consentPolicies.purposes,
  destinationPurposes: consentPolicies.destinationPurposes,
  operationalEvents: consentPolicies.operationalEvents,
  cmp: consentPolicies.cmp,
  consentMode: consentPolicies.consentMode,
  legalBasisNote: consentPolicies.legalBasisNote,
  publishedAt: consentPolicies.publishedAt,
  createdBy: consentPolicies.createdBy,
  createdAt: consentPolicies.createdAt,
  updatedAt: consentPolicies.updatedAt,
  siteName: sites.name,
};

/** Latest published and latest open draft of a site (the two versions the simulator can evaluate). */
export async function loadSitePolicyState(ctx: OrgContext, siteId: string): Promise<SitePolicyState> {
  return withOrg(ctx, async (tx) => {
    const rows = await tx
      .select(policyColumns)
      .from(consentPolicies)
      .innerJoin(sites, eq(sites.id, consentPolicies.siteId))
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.siteId, siteId)))
      .orderBy(desc(consentPolicies.version));
    const published = rows.find((r) => r.status === "published");
    const draft = rows.find((r) => r.status === "draft");
    return { published: published ? toView(published) : null, draft: draft ? toView(draft) : null, versions: rows.length };
  });
}

/** Newest policy versions across the organization (kept from the previous page: the org-wide list). */
export async function loadOrganizationPolicies(ctx: OrgContext, limit = 50): Promise<ConsentPolicyView[]> {
  return withOrg(ctx, async (tx) => {
    const rows = await tx
      .select(policyColumns)
      .from(consentPolicies)
      .innerJoin(sites, eq(sites.id, consentPolicies.siteId))
      .where(eq(consentPolicies.organizationId, ctx.organization.id))
      .orderBy(desc(consentPolicies.updatedAt))
      .limit(limit);
    return rows.map(toView);
  });
}

/** Coverage from the site's recorded consent states (`null` when no event carried one yet). */
export async function loadConsentCoverage(ctx: OrgContext, siteId: string, now: Date = new Date()): Promise<CoverageSummary | null> {
  return withOrg(ctx, async (tx) => {
    const rows = await tx
      .select({ granted: consentSnapshots.granted, source: consentSnapshots.source, region: consentSnapshots.region, gpc: consentSnapshots.gpc, eventCount: consentSnapshots.eventCount, firstSeenAt: consentSnapshots.firstSeenAt, lastSeenAt: consentSnapshots.lastSeenAt })
      .from(consentSnapshots)
      .where(and(eq(consentSnapshots.organizationId, ctx.organization.id), eq(consentSnapshots.siteId, siteId)));
    return summarizeCoverage(rows, now);
  });
}

/** Destinations of a site as the policy engine sees them (status and stricter purpose included). */
export async function loadSiteDestinations(ctx: OrgContext, siteId: string): Promise<SimDestination[]> {
  return withOrg(ctx, async (tx) => {
    const rows = await tx
      .select({ id: integrations.id, name: integrations.name, connectorType: integrations.connectorType, status: integrations.status, requiredPurpose: integrations.requiredPurpose })
      .from(integrations)
      .where(and(eq(integrations.organizationId, ctx.organization.id), eq(integrations.siteId, siteId)))
      .orderBy(integrations.name);
    return rows.flatMap<SimDestination>((r) => (isConnectorType(r.connectorType) ? [{ id: r.id, name: r.name, connectorType: r.connectorType, status: r.status, requiredPurpose: isPurpose(r.requiredPurpose) ? r.requiredPurpose : null, hypothetical: false }] : []));
  });
}

/** Custom (non-standard) event names of a site: its event plan plus names observed in the last 30 days. */
export async function loadSiteCustomEventNames(ctx: OrgContext, siteId: string, now: Date = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  return withOrg(ctx, async (tx) => {
    // sequential on purpose: a transaction runs on one pg client, and concurrent queries on a single client are deprecated (pg 9 removes the implicit queue)
    const defined = await tx
      .select({ name: eventDefinitions.name })
      .from(eventDefinitions)
      .where(and(eq(eventDefinitions.organizationId, ctx.organization.id), eq(eventDefinitions.siteId, siteId), ne(eventDefinitions.status, "disabled")));
    const observed = await tx
      .selectDistinct({ name: eventAggregates.eventName })
      .from(eventAggregates)
      .where(and(eq(eventAggregates.organizationId, ctx.organization.id), eq(eventAggregates.siteId, siteId), gte(eventAggregates.bucketStart, since)))
      .limit(200);
    return Array.from(new Set([...defined, ...observed].map((r) => r.name)))
      .filter((n) => !isStandardEventName(n))
      .sort()
      .slice(0, 50);
  });
}

export interface RetentionValue {
  dataKind: string;
  days: number;
}

export interface DsarView {
  id: string;
  kind: string;
  status: string;
  requestedAt: string;
  dueAt: string;
  hasReport: boolean;
  note: string | null;
}

/** Organization-wide retention overrides and data subject requests (unchanged behaviour of the module). */
export async function loadPrivacyRecords(ctx: OrgContext): Promise<{ retention: RetentionValue[]; requests: DsarView[] }> {
  return withOrg(ctx, async (tx) => {
    // sequential on purpose (one pg client per transaction)
    const retention = await tx
      .select({ dataKind: retentionPolicies.dataKind, days: retentionPolicies.days, siteId: retentionPolicies.siteId })
      .from(retentionPolicies)
      .where(eq(retentionPolicies.organizationId, ctx.organization.id));
    const requests = await tx.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.organizationId, ctx.organization.id)).orderBy(desc(dataSubjectRequests.requestedAt)).limit(100);
    return {
      retention: retention.filter((r) => r.siteId === null).map((r) => ({ dataKind: r.dataKind, days: r.days })),
      requests: requests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, requestedAt: r.requestedAt.toISOString(), dueAt: r.dueAt.toISOString(), hasReport: Boolean(r.report) && (r.kind === "export" || r.kind === "portability"), note: r.note })),
    };
  });
}
