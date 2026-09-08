"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { featureFlagOverrides, featureFlags, opsNotes, organization } from "@track-site/db";
import { getOrganisationState } from "@/server/ops/organisations";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext, type PlatformMinRole } from "@/server/ops/platform";

/**
 * Track Operations → Organisations actions (docs/17 §1). Every action resolves the operator with
 * `requirePlatform` (support for notes, admin for suspension and feature-flag overrides), validates
 * its input with zod, re-checks the explicit confirmation of risky changes through the `confirm`
 * field, writes the change and its `auditPlatform` entry in one `tracksite_ops` transaction (actor
 * kind `platform`, organisation id of the affected tenant) and revalidates the module. Nothing here
 * touches tenant data beyond the organisation row, its flag overrides and the operator-only notes.
 */
export type OrgActionError = "forbidden" | "invalid" | "not_found" | "already_suspended" | "not_suspended" | "confirm_required" | "unchanged" | "generic";
export type OrgActionNotice = "suspended" | "unsuspended" | "noteAdded" | "notePinned" | "noteUnpinned" | "flagSaved" | "flagRemoved";

export interface OrgActionState {
  ok: boolean;
  error: OrgActionError | null;
  notice: OrgActionNotice | null;
  fieldErrors?: Record<string, string>;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const reason = z.string().trim().min(5).max(500);
const ticketRef = z.string().trim().max(80).optional();
const FLAG_KEY = /^[a-z][a-z0-9_.-]{1,63}$/;

const fail = (error: OrgActionError, fieldErrors?: Record<string, string>): OrgActionState => ({ ok: false, error, notice: null, ...(fieldErrors ? { fieldErrors } : {}) });
const done = (notice: OrgActionNotice): OrgActionState => ({ ok: true, error: null, notice });

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

async function platformOr(minRole: PlatformMinRole): Promise<PlatformContext | null> {
  try {
    return await requirePlatform(minRole);
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

function fieldErrorsOf(issues: ReadonlyArray<{ path: PropertyKey[] }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? "form")] = "invalid";
  return out;
}

function revalidateOrganisation(organizationId: string): void {
  revalidatePath("/ops/organisations");
  revalidatePath(`/ops/organisations/${organizationId}`);
}

// ---------------------------------------------------------------------------------------------------
// Suspension (tenant kill switch)
// ---------------------------------------------------------------------------------------------------

const suspendSchema = z.object({ organizationId: uuid, reason, ticketRef, confirm: z.literal("suspend") });

/**
 * Suspends an organisation: every dashboard page, server action and API route that requires the
 * organisation context answers 403 from the next request on (`assertOrganizationActive` in
 * `server/session.ts`). Admin only, confirmed in a dialog, reason mandatory, audited.
 */
export async function suspendOrganisationAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const ctx = await platformOr("PLATFORM_ADMIN");
  if (!ctx) return fail("forbidden");
  const parsed = suspendSchema.safeParse({ organizationId: str(formData, "organizationId"), reason: str(formData, "reason"), ticketRef: str(formData, "ticketRef") || undefined, confirm: str(formData, "confirm") });
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "confirm")) return fail("confirm_required");
    return fail("invalid", fieldErrorsOf(parsed.error.issues));
  }
  const input = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<OrgActionState> => {
    const org = await getOrganisationState(ctx, input.organizationId, tx);
    if (!org) return fail("not_found");
    if (org.suspendedAt) return fail("already_suspended");
    const suspendedAt = new Date();
    await tx.update(organization).set({ suspendedAt, suspendedReason: input.reason }).where(and(eq(organization.id, org.id), isNull(organization.suspendedAt)));
    await auditPlatform(
      ctx,
      {
        action: "platform.organization.suspend",
        organizationId: org.id,
        targetType: "organization",
        targetId: org.id,
        diff: { suspendedAt: suspendedAt.toISOString(), reason: input.reason, ticketRef: input.ticketRef ?? null },
        metadata: { module: "organisations", organizationSlug: org.slug },
      },
      tx,
    );
    return done("suspended");
  });
  if (result.ok) revalidateOrganisation(input.organizationId);
  return result;
}

