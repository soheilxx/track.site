import { hostname } from "node:os";
import type { PoolClient } from "pg";
import type { WorkerContext } from "../context.ts";
import { ALERTS_INTERVAL_MS, runAlerts } from "./alerts.ts";
import { DESTINATION_HEALTH_INTERVAL_MS, snapshotDestinationHealth } from "./destination-health.ts";
import { relayOutbox } from "./outbox.ts";
import { DATA_QUALITY_INTERVAL_MS, runDataQualityJobs } from "./reconciliation.ts";
import { ensureEventPartitions, runRetention } from "./retention.ts";
import { SCHEDULED_PUBLISH_INTERVAL_MS, runScheduledPublications } from "./scheduled-publish.ts";
import { SUPPORT_SLA_INTERVAL_MS, runSupportSla } from "./support-sla.ts";
import { checkUsageLimits } from "./usage.ts";

/** Last known state of one scheduled job, reported by the worker health endpoint. */
export interface JobStatus {
  name: string;
  intervalMs: number;
  runs: number;
  failures: number;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

export interface JobsHandle {
  stop(): void;
  /** snapshot of every registered job (name, interval, last run, last error) */
  status(): JobStatus[];
}

/**
 * Scheduled jobs and their intervals (docs/07 "Worker jobs"). Every job is idempotent and safe to run on
 * several workers; inside one process a tick is skipped while the previous run of the same job is still
 * going, so a slow scan never piles up.
 */
export const JOB_SCHEDULE: ReadonlyArray<{
  name: string;
  intervalMs: number;
  run: (ctx: WorkerContext) => Promise<unknown>;
}> = [
  { name: "outbox", intervalMs: 5_000, run: (ctx) => relayOutbox(ctx) },
  { name: "usage", intervalMs: 60_000, run: (ctx) => checkUsageLimits(ctx) },
  { name: "partitions", intervalMs: 6 * 60 * 60_000, run: (ctx) => ensureEventPartitions(ctx) },
  { name: "retention", intervalMs: 24 * 60 * 60_000, run: (ctx) => runRetention(ctx) },
  // Destination Health Center: per-destination attempt counters + queue backlog snapshot (migration 0008).
  {
    name: "destination-health",
    intervalMs: DESTINATION_HEALTH_INTERVAL_MS,
    run: (ctx) => snapshotDestinationHealth(ctx),
  },
  // Signal Gap & Revenue Leak Detector + Data Quality Inbox scan (migration 0009).
  {
    name: "data-quality",
    intervalMs: DATA_QUALITY_INTERVAL_MS,
    run: (ctx) => runDataQualityJobs(ctx),
  },
  // Change & Release Center: publishes drafts whose scheduled time is due (migration 0010).
  {
    name: "scheduled-publish",
    intervalMs: SCHEDULED_PUBLISH_INTERVAL_MS,
    run: (ctx) => runScheduledPublications(ctx),
  },
  // Alerts & Incident Mode: evaluates alert rules against aggregates, health snapshots and credentials, notifies channels (migration 0013).
  { name: "alerts", intervalMs: ALERTS_INTERVAL_MS, run: (ctx) => runAlerts(ctx) },
  // Support desk: SLA warnings, breaches and auto-close from real timestamps (migration 0015, docs/18).
  { name: "support-sla", intervalMs: SUPPORT_SLA_INTERVAL_MS, run: (ctx) => runSupportSla(ctx) },
];

/** Longest `last_error` stored per heartbeat (the log keeps the full message). */
const HEARTBEAT_ERROR_MAX = 1000;
const HOST = hostname();

/**
 * Heartbeat of one run for the Track Operations console (`worker_heartbeats`, migration 0014): upsert as
 * `tracksite_worker` with the finish time, the duration and the error; `last_ok_at` only moves on success.
 * Never throws — a heartbeat that cannot be written (database unreachable, migration not applied yet) is
 * logged once per job at warn level and then at debug, so the scheduler itself is unaffected.
 */
const heartbeatWarned = new Set<string>();
async function recordHeartbeat(
  ctx: WorkerContext,
  job: string,
  ok: boolean,
  error: string | null,
  durationMs: number,
): Promise<void> {
  const failed = (e: unknown) => {
    const err = e instanceof Error ? e.message : String(e);
    if (heartbeatWarned.has(job)) ctx.logger.debug({ job, err }, "heartbeat not recorded");
    else {
      heartbeatWarned.add(job);
      ctx.logger.warn({ job, err }, "heartbeat not recorded");
    }
  };
  let client: PoolClient;
  try {
    client = await ctx.pool.connect();
  } catch (e) {
    failed(e);
    return;
  }
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE tracksite_worker");
    await client.query(
      `INSERT INTO worker_heartbeats (job, last_run_at, last_ok_at, last_error, last_duration_ms, host)
       VALUES ($1, now(), CASE WHEN $2::boolean THEN now() ELSE NULL END, $3, $4, $5)
       ON CONFLICT (job) DO UPDATE SET
         last_run_at = EXCLUDED.last_run_at,
         last_ok_at = COALESCE(EXCLUDED.last_ok_at, worker_heartbeats.last_ok_at),
         last_error = EXCLUDED.last_error,
         last_duration_ms = EXCLUDED.last_duration_ms,
         host = EXCLUDED.host`,
      [
        job,
        ok,
        error ? error.slice(0, HEARTBEAT_ERROR_MAX) : null,
        Math.max(0, Math.round(durationMs)),
        HOST,
      ],
    );
    await client.query("COMMIT");
    heartbeatWarned.delete(job);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    failed(e);
  } finally {
    client.release();
  }
}

/** Lightweight in-process scheduler over `JOB_SCHEDULE`; the first tick of every job runs immediately. */
export function runScheduledJobs(ctx: WorkerContext): JobsHandle {
  const timers: NodeJS.Timeout[] = [];
  const statuses: JobStatus[] = [];
  for (const job of JOB_SCHEDULE) {
    const status: JobStatus = {
      name: job.name,
      intervalMs: job.intervalMs,
      runs: 0,
      failures: 0,
      running: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastError: null,
    };
    statuses.push(status);
    const tick = async () => {
      if (status.running) {
        ctx.logger.warn({ job: job.name }, "job still running, tick skipped");
        return;
      }
      status.running = true;
      const started = Date.now();
      status.lastStartedAt = new Date(started).toISOString();
      let ok = false;
      try {
        await job.run(ctx);
        status.lastError = null;
        ok = true;
      } catch (e) {
        status.failures += 1;
        status.lastError = e instanceof Error ? e.message : String(e);
        ctx.logger.error({ job: job.name, err: status.lastError }, "job failed");
      } finally {
        status.runs += 1;
        status.running = false;
        status.lastDurationMs = Date.now() - started;
        status.lastFinishedAt = new Date().toISOString();
      }
      // after the in-process status so the health endpoint never waits on the database
      await recordHeartbeat(ctx, job.name, ok, status.lastError, status.lastDurationMs);
    };
    void tick();
    const t = setInterval(() => void tick(), job.intervalMs);
    t.unref();
    timers.push(t);
  }
  return {
    stop: () => timers.forEach((t) => clearInterval(t)),
    status: () => statuses.map((s) => ({ ...s })),
  };
}
