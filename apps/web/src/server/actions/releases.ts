"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, can } from "@track-site/core";
import { configBundleSchema, type ConfigBundle } from "@track-site/config";
import { activeVersion, configApprovals, configBundleDigest, configDrafts, configVersions, environments, preparePublish, publishDraft, recordAudit, rollbackToVersion, type Tx } from "@track-site/db";
import { signingKeys } from "@/server/db";
import { approvalView, criticalSignals, evaluateFourEyes, isCriticalChange, memberDirectory, parseScheduleInput, type CriticalReason, type FourEyes } from "@/server/releases";
import { requireOrgContext, withOrg, type OrgContext } from "@/server/session";

/**
 * Change & Release Center actions. Tenant and actor come from the session only; every input is
 * validated with zod, every change runs inside the RLS transaction, writes an audit entry and
 * revalidates the module. Publishing and rolling back reuse the platform's publish/rollback logic
 * (`publishDraft`, `rollbackToVersion` of `@track-site/db`, the same functions the AI confirm tools
 * call) — this file only adds the release workflow around them: four-eyes approvals, scheduling and
 * the explicit confirmations the UI sends as form fields.
 */
export type ReleaseActionError =
  | "invalid"
  | "forbidden"
  | "not_found"
  | "not_open"
  | "lint"
  | "approval_required"
  | "approval_pending"
  | "approval_rejected"
  | "acknowledge_required"
  | "self_approval"
  | "stale"
  | "reason_required"
  | "signing"
  | "schedule_invalid"
  | "schedule_too_soon"
  | "schedule_too_far"
  | "already_active"
  | "generic";

export interface ReleaseActionState {
  ok: boolean;
  error: ReleaseActionError | null;
  /** id of the version created by a publish (the UI navigates to it) */
  versionId?: string | null;
  version?: number | null;
}

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const RELEASE_PATHS = ["/app/releases", "/app", "/app/ai-setup"];

function revalidateReleases(versionId?: string | null): void {
  for (const path of RELEASE_PATHS) revalidatePath(path);
  revalidatePath("/app/releases/[versionId]", "page");
  if (versionId) revalidatePath(`/app/releases/${versionId}`);
}

async function contextOr(permission: "config.draft" | "config.publish" | "config.rollback"): Promise<OrgContext | "forbidden"> {
  try {
    return await requireOrgContext(permission);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return "forbidden";
    throw e;
  }
}

const str = (formData: FormData, name: string): string | null => {
  const v = formData.get(name);
  return typeof v === "string" ? v : null;
};

type DraftRow = typeof configDrafts.$inferSelect;

async function openDraftById(tx: Tx, draftId: string): Promise<DraftRow | null> {
  const [row] = await tx.select().from(configDrafts).where(eq(configDrafts.id, draftId)).limit(1);
  return row ?? null;
}

async function environmentKindOf(tx: Tx, environmentId: string): Promise<"production" | "staging" | "development" | null> {
  const [row] = await tx.select({ kind: environments.kind }).from(environments).where(eq(environments.id, environmentId)).limit(1);
  return row?.kind ?? null;
}

interface DraftAssessment {
  before: ConfigBundle | null;
  after: ConfigBundle;
  digest: string;
  reasons: CriticalReason[];
  critical: boolean;
  fourEyes: FourEyes;
  baseVersion: number | null;
  nextVersion: number;
}

/** The facts every release action re-derives from the database (never from the form): diff, criticality and the four-eyes state. */
async function assessDraft(tx: Tx, ctx: OrgContext, draft: DraftRow, directory: { names: Record<string, string>; publishers: number }): Promise<DraftAssessment | "lint"> {
  const parsed = configBundleSchema.safeParse(draft.bundle);
  if (!parsed.success) return "lint";
  const active = await activeVersion(tx, draft.environmentId);
  const before = active ? configBundleSchema.parse(active.bundle) : null;
  const kind = (await environmentKindOf(tx, draft.environmentId)) ?? "production";
  const digest = configBundleDigest(draft.bundle);
  const reasons = criticalSignals(before, parsed.data);
  const critical = isCriticalChange(kind, reasons);
  const rows = await tx.select().from(configApprovals).where(eq(configApprovals.draftId, draft.id)).orderBy(desc(configApprovals.createdAt)).limit(20);
  const fourEyes = evaluateFourEyes({ critical, reasons, publishers: directory.publishers, approvals: rows.map((a) => approvalView(a, directory.names, digest)) });
  return { before, after: parsed.data, digest, reasons, critical, fourEyes, baseVersion: active?.version ?? null, nextVersion: (active?.version ?? 0) + 1 };
}

