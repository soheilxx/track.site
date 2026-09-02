import type { WorkerContext } from "../context.ts";

const DEFAULT_DAYS: Record<string, number> = {
  events: 395,
  click_ids: 90,
  consent_snapshots: 1095,
  delivery_attempts: 90,
  audit_log: 730,
  chat_transcripts: 30,
  ip_hashes: 30,
};

/** Hard-deletes data past its retention (org/site overrides from retention_policies). */
export async function runRetention(ctx: WorkerContext): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    await client.query(`SELECT set_config('app.retention_job', 'on', true)`);
    const sites = await client.query<{ id: string; organization_id: string }>(`SELECT id, organization_id FROM sites`);
    const overrides = await client.query<{ organization_id: string; site_id: string | null; data_kind: string; days: number }>(`SELECT organization_id, site_id, data_kind, days FROM retention_policies`);
    const daysFor = (orgId: string, siteId: string, kind: string): number => {
      const site = overrides.rows.find((r) => r.site_id === siteId && r.data_kind === kind);
      const org = overrides.rows.find((r) => r.site_id === null && r.organization_id === orgId && r.data_kind === kind);
      return site?.days ?? org?.days ?? DEFAULT_DAYS[kind] ?? 365;
    };
    let events = 0;
    for (const s of sites.rows) {
      const before = new Date(ctx.now().getTime() - daysFor(s.organization_id, s.id, "events") * 86_400_000);
      const n = await ctx.eventStore.deleteOlderThan(s.id, before);
      if (n > 0) events += n;
      const clickBefore = new Date(ctx.now().getTime() - daysFor(s.organization_id, s.id, "click_ids") * 86_400_000);
      await client.query(`UPDATE events SET click_ids = NULL, vendor_ids = NULL WHERE site_id = $1 AND server_ts < $2 AND (click_ids IS NOT NULL OR vendor_ids IS NOT NULL)`, [s.id, clickBefore]);
    }
    result.events = events;
    const del = async (kind: string, sql: string) => {
      const r = await client.query(sql, [DEFAULT_DAYS[kind]]);
      result[kind] = r.rowCount ?? 0;
    };
    await del("delivery_attempts", `DELETE FROM delivery_attempts WHERE started_at < now() - ($1::int * interval '1 day')`);
    await del("audit_log", `DELETE FROM audit_log WHERE created_at < now() - ($1::int * interval '1 day')`);
    await del("chat_transcripts", `DELETE FROM chat_messages WHERE created_at < now() - ($1::int * interval '1 day')`);
    await client.query(`DELETE FROM event_dedup WHERE created_at < now() - interval '35 days'`);
    await client.query(`DELETE FROM nonces WHERE expires_at < now()`);
    await client.query(`DELETE FROM attribution_touchpoints WHERE expires_at < now()`);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  ctx.logger.info(result, "retention run");
  return result;
}

/** Keeps monthly partitions of the event store ahead of time. */
export async function ensureEventPartitions(ctx: WorkerContext): Promise<void> {
  if (ctx.eventStore.driver !== "pg") return;
  const now = ctx.now();
  for (let i = -1; i <= 3; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    await ctx.pool.query(`SELECT ensure_event_partition($1::date)`, [d.toISOString().slice(0, 10)]);
  }
}
