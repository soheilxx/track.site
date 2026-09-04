import { eq } from "drizzle-orm";
import { configApprovals, configBundleDigest, configDrafts, createDb, publishDraft, recordAudit, withWorker, type Db, type SigningKeys } from "@track-site/db";
import type { WorkerContext } from "../context.ts";

/**
 * Scheduled publications of the Change & Release Center (migration 0010). The release center stores
 * `scheduled_at`, the bundle digest and the approval that satisfied the four-eyes rule on the draft;
 * this job claims due drafts atomically (`schedule_attempted_at`, `FOR UPDATE SKIP LOCKED`, so several
 * workers never publish the same draft twice) and publishes each one through the platform's
 * `publishDraft` — the same signed, audited path the dashboard and the AI confirm tool use.
 *
 * A draft is refused, with the reason written to `schedule_error` and an audit entry, when it is no
 * longer open, when its content changed since it was scheduled (digest mismatch), when the recorded
 * approval is no longer valid, when lint fails, or when the worker has no signing key. Nothing is
 * retried automatically: the release center shows the error and a person re-schedules deliberately.
 *
 * Not registered in `jobs/index.ts` yet — the integration stage wires it with
 * `every(SCHEDULED_PUBLISH_INTERVAL_MS, "scheduled-publish", () => runScheduledPublications(ctx))`.
 * The signing key is read from `CONFIG_SIGNING_PRIVATE_KEY` / `CONFIG_SIGNING_KEY_ID` (the same
 * variables the web app uses; the worker env schema does not declare them yet).
 */
export const SCHEDULED_PUBLISH_INTERVAL_MS = 30_000;
export const SCHEDULED_PUBLISH_BATCH = 20;

export const SCHEDULE_ERROR_CODES = ["signing_key_missing", "draft_not_open", "draft_changed", "approval_invalid", "lint_failed", "publish_failed"] as const;
export type ScheduleErrorCode = (typeof SCHEDULE_ERROR_CODES)[number];

export class ScheduleFailure extends Error {
  readonly code: ScheduleErrorCode;
  constructor(code: ScheduleErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ScheduleFailure";
    this.code = code;
  }
}

interface DueDraft {
  id: string;
  organization_id: string;
  site_id: string;
  environment_id: string;
  scheduled_by: string | null;
  schedule_digest: string | null;
  schedule_approval_id: string | null;
  scheduled_at: Date;
}

const SYSTEM_ACTOR = { kind: "system" as const, name: "scheduled-publish" };

/** Signing key of the worker process; null when the deployment did not provide one. */
export function workerSigningKeys(env: Record<string, string | undefined> = process.env): SigningKeys | null {
  const privateKeyBase64 = env.CONFIG_SIGNING_PRIVATE_KEY;
  if (!privateKeyBase64) return null;
  return { keyId: env.CONFIG_SIGNING_KEY_ID || "cfg-v1", privateKeyBase64 };
}

