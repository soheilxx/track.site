"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteShopConnection, getShopConnection, getSite, setShopConnectionStatus, setShopSecret, upsertShopConnection } from "@track-site/db";
import { vault } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

const platformSchema = z.enum(["shopify", "woocommerce", "shopware"]);
const uuid = z.string().uuid();

/** Creates or updates the site's connection for one shop platform (domain, currency fallback, purchase moment). */
export async function saveShopConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.update");
  const parsed = z
    .object({
      siteId: uuid,
      platform: platformSchema,
      shopDomain: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(253)
        .regex(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/),
      defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).or(z.literal("")),
      purchaseOn: z.enum(["paid", "placed"]).optional(),
    })
    .safeParse({ siteId: formData.get("siteId"), platform: formData.get("platform"), shopDomain: formData.get("shopDomain"), defaultCurrency: formData.get("defaultCurrency") ?? "", purchaseOn: formData.get("purchaseOn") ?? undefined });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { shopDomain: "shopDomain" } };
  const { siteId, platform, shopDomain, defaultCurrency, purchaseOn } = parsed.data;
  const saved = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, siteId);
    if (!site) return false;
    await upsertShopConnection(tx, { organizationId: ctx.organization.id, siteId: site.id, platform, shopDomain, settings: { ...(defaultCurrency ? { default_currency: defaultCurrency } : {}), ...(purchaseOn ? { purchase_on: purchaseOn } : {}) }, actor: ctx.tenant.actor, userId: ctx.user.id });
    return true;
  });
  if (!saved) return { ok: false, error: "generic" };
  revalidatePath(`/app/sites/${siteId}/shop`);
  return { ok: true, error: null };
}

/** Stores the platform's webhook signing secret in the vault. The value is never shown again. */
export async function setShopSecretAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.update");
  const parsed = z.object({ connectionId: uuid, siteId: uuid, secret: z.string().min(8).max(512) }).safeParse({ connectionId: formData.get("connectionId"), siteId: formData.get("siteId"), secret: formData.get("secret") });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { secret: "secret" } };
  const v = vault();
  if (!v) return { ok: false, error: "vault" };
  const ok = await withOrg(ctx, async (tx) => {
    const conn = await getShopConnection(tx, ctx.organization.id, parsed.data.connectionId);
    if (!conn || conn.siteId !== parsed.data.siteId) return false;
    await setShopSecret(tx, v, { organizationId: ctx.organization.id, connectionId: conn.id, plaintext: parsed.data.secret.trim(), actor: ctx.tenant.actor, userId: ctx.user.id });
    return true;
  });
  if (!ok) return { ok: false, error: "generic" };
  revalidatePath(`/app/sites/${parsed.data.siteId}/shop`);
  return { ok: true, error: null };
}

export async function toggleShopConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.update");
  const parsed = z.object({ connectionId: uuid, siteId: uuid, status: z.enum(["pending", "paused"]) }).safeParse({ connectionId: formData.get("connectionId"), siteId: formData.get("siteId"), status: formData.get("status") });
  if (!parsed.success) return { ok: false, error: "generic" };
  await withOrg(ctx, (tx) => setShopConnectionStatus(tx, { organizationId: ctx.organization.id, connectionId: parsed.data.connectionId, status: parsed.data.status, actor: ctx.tenant.actor }));
  revalidatePath(`/app/sites/${parsed.data.siteId}/shop`);
  return { ok: true, error: null };
}

export async function deleteShopConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.update");
  const parsed = z.object({ connectionId: uuid, siteId: uuid }).safeParse({ connectionId: formData.get("connectionId"), siteId: formData.get("siteId") });
  if (!parsed.success) return { ok: false, error: "generic" };
  await withOrg(ctx, (tx) => deleteShopConnection(tx, { organizationId: ctx.organization.id, connectionId: parsed.data.connectionId, actor: ctx.tenant.actor }));
  revalidatePath(`/app/sites/${parsed.data.siteId}/shop`);
  return { ok: true, error: null };
}
