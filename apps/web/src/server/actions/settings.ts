"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomToken, sha256Hex } from "@track-site/core";
import { defaultEnvironment, getSite, orgSettings, recordAudit, sites, sourceKeys } from "@track-site/db";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

export interface KeyState extends ActionState {
  secret?: string;
}

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("org.update");
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: null, fieldErrors: { name: "name" } };
  const api = auth().api as unknown as { updateOrganization: (args: { body: { data: { name: string }; organizationId: string }; headers: Headers }) => Promise<unknown> };
  try {
    await api.updateOrganization({ body: { data: { name: parsed.data.name }, organizationId: ctx.organization.id }, headers: await headers() });
  } catch {
    return { ok: false, error: "generic" };
  }
  await withOrg(ctx, (tx) => recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "org.update", targetType: "organization", targetId: ctx.organization.id, diff: { name: parsed.data.name }, requestId: ctx.tenant.requestId }));
  revalidatePath("/app/settings");
  return { ok: true, error: null };
}

const settingsSchema = z.object({ locale: z.enum(ALL_LOCALES), dataRegion: z.enum(["eu"]), aiEnabled: z.boolean(), benchmarkOptIn: z.boolean(), killSwitch: z.boolean() });

export async function updateOrgSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("org.update");
  const parsed = settingsSchema.safeParse({ locale: formData.get("locale"), dataRegion: formData.get("dataRegion") ?? "eu", aiEnabled: formData.get("aiEnabled") === "on", benchmarkOptIn: formData.get("benchmarkOptIn") === "on", killSwitch: formData.get("killSwitch") === "on" });
  if (!parsed.success) return { ok: false, error: "generic" };
  await withOrg(ctx, async (tx) => {
    await tx.insert(orgSettings).values({ organizationId: ctx.organization.id, ...parsed.data }).onConflictDoUpdate({ target: orgSettings.organizationId, set: parsed.data });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: parsed.data.killSwitch ? "org.kill_switch_on" : "org.settings", targetType: "organization", targetId: ctx.organization.id, diff: parsed.data, requestId: ctx.tenant.requestId });
  });
  revalidatePath("/app/settings");
  return { ok: true, error: null };
}

export async function updateSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.update");
  const parsed = z.object({ siteId: z.string().uuid(), name: z.string().trim().min(1).max(80), killSwitch: z.boolean() }).safeParse({ siteId: formData.get("siteId"), name: formData.get("name"), killSwitch: formData.get("killSwitch") === "on" });
  if (!parsed.success) return { ok: false, error: "generic" };
  const ok = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, parsed.data.siteId);
    if (!site) return false;
    await tx.update(sites).set({ name: parsed.data.name, killSwitch: parsed.data.killSwitch }).where(eq(sites.id, site.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: parsed.data.killSwitch ? "site.kill_switch_on" : "site.update", targetType: "site", targetId: site.id, diff: parsed.data, requestId: ctx.tenant.requestId });
    return true;
  });
  revalidatePath("/app/settings");
  return ok ? { ok: true, error: null } : { ok: false, error: "generic" };
}

/** Creates a server-side source key (shown once). Only the SHA-256 hash is stored. */
export async function createSourceKeyAction(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const ctx = await requireOrgContext("sites.update");
  const parsed = z.object({ siteId: z.string().uuid(), name: z.string().trim().min(1).max(60) }).safeParse({ siteId: formData.get("siteId"), name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: "generic" };
  const secret = randomToken("tsk", 32);
  const result = await withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, parsed.data.siteId);
    if (!site) return null;
    const envRow = await defaultEnvironment(tx, site.id);
    if (!envRow) return null;
    const [row] = await tx.insert(sourceKeys).values({ organizationId: ctx.organization.id, siteId: site.id, environmentId: envRow.id, name: parsed.data.name, keyPrefix: secret.slice(0, 12), keyHash: sha256Hex(secret), last4: secret.slice(-4), createdBy: ctx.user.id }).returning({ id: sourceKeys.id });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "source_key.create", targetType: "source_key", targetId: row!.id, diff: { site: site.id, name: parsed.data.name }, requestId: ctx.tenant.requestId });
    return row!.id;
  });
  revalidatePath("/app/settings");
  return result ? { ok: true, error: null, secret } : { ok: false, error: "generic" };
}

export async function revokeSourceKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("sites.update");
  const keyId = String(formData.get("keyId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(keyId)) return { ok: false, error: "generic" };
  await withOrg(ctx, async (tx) => {
    await tx.update(sourceKeys).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(sourceKeys.id, keyId), eq(sourceKeys.organizationId, ctx.organization.id)));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "source_key.revoke", targetType: "source_key", targetId: keyId, requestId: ctx.tenant.requestId });
  });
  revalidatePath("/app/settings");
  return { ok: true, error: null };
}

export async function updateLocaleAction(locale: "en" | "de"): Promise<void> {
  const ctx = await requireOrgContext();
  const { cookies } = await import("next/headers");
  (await cookies()).set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  await db().insert(orgSettings).values({ organizationId: ctx.organization.id, locale }).onConflictDoUpdate({ target: orgSettings.organizationId, set: { locale } });
  revalidatePath("/app");
}
