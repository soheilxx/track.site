"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { consentPolicies, getSite, integrations, recordAudit } from "@track-site/db";
import { isConnectorType, type ConnectorType } from "@track-site/policy";
import { DEFAULT_POLICY_FIELDS, LEGAL_NOTE_MIN_LENGTH, diffPolicyFields, isWeaker, parseDraftForm, policyFieldsFrom } from "@/server/consent-policy";
import { requireOrgContext, withOrg } from "@/server/session";
import type { ActionState } from "./organization";

/**
 * Consent policy lifecycle: draft → (edit) → publish, or discard. Every action requires
 * `consent.manage`, validates its input, writes an audit entry and revalidates the module. Publishing
 * and discarding are confirmed in the UI and re-checked here through the `confirm` field; a less
 * restrictive draft additionally needs a documented legal basis note (the customer's own review).
 */
const CONSENT_PATHS = ["/app/consent", "/app/consent/simulator"];

function revalidateConsent(): void {
  for (const path of CONSENT_PATHS) revalidatePath(path);
}

const formString = (formData: FormData) => (name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
};

const draftFor = (rows: Array<typeof consentPolicies.$inferSelect>) => rows.find((r) => r.status === "draft") ?? null;
const publishedFor = (rows: Array<typeof consentPolicies.$inferSelect>) => rows.find((r) => r.status === "published") ?? null;

/** Creates the next version as an editable draft, copying the published version (or the platform defaults). */
export async function createConsentDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("consent.manage");
  const parsed = z.object({ siteId: z.string().uuid() }).safeParse({ siteId: formData.get("siteId") });
  if (!parsed.success) return { ok: false, error: "generic" };
  const { siteId } = parsed.data;
  return withOrg(ctx, async (tx) => {
    const site = await getSite(tx, ctx.organization.id, siteId);
    if (!site) return { ok: false, error: "notFound" };
    const rows = await tx
      .select()
      .from(consentPolicies)
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.siteId, siteId)))
      .orderBy(desc(consentPolicies.version));
    if (draftFor(rows)) return { ok: false, error: "draftExists" };
    const published = publishedFor(rows);
    const base = published ? policyFieldsFrom(published) : DEFAULT_POLICY_FIELDS;
    const version = (rows[0]?.version ?? 0) + 1;
    const [inserted] = await tx
      .insert(consentPolicies)
      .values({
        organizationId: ctx.organization.id,
        siteId,
        version,
        status: "draft",
        regionPolicies: base.regionPolicies,
        destinationPurposes: base.destinationPurposes,
        operationalEvents: base.operationalEvents,
        purposes: published?.purposes ?? ["necessary", "analytics", "marketing", "personalization"],
        cmp: published?.cmp ?? null,
        consentMode: published?.consentMode ?? { mode: "basic", legalReviewNote: null },
        legalBasisNote: published?.legalBasisNote ?? null,
        createdBy: ctx.user.id,
      })
      .returning({ id: consentPolicies.id });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "consent_policy.draft_create", targetType: "consent_policy", targetId: inserted!.id, diff: { siteId, version, copiedFromVersion: published?.version ?? null }, requestId: ctx.tenant.requestId });
    revalidateConsent();
    return { ok: true, error: null };
  });
}

