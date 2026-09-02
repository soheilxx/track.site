import { and, eq, isNull } from "drizzle-orm";
import { createWithUniqueTrackingId, normalizeTrackingId, randomBase64Url } from "@track-site/core";
import { isUniqueViolation, pgErrorConstraint, type DbOrTx } from "../client.ts";
import { domains, environments, sites, trackingIdTombstones } from "../schema/tenancy.ts";

export interface CreateSiteInput {
  organizationId: string;
  name: string;
  primaryDomain: string | null;
  createdBy: string | null;
  businessType?: "ecommerce" | "lead_generation" | "saas" | "content" | "other" | null;
  timezone?: string;
  currency?: string | null;
}

export type SiteRow = typeof sites.$inferSelect;

/**
 * Creates a site with a fresh public 6-character tracking id (atomic create-with-retry on the
 * unique index), its default environments and the primary domain with a verification token.
 * Must run inside `withTenant` so RLS applies.
 */
export async function createSite(tx: DbOrTx, input: CreateSiteInput): Promise<SiteRow> {
  const site = await createWithUniqueTrackingId(
    // nested transaction = SAVEPOINT, so a unique violation does not abort the outer transaction
    (trackingId) =>
      tx.transaction(async (sp) => {
        const rows = await sp
          .insert(sites)
          .values({
            organizationId: input.organizationId,
            trackingId,
            name: input.name,
            primaryDomain: input.primaryDomain,
            businessType: input.businessType ?? null,
            timezone: input.timezone ?? "Europe/Berlin",
            currency: input.currency ?? null,
            createdBy: input.createdBy,
          })
          .returning();
        return rows[0]!;
      }),
    (e) => isUniqueViolation(e) && (pgErrorConstraint(e) ?? "").includes("tracking_id"),
  );
  await tx.insert(environments).values([
    { organizationId: input.organizationId, siteId: site.id, kind: "production", name: "Production", isDefault: true, testMode: false },
    { organizationId: input.organizationId, siteId: site.id, kind: "staging", name: "Staging", isDefault: false, testMode: true },
  ]);
  if (input.primaryDomain) {
    await tx.insert(domains).values({
      organizationId: input.organizationId,
      siteId: site.id,
      hostname: input.primaryDomain,
      isPrimary: true,
      verificationToken: `track-site-verify=${randomBase64Url(24)}`,
    });
  }
  return site;
}

export async function listSites(tx: DbOrTx, organizationId: string): Promise<SiteRow[]> {
  return tx.select().from(sites).where(and(eq(sites.organizationId, organizationId), isNull(sites.deletedAt))).orderBy(sites.createdAt);
}

export async function getSite(tx: DbOrTx, organizationId: string, siteId: string): Promise<SiteRow | null> {
  const rows = await tx
    .select()
    .from(sites)
    .where(and(eq(sites.organizationId, organizationId), eq(sites.id, siteId), isNull(sites.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Data-plane lookup by public tracking id (worker role, all tenants). */
export async function getSiteByTrackingId(tx: DbOrTx, trackingIdInput: string): Promise<SiteRow | null> {
  const trackingId = normalizeTrackingId(trackingIdInput);
  if (!trackingId) return null;
  const rows = await tx.select().from(sites).where(eq(sites.trackingId, trackingId)).limit(1);
  return rows[0] ?? null;
}

/** Soft delete: the row and its tracking id remain (never recycled); a tombstone records the deletion. */
export async function softDeleteSite(tx: DbOrTx, organizationId: string, siteId: string): Promise<boolean> {
  const rows = await tx
    .update(sites)
    .set({ status: "deleted", deletedAt: new Date(), killSwitch: true })
    .where(and(eq(sites.organizationId, organizationId), eq(sites.id, siteId), isNull(sites.deletedAt)))
    .returning({ id: sites.id, trackingId: sites.trackingId });
  const row = rows[0];
  if (!row) return false;
  await tx.insert(trackingIdTombstones).values({ trackingId: row.trackingId, organizationId, siteId: row.id }).onConflictDoNothing();
  return true;
}

export async function defaultEnvironment(tx: DbOrTx, siteId: string): Promise<typeof environments.$inferSelect | null> {
  const rows = await tx.select().from(environments).where(and(eq(environments.siteId, siteId), eq(environments.isDefault, true))).limit(1);
  return rows[0] ?? null;
}
