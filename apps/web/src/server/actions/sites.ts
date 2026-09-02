"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeDomainInput } from "@track-site/core";
import { createSite, recordAudit } from "@track-site/db";
import { requireOrgContext, withOrg } from "@/server/session";
import { verifyDomainOwnership } from "@/server/domains";
import { siteLimitReached } from "@/server/entitlements";
import type { ActionState } from "./organization";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  domain: z.string().trim().min(1).max(253),
  businessType: z.enum(["ecommerce", "lead_generation", "saas", "content", "other"]).optional(),
});

export async function createSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.create");
  const parsed = createSchema.safeParse({ name: formData.get("name") || formData.get("domain"), domain: formData.get("domain"), businessType: formData.get("businessType") || undefined });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { domain: "domain" } };
  const domain = normalizeDomainInput(parsed.data.domain);
  if (!domain) return { ok: false, error: null, fieldErrors: { domain: "domain" } };
  if (await siteLimitReached(ctx)) return { ok: false, error: "limit" };
  let siteId: string;
  try {
    siteId = await withOrg(ctx, async (tx) => {
      const site = await createSite(tx, { organizationId: ctx.organization.id, name: parsed.data.name, primaryDomain: domain, createdBy: ctx.user.id, businessType: parsed.data.businessType ?? null });
      await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "site.create", targetType: "site", targetId: site.id, diff: { trackingId: site.trackingId, domain }, requestId: ctx.tenant.requestId });
      return site.id;
    });
  } catch {
    return { ok: false, error: "generic" };
  }
  redirect(`/app/sites/${siteId}/setup`);
}

export async function verifyDomainAction(_prev: ActionState & { detail?: string }, formData: FormData): Promise<ActionState & { detail?: string }> {
  const ctx = await requireOrgContext("domains.verify");
  const domainId = String(formData.get("domainId") ?? "");
  const method = String(formData.get("method") ?? "dns_txt");
  if (!/^[0-9a-f-]{36}$/i.test(domainId) || !["dns_txt", "file", "meta_tag"].includes(method)) return { ok: false, error: "generic" };
  const result = await verifyDomainOwnership(ctx, domainId, method as "dns_txt" | "file" | "meta_tag");
  return { ok: result.ok, error: result.ok ? null : "generic", detail: result.detail };
}