/** Saves the editable fields of a draft; a less restrictive result must be confirmed and documented. */
export async function saveConsentDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("consent.manage");
  const parsed = z.object({ policyId: z.string().uuid(), confirm: z.enum(["weaker"]).nullable() }).safeParse({ policyId: formData.get("policyId"), confirm: formData.get("confirm") || null });
  if (!parsed.success) return { ok: false, error: "generic" };
  const { policyId, confirm } = parsed.data;
  return withOrg(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(consentPolicies)
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.id, policyId)))
      .limit(1);
    if (!row) return { ok: false, error: "notFound" };
    if (row.status !== "draft") return { ok: false, error: "notDraft" };
    const siteIntegrations = await tx
      .select({ connectorType: integrations.connectorType })
      .from(integrations)
      .where(and(eq(integrations.organizationId, ctx.organization.id), eq(integrations.siteId, row.siteId)));
    const types = Array.from(new Set<ConnectorType>([...siteIntegrations.map((i) => i.connectorType).filter(isConnectorType), ...Object.keys(row.destinationPurposes ?? {}).filter(isConnectorType)]));
    const form = parseDraftForm(formString(formData), types);
    if (Object.keys(form.fieldErrors).length) return { ok: false, error: "fields", fieldErrors: form.fieldErrors };
    const [published] = await tx
      .select()
      .from(consentPolicies)
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.siteId, row.siteId), eq(consentPolicies.status, "published")))
      .orderBy(desc(consentPolicies.version))
      .limit(1);
    const baseline = published ? policyFieldsFrom(published) : DEFAULT_POLICY_FIELDS;
    const changes = diffPolicyFields(baseline, form.fields);
    if (isWeaker(changes)) {
      if (confirm !== "weaker") return { ok: false, error: "confirmWeaker" };
      if (!form.legalBasisNote || form.legalBasisNote.length < LEGAL_NOTE_MIN_LENGTH) return { ok: false, error: "legalNote", fieldErrors: { legalBasisNote: "legalNote" } };
    }
    await tx
      .update(consentPolicies)
      .set({ regionPolicies: form.fields.regionPolicies, destinationPurposes: form.fields.destinationPurposes, operationalEvents: form.fields.operationalEvents, legalBasisNote: form.legalBasisNote, updatedAt: new Date() })
      .where(eq(consentPolicies.id, row.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "consent_policy.draft_update", targetType: "consent_policy", targetId: row.id, diff: { version: row.version, changes, weaker: isWeaker(changes), legalBasisNoteLength: form.legalBasisNote?.length ?? 0 }, requestId: ctx.tenant.requestId });
    revalidateConsent();
    return { ok: true, error: null };
  });
}

/** Publishes a draft: the previously published version is archived, the worker picks the new one up within seconds. */
export async function publishConsentPolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("consent.manage");
  const parsed = z.object({ policyId: z.string().uuid(), confirm: z.literal("publish") }).safeParse({ policyId: formData.get("policyId"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmRequired" : "generic" };
  const { policyId } = parsed.data;
  return withOrg(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(consentPolicies)
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.id, policyId)))
      .limit(1);
    if (!row) return { ok: false, error: "notFound" };
    if (row.status !== "draft") return { ok: false, error: "notDraft" };
    const previous = await tx
      .select()
      .from(consentPolicies)
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.siteId, row.siteId), eq(consentPolicies.status, "published")))
      .orderBy(desc(consentPolicies.version));
    const now = new Date();
    for (const p of previous) await tx.update(consentPolicies).set({ status: "archived", updatedAt: now }).where(eq(consentPolicies.id, p.id));
    await tx.update(consentPolicies).set({ status: "published", publishedAt: now, updatedAt: now }).where(eq(consentPolicies.id, row.id));
    const baseline = previous[0] ? policyFieldsFrom(previous[0]) : DEFAULT_POLICY_FIELDS;
    const changes = diffPolicyFields(baseline, policyFieldsFrom(row));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "consent_policy.publish", targetType: "consent_policy", targetId: row.id, diff: { siteId: row.siteId, version: row.version, previousVersion: previous[0]?.version ?? null, changes, weaker: isWeaker(changes) }, requestId: ctx.tenant.requestId });
    revalidateConsent();
    return { ok: true, error: null };
  });
}

/** Archives a draft without publishing it. */
export async function discardConsentDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext("consent.manage");
  const parsed = z.object({ policyId: z.string().uuid(), confirm: z.literal("discard") }).safeParse({ policyId: formData.get("policyId"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmRequired" : "generic" };
  const { policyId } = parsed.data;
  return withOrg(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(consentPolicies)
      .where(and(eq(consentPolicies.organizationId, ctx.organization.id), eq(consentPolicies.id, policyId)))
      .limit(1);
    if (!row) return { ok: false, error: "notFound" };
    if (row.status !== "draft") return { ok: false, error: "notDraft" };
    await tx.update(consentPolicies).set({ status: "archived", updatedAt: new Date() }).where(eq(consentPolicies.id, row.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "consent_policy.discard", targetType: "consent_policy", targetId: row.id, diff: { siteId: row.siteId, version: row.version }, requestId: ctx.tenant.requestId });
    revalidateConsent();
    return { ok: true, error: null };
  });
}
