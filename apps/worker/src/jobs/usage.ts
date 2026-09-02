import { usagePeriodKey } from "@track-site/core";
import type { WorkerContext } from "../context.ts";

/**
 * Applies plan limits to the current usage period: 80 % / 100 % warnings (data-quality inbox
 * entries visible to the customer) and soft/hard limit markers used by the collector and dashboard.
 */
export async function checkUsageLimits(ctx: WorkerContext): Promise<void> {
  const period = usagePeriodKey(ctx.now());
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    const rows = await client.query<{ id: string; organization_id: string; accepted_events: string; limit_events: string | null; warned_80_at: Date | null; warned_100_at: Date | null; plan_limit: number | null }>(
      `SELECT up.id, up.organization_id, up.accepted_events::text, up.limit_events::text, up.warned_80_at, up.warned_100_at,
              (p.limits->>'eventsPerMonth')::bigint AS plan_limit
       FROM usage_periods up
       LEFT JOIN subscriptions s ON s.organization_id = up.organization_id
       LEFT JOIN plans p ON p.id = coalesce(s.plan_id, 'starter')
       WHERE up.period_key = $1`,
      [period],
    );
    for (const r of rows.rows) {
      const limit = r.plan_limit ?? 50_000;
      const used = Number(r.accepted_events);
      const updates: string[] = [`limit_events = ${limit}`];
      const issue = async (kind: string, severity: string, summary: string) => {
        const site = await client.query<{ id: string }>(`SELECT id FROM sites WHERE organization_id = $1 ORDER BY created_at LIMIT 1`, [r.organization_id]);
        if (!site.rows[0]) return;
        await client.query(
          `INSERT INTO data_quality_issues (organization_id, site_id, kind, fingerprint, severity, summary, details, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open')
           ON CONFLICT (site_id, fingerprint) DO UPDATE SET last_seen_at = now(), occurrences = data_quality_issues.occurrences + 1, status = 'open'`,
          [r.organization_id, site.rows[0].id, kind, `${kind}:${period}`, severity, summary, JSON.stringify({ period, used, limit })],
        );
      };
      if (used >= limit && !r.warned_100_at) {
        updates.push("warned_100_at = now()", "soft_limit_hit_at = coalesce(soft_limit_hit_at, now())");
        await issue("usage_limit_reached", "critical", `Monthly event limit reached (${used.toLocaleString("en")} of ${limit.toLocaleString("en")}). Events are still accepted during the grace window; upgrade to avoid throttling.`);
      } else if (used >= limit * 0.8 && !r.warned_80_at) {
        updates.push("warned_80_at = now()");
        await issue("usage_limit_80", "warning", `80 % of the monthly event limit used (${used.toLocaleString("en")} of ${limit.toLocaleString("en")}).`);
      }
      if (used >= limit * 1.2) updates.push("hard_limit_hit_at = coalesce(hard_limit_hit_at, now())");
      await client.query(`UPDATE usage_periods SET ${updates.join(", ")}, updated_at = now() WHERE id = $1`, [r.id]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