/** The gate a publish or a schedule has to pass: lint clean, four-eyes satisfied (or acknowledged single-person release). */
function releaseGate(assessment: DraftAssessment, lintOk: boolean, acknowledgeSingle: boolean): ReleaseActionError | null {
  if (!lintOk) return "lint";
  const fe = assessment.fourEyes;
  if (fe.required && !fe.approval) return fe.state === "pending" ? "approval_pending" : fe.state === "rejected" ? "approval_rejected" : "approval_required";
  if (fe.critical && !fe.required && !fe.approval && !acknowledgeSingle) return "acknowledge_required";
  return null;
}

/** Asks a second member for a review of the open draft (the change summary and digest are frozen on the request). */
export async function requestApprovalAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.draft");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = z.object({ draftId: uuid, note: z.string().trim().max(500) }).safeParse({ draftId: str(formData, "draftId"), note: str(formData, "note") ?? "" });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const directory = await memberDirectory(ctx);
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const draft = await openDraftById(tx, parsed.data.draftId);
    if (!draft) return { ok: false, error: "not_found" };
    if (draft.status !== "open") return { ok: false, error: "not_open" };
    const assessment = await assessDraft(tx, ctx, draft, directory);
    if (assessment === "lint") return { ok: false, error: "lint" };
    if (assessment.fourEyes.pending) return { ok: false, error: "approval_pending" };
    const preview = await preparePublish(tx, draft.id);
    const [inserted] = await tx
      .insert(configApprovals)
      .values({
        organizationId: ctx.organization.id,
        siteId: draft.siteId,
        environmentId: draft.environmentId,
        kind: "publish",
        draftId: draft.id,
        bundleDigest: assessment.digest,
        critical: assessment.critical,
        criticalReasons: assessment.reasons,
        summary: { baseVersion: assessment.baseVersion, nextVersion: assessment.nextVersion, changes: preview.diff.slice(0, 50).map((d) => d.summary) },
        requestedBy: ctx.user.id,
        requestNote: parsed.data.note || null,
      })
      .returning({ id: configApprovals.id });
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "config.approval_request", targetType: "config_approval", targetId: inserted!.id, diff: { draftId: draft.id, environmentId: draft.environmentId, critical: assessment.critical, reasons: assessment.reasons, digest: assessment.digest, changes: preview.diff.length }, requestId: ctx.tenant.requestId });
    return { ok: true, error: null };
  });
  if (result.ok) revalidateReleases();
  return result;
}

/** Approves or rejects a pending request. Never by the requester; never for a draft that changed since the request. */
export async function decideApprovalAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.publish");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = z.object({ approvalId: uuid, decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(500) }).safeParse({ approvalId: str(formData, "approvalId"), decision: str(formData, "decision"), reason: str(formData, "reason") ?? "" });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { approvalId, decision, reason } = parsed.data;
  if (decision === "reject" && reason.length < 3) return { ok: false, error: "reason_required" };
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const [approval] = await tx.select().from(configApprovals).where(eq(configApprovals.id, approvalId)).limit(1);
    if (!approval) return { ok: false, error: "not_found" };
    if (approval.decision !== "pending") return { ok: false, error: "not_open" };
    if (approval.requestedBy === ctx.user.id) return { ok: false, error: "self_approval" };
    const draft = approval.draftId ? await openDraftById(tx, approval.draftId) : null;
    if (!draft || draft.status !== "open") return { ok: false, error: "not_open" };
    if (configBundleDigest(draft.bundle) !== approval.bundleDigest) return { ok: false, error: "stale" };
    const now = new Date();
    await tx
      .update(configApprovals)
      .set({ decision: decision === "approve" ? "approved" : "rejected", approverId: ctx.user.id, reason: reason || null, decidedAt: now })
      .where(eq(configApprovals.id, approval.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: decision === "approve" ? "config.approval_approve" : "config.approval_reject", targetType: "config_approval", targetId: approval.id, diff: { draftId: approval.draftId, requestedBy: approval.requestedBy, critical: approval.critical, reasons: approval.criticalReasons, digest: approval.bundleDigest, reasonLength: reason.length }, requestId: ctx.tenant.requestId });
    return { ok: true, error: null };
  });
  if (result.ok) revalidateReleases();
  return result;
}