/** Claims every due draft in one statement; the marker makes the claim idempotent across workers. */
async function claimDueDrafts(ctx: WorkerContext): Promise<DueDraft[]> {
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    const res = await client.query<DueDraft>(
      `UPDATE config_drafts SET schedule_attempted_at = now()
       WHERE id IN (
         SELECT id FROM config_drafts
         WHERE status = 'open' AND scheduled_at IS NOT NULL AND scheduled_at <= now() AND schedule_attempted_at IS NULL
         ORDER BY scheduled_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, organization_id, site_id, environment_id, scheduled_by, schedule_digest, schedule_approval_id, scheduled_at`,
      [SCHEDULED_PUBLISH_BATCH],
    );
    await client.query("COMMIT");
    return res.rows;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Publishes one claimed draft after re-checking everything the schedule relied on. Runs as the
 * data-plane role like every worker job; the tenant is the one recorded on the claimed row.
 */
export async function publishScheduledDraft(db: Db, keys: SigningKeys | null, row: DueDraft, requestId: string): Promise<{ versionId: string; version: number }> {
  return withWorker(db, async (tx) => {
    const [draft] = await tx.select().from(configDrafts).where(eq(configDrafts.id, row.id)).limit(1);
    if (!draft || draft.status !== "open") throw new ScheduleFailure("draft_not_open");
    const digest = configBundleDigest(draft.bundle);
    if (!row.schedule_digest || digest !== row.schedule_digest) throw new ScheduleFailure("draft_changed");
    if (row.schedule_approval_id) {
      const [approval] = await tx.select({ decision: configApprovals.decision, bundleDigest: configApprovals.bundleDigest }).from(configApprovals).where(eq(configApprovals.id, row.schedule_approval_id)).limit(1);
      if (!approval || approval.decision !== "approved" || approval.bundleDigest !== digest) throw new ScheduleFailure("approval_invalid");
    }
    if (!keys) throw new ScheduleFailure("signing_key_missing");
    let version: Awaited<ReturnType<typeof publishDraft>>;
    try {
      version = await publishDraft(tx, { draftId: draft.id, actor: SYSTEM_ACTOR, userId: row.scheduled_by, approvalId: row.schedule_approval_id, keys, requestId });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new ScheduleFailure(message.startsWith("draft has lint errors") ? "lint_failed" : "publish_failed", message);
    }
    if (row.schedule_approval_id) await tx.update(configApprovals).set({ versionId: version.id }).where(eq(configApprovals.id, row.schedule_approval_id));
    await recordAudit(tx, {
      organizationId: row.organization_id,
      actor: SYSTEM_ACTOR,
      action: "config.schedule_executed",
      targetType: "config_version",
      targetId: version.id,
      diff: { draftId: draft.id, version: version.version, environmentId: row.environment_id, scheduledAt: row.scheduled_at.toISOString(), scheduledBy: row.scheduled_by, approvalId: row.schedule_approval_id },
      requestId,
    });
    return { versionId: version.id, version: version.version };
  });
}

async function markFailed(db: Db, row: DueDraft, code: ScheduleErrorCode, detail: string, requestId: string): Promise<void> {
  await withWorker(db, async (tx) => {
    await tx.update(configDrafts).set({ scheduleError: code }).where(eq(configDrafts.id, row.id));
    await recordAudit(tx, {
      organizationId: row.organization_id,
      actor: SYSTEM_ACTOR,
      action: "config.schedule_failed",
      targetType: "config_draft",
      targetId: row.id,
      diff: { code, detail: detail.slice(0, 300), environmentId: row.environment_id, scheduledAt: row.scheduled_at.toISOString(), scheduledBy: row.scheduled_by },
      requestId,
    });
  });
}

export interface ScheduledPublishStats {
  claimed: number;
  published: number;
  failed: number;
}

/** One tick of the job: claim due drafts, publish each, record failures. Safe to run on several workers. */
export async function runScheduledPublications(ctx: WorkerContext): Promise<ScheduledPublishStats> {
  const due = await claimDueDrafts(ctx);
  const stats: ScheduledPublishStats = { claimed: due.length, published: 0, failed: 0 };
  if (due.length === 0) return stats;
  const db = createDb(ctx.pool);
  const keys = workerSigningKeys();
  for (const row of due) {
    const requestId = `scheduled-publish:${row.id}:${ctx.now().toISOString()}`;
    try {
      const result = await publishScheduledDraft(db, keys, row, requestId);
      stats.published += 1;
      ctx.logger.info({ draftId: row.id, organizationId: row.organization_id, environmentId: row.environment_id, version: result.version }, "scheduled publication done");
    } catch (e) {
      stats.failed += 1;
      const code: ScheduleErrorCode = e instanceof ScheduleFailure ? e.code : "publish_failed";
      const detail = e instanceof Error ? e.message : String(e);
      ctx.logger.warn({ draftId: row.id, organizationId: row.organization_id, code, err: detail }, "scheduled publication refused");
      try {
        await markFailed(db, row, code, detail, requestId);
      } catch (inner) {
        ctx.logger.error({ draftId: row.id, err: inner instanceof Error ? inner.message : String(inner) }, "could not record scheduled publication failure");
      }
    }
  }
  return stats;
}
