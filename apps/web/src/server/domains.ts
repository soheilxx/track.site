import "server-only";
import { and, eq } from "drizzle-orm";
import { checkDnsTxt, checkMetaTag, checkVerificationFile, newUlid } from "@track-site/core";
import { domains, outbox, recordAudit } from "@track-site/db";
import type { OrgContext } from "./session";
import { withOrg } from "./session";

export type VerificationMethod = "dns_txt" | "file" | "meta_tag";

export interface VerificationResult {
  ok: boolean;
  detail: string;
}

/** Domain ownership verification (DNS TXT, well-known file or meta tag); result + audit are persisted. */
export async function verifyDomainOwnership(ctx: OrgContext, domainId: string, method: VerificationMethod): Promise<VerificationResult> {
  const row = await withOrg(ctx, async (tx) => {
    const rows = await tx.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.organizationId, ctx.organization.id))).limit(1);
    return rows[0] ?? null;
  });
  if (!row) return { ok: false, detail: "domain not found" };
  const token = row.verificationToken;
  const result = method === "dns_txt" ? await checkDnsTxt(row.hostname, token) : method === "file" ? await checkVerificationFile(row.hostname, token) : await checkMetaTag(row.hostname, token);
  await withOrg(ctx, async (tx) => {
    await tx
      .update(domains)
      .set({ lastCheckedAt: new Date(), lastCheckResult: result, ...(result.ok ? { verifiedAt: new Date(), verificationMethod: method } : {}) })
      .where(eq(domains.id, domainId));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: result.ok ? "domain.verified" : "domain.verify_failed", targetType: "domain", targetId: domainId, diff: { method, detail: result.detail }, requestId: ctx.tenant.requestId });
    if (result.ok) await tx.insert(outbox).values({ id: newUlid(), organizationId: ctx.organization.id, topic: "integration.changed", payload: { site_id: row.siteId } });
  });
  return result;
}