/** The requester (or a publisher) takes a pending request back. */
export async function withdrawApprovalAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.draft");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = z.object({ approvalId: uuid }).safeParse({ approvalId: str(formData, "approvalId") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const [approval] = await tx.select().from(configApprovals).where(eq(configApprovals.id, parsed.data.approvalId)).limit(1);
    if (!approval) return { ok: false, error: "not_found" };
    if (approval.decision !== "pending") return { ok: false, error: "not_open" };
    if (approval.requestedBy !== ctx.user.id && !can(ctx.role, "config.publish")) return { ok: false, error: "forbidden" };
    await tx.update(configApprovals).set({ decision: "withdrawn", decidedAt: new Date() }).where(eq(configApprovals.id, approval.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "config.approval_withdraw", targetType: "config_approval", targetId: approval.id, diff: { draftId: approval.draftId, requestedBy: approval.requestedBy }, requestId: ctx.tenant.requestId });
    return { ok: true, error: null };
  });
  if (result.ok) revalidateReleases();
  return result;
}

const publishSchema = z.object({ draftId: uuid, confirm: z.literal("publish"), acknowledgeSingle: z.enum(["1", "0"]).nullable() });

/**
 * Publishes the open draft as a signed, immutable version (`publishDraft`): lint must be clean, a
 * critical production change needs the four-eyes approval (or, with a single publisher in the
 * organization, an explicit single-person acknowledgement that is audited), and the UI confirmation
 * travels as a form field that is re-checked here.
 */
export async function publishDraftAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.publish");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = publishSchema.safeParse({ draftId: str(formData, "draftId"), confirm: str(formData, "confirm"), acknowledgeSingle: str(formData, "acknowledgeSingle") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const keys = signingKeys();
  if (!keys) return { ok: false, error: "signing" };
  const directory = await memberDirectory(ctx);
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const draft = await openDraftById(tx, parsed.data.draftId);
    if (!draft) return { ok: false, error: "not_found" };
    if (draft.status !== "open") return { ok: false, error: "not_open" };
    const assessment = await assessDraft(tx, ctx, draft, directory);
    if (assessment === "lint") return { ok: false, error: "lint" };
    const preview = await preparePublish(tx, draft.id);
    const gate = releaseGate(assessment, preview.lint.ok, parsed.data.acknowledgeSingle === "1");
    if (gate) return { ok: false, error: gate };
    const approvalId = assessment.fourEyes.approval?.id ?? null;
    const version = await publishDraft(tx, { draftId: draft.id, actor: ctx.tenant.actor, userId: ctx.user.id, approvalId, keys: { keyId: keys.keyId, privateKeyBase64: keys.privateKeyBase64 }, requestId: ctx.tenant.requestId });
    if (approvalId) await tx.update(configApprovals).set({ versionId: version.id }).where(eq(configApprovals.id, approvalId));
    await recordAudit(tx, {
      organizationId: ctx.organization.id,
      actor: ctx.tenant.actor,
      action: "config.release",
      targetType: "config_version",
      targetId: version.id,
      diff: { version: version.version, environmentId: draft.environmentId, critical: assessment.critical, reasons: assessment.reasons, fourEyes: assessment.fourEyes.state, approvalId, singlePersonRelease: assessment.critical && !approvalId, scheduledAt: draft.scheduledAt ? draft.scheduledAt.toISOString() : null, via: "release_center" },
      requestId: ctx.tenant.requestId,
    });
    return { ok: true, error: null, versionId: version.id, version: version.version };
  });
  if (result.ok) revalidateReleases(result.versionId);
  return result;
}

const scheduleSchema = z.object({ draftId: uuid, scheduledAt: z.string().min(10).max(40), acknowledgeSingle: z.enum(["1", "0"]).nullable() });

/** Schedules the open draft: the same gate as a publish now; the worker executes it and refuses a draft that changed since. */
export async function scheduleDraftAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.publish");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = scheduleSchema.safeParse({ draftId: str(formData, "draftId"), scheduledAt: str(formData, "scheduledAt"), acknowledgeSingle: str(formData, "acknowledgeSingle") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const when = parseScheduleInput(parsed.data.scheduledAt, new Date());
  if (when.error) return { ok: false, error: when.error === "invalid" ? "schedule_invalid" : when.error === "too_soon" ? "schedule_too_soon" : "schedule_too_far" };
  const directory = await memberDirectory(ctx);
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const draft = await openDraftById(tx, parsed.data.draftId);
    if (!draft) return { ok: false, error: "not_found" };
    if (draft.status !== "open") return { ok: false, error: "not_open" };
    const assessment = await assessDraft(tx, ctx, draft, directory);
    if (assessment === "lint") return { ok: false, error: "lint" };
    const preview = await preparePublish(tx, draft.id);
    const gate = releaseGate(assessment, preview.lint.ok, parsed.data.acknowledgeSingle === "1");
    if (gate) return { ok: false, error: gate };
    const approvalId = assessment.fourEyes.approval?.id ?? null;
    await tx
      .update(configDrafts)
      .set({ scheduledAt: when.at, scheduledBy: ctx.user.id, scheduleDigest: assessment.digest, scheduleApprovalId: approvalId, scheduleAttemptedAt: null, scheduleError: null })
      .where(eq(configDrafts.id, draft.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "config.schedule", targetType: "config_draft", targetId: draft.id, diff: { scheduledAt: when.at.toISOString(), environmentId: draft.environmentId, nextVersion: assessment.nextVersion, critical: assessment.critical, reasons: assessment.reasons, approvalId, digest: assessment.digest, singlePersonRelease: assessment.critical && !approvalId }, requestId: ctx.tenant.requestId });
    return { ok: true, error: null };
  });
  if (result.ok) revalidateReleases();
  return result;
}