const unsuspendSchema = z.object({ organizationId: uuid, reason, ticketRef, confirm: z.literal("unsuspend") });

/** Lifts a suspension (admin only, confirmed, reason mandatory, audited with the previous reason). */
export async function unsuspendOrganisationAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const ctx = await platformOr("PLATFORM_ADMIN");
  if (!ctx) return fail("forbidden");
  const parsed = unsuspendSchema.safeParse({ organizationId: str(formData, "organizationId"), reason: str(formData, "reason"), ticketRef: str(formData, "ticketRef") || undefined, confirm: str(formData, "confirm") });
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "confirm")) return fail("confirm_required");
    return fail("invalid", fieldErrorsOf(parsed.error.issues));
  }
  const input = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<OrgActionState> => {
    const org = await getOrganisationState(ctx, input.organizationId, tx);
    if (!org) return fail("not_found");
    if (!org.suspendedAt) return fail("not_suspended");
    await tx.update(organization).set({ suspendedAt: null, suspendedReason: null }).where(eq(organization.id, org.id));
    await auditPlatform(
      ctx,
      {
        action: "platform.organization.unsuspend",
        organizationId: org.id,
        targetType: "organization",
        targetId: org.id,
        diff: { suspendedAt: org.suspendedAt.toISOString(), previousReason: org.suspendedReason, reason: input.reason, ticketRef: input.ticketRef ?? null },
        metadata: { module: "organisations", organizationSlug: org.slug },
      },
      tx,
    );
    return done("unsuspended");
  });
  if (result.ok) revalidateOrganisation(input.organizationId);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Internal notes (operator-only table)
// ---------------------------------------------------------------------------------------------------

const noteSchema = z.object({ organizationId: uuid, body: z.string().trim().min(1).max(2000), pinned: z.boolean() });

/** Adds an internal note (support and admin). The body never enters the audit log — only its length. */
export async function addOpsNoteAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const ctx = await platformOr("PLATFORM_SUPPORT");
  if (!ctx) return fail("forbidden");
  const parsed = noteSchema.safeParse({ organizationId: str(formData, "organizationId"), body: str(formData, "body"), pinned: str(formData, "pinned") === "on" });
  if (!parsed.success) return fail("invalid", fieldErrorsOf(parsed.error.issues));
  const input = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<OrgActionState> => {
    const org = await getOrganisationState(ctx, input.organizationId, tx);
    if (!org) return fail("not_found");
    const [row] = await tx.insert(opsNotes).values({ organizationId: org.id, authorUserId: ctx.user.id, body: input.body, pinned: input.pinned }).returning({ id: opsNotes.id });
    await auditPlatform(ctx, { action: "platform.ops_note.create", organizationId: org.id, targetType: "ops_note", targetId: row!.id, diff: { length: input.body.length, pinned: input.pinned }, metadata: { module: "organisations" } }, tx);
    return done("noteAdded");
  });
  if (result.ok) revalidateOrganisation(input.organizationId);
  return result;
}

const pinSchema = z.object({ organizationId: uuid, noteId: uuid, pinned: z.enum(["true", "false"]) });

/** Pins or unpins a note of the organisation. */
export async function setOpsNotePinnedAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const ctx = await platformOr("PLATFORM_SUPPORT");
  if (!ctx) return fail("forbidden");
  const parsed = pinSchema.safeParse({ organizationId: str(formData, "organizationId"), noteId: str(formData, "noteId"), pinned: str(formData, "pinned") });
  if (!parsed.success) return fail("invalid");
  const { organizationId, noteId } = parsed.data;
  const pinned = parsed.data.pinned === "true";
  const result = await withPlatform(ctx, async (tx): Promise<OrgActionState> => {
    const [note] = await tx
      .select({ id: opsNotes.id, pinned: opsNotes.pinned })
      .from(opsNotes)
      .where(and(eq(opsNotes.organizationId, organizationId), eq(opsNotes.id, noteId)))
      .limit(1);
    if (!note) return fail("not_found");
    if (note.pinned === pinned) return fail("unchanged");
    await tx.update(opsNotes).set({ pinned, updatedAt: new Date() }).where(eq(opsNotes.id, note.id));
    await auditPlatform(ctx, { action: pinned ? "platform.ops_note.pin" : "platform.ops_note.unpin", organizationId, targetType: "ops_note", targetId: note.id, metadata: { module: "organisations" } }, tx);
    return done(pinned ? "notePinned" : "noteUnpinned");
  });
  if (result.ok) revalidateOrganisation(organizationId);
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Feature-flag overrides
// ---------------------------------------------------------------------------------------------------

