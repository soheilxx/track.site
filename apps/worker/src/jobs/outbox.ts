import type { WorkerContext } from "../context.ts";

/**
 * Transactional outbox relay: control-plane events written in the same transaction as their
 * business change are picked up here and applied to the data plane (cache invalidation, deletion
 * propagation, credential rotation clean-up). At-least-once; handlers are idempotent.
 */
export async function relayOutbox(ctx: WorkerContext): Promise<number> {
  const client = await ctx.pool.connect();
  let handled = 0;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    const res = await client.query<{ id: string; organization_id: string | null; topic: string; payload: Record<string, unknown>; attempts: number }>(
      `SELECT id, organization_id, topic, payload, attempts FROM outbox WHERE published_at IS NULL AND attempts < 10 ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED`,
    );
    for (const row of res.rows) {
      try {
        await handleTopic(ctx, row.topic, row.payload);
        await client.query(`UPDATE outbox SET published_at = now() WHERE id = $1`, [row.id]);
        handled++;
      } catch (e) {
        await client.query(`UPDATE outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, [row.id, (e instanceof Error ? e.message : String(e)).slice(0, 500)]);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return handled;
}

async function handleTopic(ctx: WorkerContext, topic: string, payload: Record<string, unknown>): Promise<void> {
  switch (topic) {
    case "config.published":
    case "config.rolled_back":
    case "integration.changed":
    case "credential.rotated":
      ctx.configs.invalidate(typeof payload.site_id === "string" ? payload.site_id : undefined);
      return;
    case "subject.delete": {
      const siteId = String(payload.site_id ?? "");
      const subject = (payload.subject ?? {}) as { anonymousId?: string; userId?: string; emailHash?: string };
      if (!siteId) return;
      const deleted = await ctx.eventStore.deleteSubject(siteId, subject);
      if (typeof payload.deletion_job_id === "string") {
        await ctx.pool.query(`UPDATE deletion_jobs SET status = 'done', finished_at = now(), details = details || $2::jsonb WHERE id = $1`, [payload.deletion_job_id, JSON.stringify({ deleted })]);
      }
      return;
    }
    case "site.deleted": {
      const siteId = String(payload.site_id ?? "");
      if (siteId) ctx.configs.invalidate(siteId);
      return;
    }
    default:
      ctx.logger.warn({ topic }, "unknown outbox topic");
  }
}
