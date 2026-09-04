"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@track-site/core";
import { dataQualityIssues, environments, getOrCreateDraft, getSite, integrations, recordAudit, updateDraft } from "@track-site/db";
import { applyFixPlan, fixPlanFor, getIssue, loadFixContext, normalizeStatus, type InboxStatus } from "@/server/data-quality";
import { logger } from "@/server/db";
import { requireOrgContext, withOrg, type OrgContext } from "@/server/session";

/**
 * Data Quality Inbox actions. Tenant and actor come from the session only; every change is validated with zod,
 * runs inside the RLS transaction, is audited, and revalidates the inbox. Status changes and fix drafts need
 * `config.draft` (developer, admin, owner): the inbox is a workflow on the tracking configuration, and a mute
 * hides a measured problem. A fix draft is only ever a draft — publishing stays with the release center.
 */
export interface DataQualityActionState {
  ok: boolean;
  error: "invalid" | "not_found" | "forbidden" | "no_environment" | "no_fix" | "generic" | null;
  /** id of the config draft created or updated by `prepareFixDraftAction` */
  draftId?: string | null;
  lint?: { errors: number; warnings: number } | null;
}

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

const statusSchema = z
  .object({
    issueId: uuid,
    status: z.enum(["open", "acknowledged", "resolved", "muted"]),
    reason: z.string().trim().max(500).optional().default(""),
    until: z.enum(["7", "30", "90", "never"]).optional().default("never"),
    note: z.string().trim().max(500).optional().default(""),
  })
  .refine((v) => v.status !== "muted" || v.reason.length >= 3, { path: ["reason"], message: "reason" });

async function contextOr(permission: "config.draft" | "events.read"): Promise<OrgContext | "forbidden"> {
  try {
    return await requireOrgContext(permission);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return "forbidden";
    throw e;
  }
}

/** open → acknowledged → resolved, or muted with a reason and an optional end date; reopening clears the workflow fields. */
export async function setIssueStatusAction(_prev: DataQualityActionState, formData: FormData): Promise<DataQualityActionState> {
  const ctx = await contextOr("config.draft");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = statusSchema.safeParse({ issueId: formData.get("issueId"), status: formData.get("status"), reason: formData.get("reason") ?? "", until: formData.get("until") ?? "never", note: formData.get("note") ?? "" });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { issueId, status, reason, until, note } = parsed.data;
  const now = new Date();
  const mutedUntil = status === "muted" && until !== "never" ? new Date(now.getTime() + Number(until) * 86_400_000) : null;
  const result = await withOrg(ctx, async (tx) => {
    const issue = await getIssue(tx, ctx.organization.id, issueId);
    if (!issue) return "not_found" as const;
    const from: InboxStatus = normalizeStatus(issue.status);
    await tx
      .update(dataQualityIssues)
      .set({
        status,
        resolvedAt: status === "resolved" ? now : null,
        acknowledgedAt: status === "acknowledged" ? now : status === "open" ? null : issue.acknowledgedAt,
        acknowledgedBy: status === "acknowledged" ? ctx.user.id : status === "open" ? null : issue.acknowledgedBy,
        mutedUntil,
        muteReason: status === "muted" ? reason : null,
        statusNote: note || null,
        statusChangedBy: ctx.user.id,
        statusChangedAt: now,
      })
      .where(and(eq(dataQualityIssues.id, issue.id), eq(dataQualityIssues.organizationId, ctx.organization.id)));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: `quality_issue.${status}`,
      targetType: "data_quality_issue",
      targetId: issue.id,
      diff: { kind: issue.kind, from, to: status, reason: status === "muted" ? reason : null, until: mutedUntil?.toISOString() ?? null, note: note || null },
      requestId: ctx.tenant.requestId,
    });
    return "ok" as const;
  });
  if (result === "not_found") return { ok: false, error: "not_found" };
  revalidatePath("/app/data-quality");
  revalidatePath("/app");
  return { ok: true, error: null };
}

const fixSchema = z.object({ issueId: uuid, environmentId: uuid });

type FixResult = { error: "not_found" | "no_environment" | "no_fix" } | { draftId: string; lint: { errors: number; warnings: number } };

/**
 * Prepares a reviewable config draft for an issue through the existing draft mechanism (`getOrCreateDraft` +
 * `updateDraft`, re-linted). Never publishes; the draft shows up in the release center like any other draft.
 */
export async function prepareFixDraftAction(_prev: DataQualityActionState, formData: FormData): Promise<DataQualityActionState> {
  const ctx = await contextOr("config.draft");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = fixSchema.safeParse({ issueId: formData.get("issueId"), environmentId: formData.get("environmentId") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const result = await withOrg<FixResult>(ctx, async (tx) => {
      const issue = await getIssue(tx, ctx.organization.id, parsed.data.issueId);
      if (!issue) return { error: "not_found" as const };
      const site = await getSite(tx, ctx.organization.id, issue.siteId);
      if (!site) return { error: "not_found" as const };
      const env = (await tx.select({ id: environments.id }).from(environments).where(and(eq(environments.id, parsed.data.environmentId), eq(environments.siteId, site.id))).limit(1))[0];
      if (!env) return { error: "no_environment" as const };
      const names = await tx.select({ id: integrations.id, name: integrations.name }).from(integrations).where(eq(integrations.siteId, site.id));
      const fixContext = await loadFixContext(tx, { siteId: site.id, environmentId: env.id, siteCurrency: site.currency, destinationNames: Object.fromEntries(names.map((n) => [n.id, n.name])) });
      // a draft already prepared for this issue is reported, not duplicated
      const plan = fixPlanFor({ kind: issue.kind, evidence: issue.evidence ?? null, fixDraftId: null }, fixContext);
      if (!plan.code) return { error: "no_fix" as const };
      const draft = await getOrCreateDraft(tx, { organizationId: ctx.organization.id, siteId: site.id, environmentId: env.id, createdBy: ctx.user.id });
      const { lint } = await updateDraft(tx, draft.id, (bundle) => applyFixPlan(bundle, plan));
      await tx.update(dataQualityIssues).set({ fixDraftId: draft.id, fixDraftAt: new Date() }).where(and(eq(dataQualityIssues.id, issue.id), eq(dataQualityIssues.organizationId, ctx.organization.id)));
      await recordAudit(tx, {
        organizationId: ctx.organization.id,
        actor: ctx.tenant.actor,
        action: "quality_issue.fix_draft",
        targetType: "config_draft",
        targetId: draft.id,
        diff: { issueId: issue.id, kind: issue.kind, fix: plan.code, params: plan.params, environmentId: env.id, lintErrors: lint.errors.length, lintWarnings: lint.warnings.length },
        requestId: ctx.tenant.requestId,
      });
      return { draftId: draft.id, lint: { errors: lint.errors.length, warnings: lint.warnings.length } };
    });
    if ("error" in result) return { ok: false, error: result.error };
    revalidatePath("/app/data-quality");
    revalidatePath("/app/releases");
    return { ok: true, error: null, draftId: result.draftId, lint: result.lint };
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "fix draft failed");
    return { ok: false, error: "generic" };
  }
}
