import type { WorkerContext } from "../context.ts";

/**
 * Destination health snapshots (Destination Health Center, migration 0008). Every run measures each
 * non-draft destination from data only the worker can see in full — delivery attempts across the
 * window, the per-destination backlog in `queue_messages` (ready, scheduled retries, in flight, oldest
 * message) and the unreplayed `queue_dead_letters` — and upserts one row per integration into
 * `destination_health_snapshots`. The dashboard reads the rows under RLS and treats a missing row as
 * "not measured" and an old row as stale, so the job never has to be up for the page to be honest.
 *
 * Idempotent and safe to run on several workers (set-based upsert in one statement). Not registered
 * in `jobs/index.ts` yet — the integration stage wires it with `every(DESTINATION_HEALTH_INTERVAL_MS, …)`.
 */
export const DESTINATION_HEALTH_INTERVAL_MS = 60_000;
export const DESTINATION_HEALTH_WINDOW_MINUTES = 24 * 60;

const SNAPSHOT_SQL = `
WITH att AS (
  SELECT integration_id,
         count(*)::int AS total,
         count(*) FILTER (WHERE status = 'success')::int AS success,
         count(*) FILTER (WHERE status IN ('failed', 'dead'))::int AS failed,
         count(*) FILTER (WHERE status = 'retry')::int AS retry,
         count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
         count(*) FILTER (WHERE error_class = 'rate_limited')::int AS rate_limited,
         count(*) FILTER (WHERE error_class IN ('auth', 'credential_expired'))::int AS auth_failed,
         max(started_at) FILTER (WHERE status IN ('failed', 'dead', 'retry')) AS last_failure_at
  FROM delivery_attempts
  WHERE started_at >= now() - make_interval(mins => $1::int)
  GROUP BY integration_id
),
last_err AS (
  SELECT DISTINCT ON (integration_id) integration_id, error_class, error_code, error_message, http_status
  FROM delivery_attempts
  WHERE status IN ('failed', 'dead', 'retry') AND started_at >= now() - make_interval(mins => $1::int)
  ORDER BY integration_id, started_at DESC
),
rl AS (
  SELECT DISTINCT ON (integration_id) integration_id, started_at, next_retry_at
  FROM delivery_attempts
  WHERE error_class = 'rate_limited' AND started_at >= now() - make_interval(mins => $1::int)
  ORDER BY integration_id, started_at DESC
),
q AS (
  SELECT body->>'integration_id' AS integration_id,
         count(*) FILTER (WHERE available_at <= now() AND (locked_until IS NULL OR locked_until < now()))::int AS ready,
         count(*) FILTER (WHERE available_at > now())::int AS scheduled,
         count(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until >= now())::int AS in_flight,
         min(available_at) AS oldest_available_at
  FROM queue_messages
  WHERE queue LIKE 'dest.%' AND body ? 'integration_id'
  GROUP BY 1
),
dl AS (
  SELECT body->>'integration_id' AS integration_id, count(*)::int AS dead
  FROM queue_dead_letters
  WHERE queue LIKE 'dest.%' AND replayed_at IS NULL AND body ? 'integration_id'
  GROUP BY 1
)
INSERT INTO destination_health_snapshots (
  organization_id, site_id, integration_id, computed_at, window_minutes,
  attempts_total, attempts_success, attempts_failed, attempts_retry, attempts_skipped, attempts_rate_limited, attempts_auth_failed, error_rate,
  queue_ready, queue_scheduled, queue_in_flight, queue_oldest_available_at, queue_dead,
  last_success_at, last_failure_at, last_error_class, last_error_code, last_error_message, last_error_http_status,
  last_rate_limit_at, last_rate_limit_wait_ms
)
SELECT i.organization_id, i.site_id, i.id, now(), $1::int,
       coalesce(a.total, 0), coalesce(a.success, 0), coalesce(a.failed, 0), coalesce(a.retry, 0), coalesce(a.skipped, 0), coalesce(a.rate_limited, 0), coalesce(a.auth_failed, 0),
       CASE WHEN coalesce(a.success, 0) + coalesce(a.failed, 0) + coalesce(a.retry, 0) > 0
            THEN (coalesce(a.failed, 0) + coalesce(a.retry, 0))::double precision / (coalesce(a.success, 0) + coalesce(a.failed, 0) + coalesce(a.retry, 0))
            ELSE NULL END,
       coalesce(q.ready, 0), coalesce(q.scheduled, 0), coalesce(q.in_flight, 0), q.oldest_available_at, coalesce(d.dead, 0),
       s.last_success_at, a.last_failure_at, e.error_class::text, e.error_code, e.error_message, e.http_status,
       r.started_at,
       CASE WHEN r.next_retry_at IS NOT NULL THEN greatest(0, (extract(epoch FROM (r.next_retry_at - r.started_at)) * 1000))::int ELSE NULL END
FROM integrations i
LEFT JOIN att a ON a.integration_id = i.id
LEFT JOIN LATERAL (
  SELECT max(x.started_at) AS last_success_at
  FROM delivery_attempts x
  WHERE x.integration_id = i.id AND x.status = 'success' AND x.started_at >= now() - interval '90 days'
) s ON true
LEFT JOIN last_err e ON e.integration_id = i.id
LEFT JOIN rl r ON r.integration_id = i.id
LEFT JOIN q ON q.integration_id = i.id::text
LEFT JOIN dl d ON d.integration_id = i.id::text
WHERE i.status <> 'draft'
ON CONFLICT (integration_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  site_id = EXCLUDED.site_id,
  computed_at = EXCLUDED.computed_at,
  window_minutes = EXCLUDED.window_minutes,
  attempts_total = EXCLUDED.attempts_total,
  attempts_success = EXCLUDED.attempts_success,
  attempts_failed = EXCLUDED.attempts_failed,
  attempts_retry = EXCLUDED.attempts_retry,
  attempts_skipped = EXCLUDED.attempts_skipped,
  attempts_rate_limited = EXCLUDED.attempts_rate_limited,
  attempts_auth_failed = EXCLUDED.attempts_auth_failed,
  error_rate = EXCLUDED.error_rate,
  queue_ready = EXCLUDED.queue_ready,
  queue_scheduled = EXCLUDED.queue_scheduled,
  queue_in_flight = EXCLUDED.queue_in_flight,
  queue_oldest_available_at = EXCLUDED.queue_oldest_available_at,
  queue_dead = EXCLUDED.queue_dead,
  last_success_at = EXCLUDED.last_success_at,
  last_failure_at = EXCLUDED.last_failure_at,
  last_error_class = EXCLUDED.last_error_class,
  last_error_code = EXCLUDED.last_error_code,
  last_error_message = EXCLUDED.last_error_message,
  last_error_http_status = EXCLUDED.last_error_http_status,
  last_rate_limit_at = EXCLUDED.last_rate_limit_at,
  last_rate_limit_wait_ms = EXCLUDED.last_rate_limit_wait_ms
RETURNING integration_id`;

/** Measures every non-draft destination and upserts its snapshot; returns how many rows were written. */
export async function snapshotDestinationHealth(ctx: WorkerContext, windowMinutes = DESTINATION_HEALTH_WINDOW_MINUTES): Promise<{ integrations: number }> {
  const client = await ctx.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    const res = await client.query<{ integration_id: string }>(SNAPSHOT_SQL, [windowMinutes]);
    await client.query("COMMIT");
    const integrations = res.rowCount ?? 0;
    ctx.logger.debug({ integrations, windowMinutes }, "destination health snapshot written");
    return { integrations };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
