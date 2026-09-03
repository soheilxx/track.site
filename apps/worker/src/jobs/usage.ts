import { DEFAULT_OVERAGE_POLICY, USAGE_PAUSE_GRACE_PERCENT, USAGE_WARNING_THRESHOLDS, isOveragePolicy, isPlanId, overagePackFor, planRecord, type OveragePolicy } from "@track-site/catalog";
import { usagePeriodKey } from "@track-site/core";
import type { WorkerContext } from "../context.ts";

interface UsageRow {
  id: string;
  organization_id: string;
  billable_events: string;
  warned_70_at: Date | null;
  warned_90_at: Date | null;
  warned_100_at: Date | null;
  /** null when the plans table has no row for the subscription's plan (unseeded database) */
  plan_id: string | null;
  /** `plans.limits.eventsPerMonth`; null for plans without a fixed cap (custom contract) */
  plan_limit: string | null;
  usage_overage_policy: string | null;
  usage_cost_limit_cents: string | null;
}

/**
 * Applies the tariff catalogue to the current usage period: warnings at 70 / 90 / 100 % of the plan's
 * monthly event limit (data-quality inbox entries visible to the customer), the soft-limit marker at
 * 100 % and the hard-limit marker according to the organization's overage policy. Only billable events
 * count (test-mode events, duplicates and retries are excluded by the ingest stage).
 */
export async function checkUsageLimits(ctx: WorkerContext): Promise<void> {
  const period = usagePeriodKey(ctx.now());
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    const rows = await client.query<UsageRow>(
      `SELECT up.id, up.organization_id, up.billable_events::text, up.warned_70_at, up.warned_90_at, up.warned_100_at,
              p.id AS plan_id, (p.limits->>'eventsPerMonth')::bigint::text AS plan_limit,
              os.usage_overage_policy, os.usage_cost_limit_cents::text
       FROM usage_periods up
       LEFT JOIN subscriptions s ON s.organization_id = up.organization_id
       LEFT JOIN plans p ON p.id = coalesce(s.plan_id, 'starter')
       LEFT JOIN organization_settings os ON os.organization_id = up.organization_id
       WHERE up.period_key = $1`,
      [period],
    );
    for (const r of rows.rows) {
      // limit: the plan row (synced from the catalogue); the catalogue's Starter record when the table is not seeded
      const limit = r.plan_id == null ? planRecord("starter").limits.eventsPerMonth : r.plan_limit == null ? null : Number(r.plan_limit);
      if (limit == null || !Number.isFinite(limit) || limit <= 0) {
        // no fixed cap in this plan (custom contract): nothing to warn about automatically
        await client.query(`UPDATE usage_periods SET limit_events = NULL, updated_at = now() WHERE id = $1`, [r.id]);
        continue;
      }
      const used = Number(r.billable_events);
      const pct = (used / limit) * 100;
      const policy: OveragePolicy = isOveragePolicy(r.usage_overage_policy) ? r.usage_overage_policy : DEFAULT_OVERAGE_POLICY;
      const planId = r.plan_id ?? "starter";
      const pack = isPlanId(planId) ? overagePackFor(planId) : null;
      const updates: string[] = [`limit_events = ${Math.trunc(limit)}`];
      const usedText = used.toLocaleString("en");
      const limitText = limit.toLocaleString("en");

      const issue = async (kind: string, severity: string, summary: string) => {
        const site = await client.query<{ id: string }>(`SELECT id FROM sites WHERE organization_id = $1 ORDER BY created_at LIMIT 1`, [r.organization_id]);
        if (!site.rows[0]) return;
        await client.query(
          `INSERT INTO data_quality_issues (organization_id, site_id, kind, fingerprint, severity, summary, details, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open')
           ON CONFLICT (site_id, fingerprint) DO UPDATE SET last_seen_at = now(), occurrences = data_quality_issues.occurrences + 1, status = 'open'`,
          [r.organization_id, site.rows[0].id, kind, `${kind}:${period}`, severity, summary, JSON.stringify({ period, used, limit, policy })],
        );
      };

      // one inbox entry for the highest newly crossed threshold; lower thresholds are stamped silently
      const warned: Record<(typeof USAGE_WARNING_THRESHOLDS)[number], Date | null> = { 70: r.warned_70_at, 90: r.warned_90_at, 100: r.warned_100_at };
      const crossed = USAGE_WARNING_THRESHOLDS.filter((th) => pct >= th);
      const newest = [...crossed].reverse().find((th) => !warned[th]);
      for (const th of crossed) if (!warned[th]) updates.push(`warned_${th}_at = coalesce(warned_${th}_at, now())`);
      if (newest === 100) {
        updates.push("soft_limit_hit_at = coalesce(soft_limit_hit_at, now())");
        const consequence =
          policy === "allow"
            ? "Additional events are billed as event packs because overage is allowed for this organization."
            : policy === "cost_limit"
              ? "Additional events are billed as event packs up to the configured monthly cost limit."
              : "Processing pauses after the grace window unless the plan is upgraded or overage is allowed in the billing settings.";
        await issue("usage_limit_reached", "critical", `Monthly event limit reached (${usedText} of ${limitText}). ${consequence}`);
      } else if (newest === 90 || newest === 70) {
        await issue(`usage_limit_${newest}`, "warning", `${newest} % of the monthly event limit used (${usedText} of ${limitText}).`);
      }

      // hard limit according to the overage policy the customer chose (never activated without that choice)
      let hardLimit = false;
      if (policy === "allow") {
        hardLimit = false;
      } else if (policy === "cost_limit" && pack && r.usage_cost_limit_cents != null) {
        const costLimit = Number(r.usage_cost_limit_cents);
        const overageEvents = Math.max(0, used - limit);
        const packs = overageEvents > 0 ? Math.ceil(overageEvents / pack.events) : 0;
        hardLimit = packs * pack.priceCents > costLimit;
      } else {
        // pause (also cost_limit without a configured limit or without a pack): grace window above the limit, then pause
        hardLimit = used >= limit * (1 + USAGE_PAUSE_GRACE_PERCENT / 100);
      }
      updates.push(hardLimit ? "hard_limit_hit_at = coalesce(hard_limit_hit_at, now())" : "hard_limit_hit_at = NULL");
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