const flagSchema = z.object({
  organizationId: uuid,
  key: z.string().regex(FLAG_KEY),
  /** `enabled` / `disabled` store an override, `inherit` removes it (the global default applies again) */
  state: z.enum(["enabled", "disabled", "inherit"]),
  reason,
  confirm: z.literal("flag"),
});

/**
 * Sets or removes the organisation's override of one feature flag (admin only, confirmed, reason
 * mandatory). The customer app only reads overrides; this is the single write path besides Controls.
 */
export async function setFeatureFlagOverrideAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const ctx = await platformOr("PLATFORM_ADMIN");
  if (!ctx) return fail("forbidden");
  const parsed = flagSchema.safeParse({ organizationId: str(formData, "organizationId"), key: str(formData, "key"), state: str(formData, "state"), reason: str(formData, "reason"), confirm: str(formData, "confirm") });
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "confirm")) return fail("confirm_required");
    return fail("invalid", fieldErrorsOf(parsed.error.issues));
  }
  const input = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<OrgActionState> => {
    const org = await getOrganisationState(ctx, input.organizationId, tx);
    if (!org) return fail("not_found");
    const [flag] = await tx.select({ key: featureFlags.key, defaultEnabled: featureFlags.defaultEnabled }).from(featureFlags).where(eq(featureFlags.key, input.key)).limit(1);
    if (!flag) return fail("not_found");
    const [existing] = await tx
      .select({ id: featureFlagOverrides.id, enabled: featureFlagOverrides.enabled, reason: featureFlagOverrides.reason })
      .from(featureFlagOverrides)
      .where(and(eq(featureFlagOverrides.organizationId, org.id), eq(featureFlagOverrides.key, flag.key)))
      .limit(1);
    const before = existing ? { override: existing.enabled, effective: existing.enabled } : { override: null, effective: flag.defaultEnabled };
    if (input.state === "inherit") {
      if (!existing) return fail("unchanged");
      await tx.delete(featureFlagOverrides).where(eq(featureFlagOverrides.id, existing.id));
      await auditPlatform(
        ctx,
        {
          action: "platform.feature_flag_override.remove",
          organizationId: org.id,
          targetType: "feature_flag",
          targetId: flag.key,
          diff: { key: flag.key, before, after: { override: null, effective: flag.defaultEnabled }, reason: input.reason },
          metadata: { module: "organisations" },
        },
        tx,
      );
      return done("flagRemoved");
    }
    const enabled = input.state === "enabled";
    if (existing && existing.enabled === enabled) return fail("unchanged");
    await tx
      .insert(featureFlagOverrides)
      .values({ organizationId: org.id, key: flag.key, enabled, reason: input.reason, actorUserId: ctx.user.id })
      .onConflictDoUpdate({ target: [featureFlagOverrides.organizationId, featureFlagOverrides.key], set: { enabled, reason: input.reason, actorUserId: ctx.user.id, updatedAt: new Date() } });
    await auditPlatform(
      ctx,
      {
        action: "platform.feature_flag_override.set",
        organizationId: org.id,
        targetType: "feature_flag",
        targetId: flag.key,
        diff: { key: flag.key, before, after: { override: enabled, effective: enabled }, reason: input.reason },
        metadata: { module: "organisations" },
      },
      tx,
    );
    return done("flagSaved");
  });
  if (result.ok) revalidateOrganisation(input.organizationId);
  return result;
}