/** Removes the schedule of a draft (nothing else changes). */
export async function cancelScheduleAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.publish");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = z.object({ draftId: uuid }).safeParse({ draftId: str(formData, "draftId") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const draft = await openDraftById(tx, parsed.data.draftId);
    if (!draft) return { ok: false, error: "not_found" };
    if (!draft.scheduledAt) return { ok: false, error: "not_open" };
    await tx.update(configDrafts).set({ scheduledAt: null, scheduledBy: null, scheduleDigest: null, scheduleApprovalId: null, scheduleAttemptedAt: null, scheduleError: null }).where(eq(configDrafts.id, draft.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "config.schedule_cancel", targetType: "config_draft", targetId: draft.id, diff: { scheduledAt: draft.scheduledAt.toISOString(), scheduleError: draft.scheduleError }, requestId: ctx.tenant.requestId });
    return { ok: true, error: null };
  });
  if (result.ok) revalidateReleases();
  return result;
}

/** Discards the open draft (confirmed in the UI): pending approvals are withdrawn, a schedule is removed. */
export async function discardDraftAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.draft");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = z.object({ draftId: uuid, confirm: z.literal("discard") }).safeParse({ draftId: str(formData, "draftId"), confirm: str(formData, "confirm") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const draft = await openDraftById(tx, parsed.data.draftId);
    if (!draft) return { ok: false, error: "not_found" };
    if (draft.status !== "open") return { ok: false, error: "not_open" };
    const now = new Date();
    await tx.update(configApprovals).set({ decision: "withdrawn", decidedAt: now }).where(and(eq(configApprovals.draftId, draft.id), eq(configApprovals.decision, "pending")));
    await tx.update(configDrafts).set({ status: "discarded", scheduledAt: null, scheduledBy: null, scheduleDigest: null, scheduleApprovalId: null, scheduleAttemptedAt: null, scheduleError: null }).where(eq(configDrafts.id, draft.id));
    await recordAudit(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: "config.draft_discard", targetType: "config_draft", targetId: draft.id, diff: { environmentId: draft.environmentId, baseVersion: draft.baseVersion, wasScheduled: Boolean(draft.scheduledAt) }, requestId: ctx.tenant.requestId });
    return { ok: true, error: null };
  });
  if (result.ok) revalidateReleases();
  return result;
}

/** One-click rollback (confirmed in the UI): activates a previously published version again through `rollbackToVersion`. */
export async function rollbackAction(_prev: ReleaseActionState, formData: FormData): Promise<ReleaseActionState> {
  const ctx = await contextOr("config.rollback");
  if (ctx === "forbidden") return { ok: false, error: "forbidden" };
  const parsed = z.object({ versionId: uuid, confirm: z.literal("rollback") }).safeParse({ versionId: str(formData, "versionId"), confirm: str(formData, "confirm") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withOrg(ctx, async (tx): Promise<ReleaseActionState> => {
    const [target] = await tx.select().from(configVersions).where(eq(configVersions.id, parsed.data.versionId)).limit(1);
    if (!target) return { ok: false, error: "not_found" };
    const active = await activeVersion(tx, target.environmentId);
    if (active?.id === target.id) return { ok: false, error: "already_active" };
    const version = await rollbackToVersion(tx, { environmentId: target.environmentId, targetVersionId: target.id, actor: ctx.tenant.actor, userId: ctx.user.id, approvalId: null, requestId: ctx.tenant.requestId });
    return { ok: true, error: null, versionId: version.id, version: version.version };
  });
  if (result.ok) revalidateReleases(result.versionId);
  return result;
}
