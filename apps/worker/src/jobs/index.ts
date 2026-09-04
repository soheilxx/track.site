import type { WorkerContext } from "../context.ts";
import { DESTINATION_HEALTH_INTERVAL_MS, snapshotDestinationHealth } from "./destination-health.ts";
import { relayOutbox } from "./outbox.ts";
import { DATA_QUALITY_INTERVAL_MS, runDataQualityJobs } from "./reconciliation.ts";
import { ensureEventPartitions, runRetention } from "./retention.ts";
import { SCHEDULED_PUBLISH_INTERVAL_MS, runScheduledPublications } from "./scheduled-publish.ts";
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
export const JOB_SCHEDULE: ReadonlyArray<{ name: string; intervalMs: number; run: (ctx: WorkerContext) => Promise<unknown> }> = [
  { name: "outbox", intervalMs: 5_000, run: (ctx) => relayOutbox(ctx) },
  { name: "usage", intervalMs: 60_000, run: (ctx) => checkUsageLimits(ctx) },
  { name: "partitions", intervalMs: 6 * 60 * 60_000, run: (ctx) => ensureEventPartitions(ctx) },
  { name: "retention", intervalMs: 24 * 60 * 60_000, run: (ctx) => runRetention(ctx) },
  // Destination Health Center: per-destination attempt counters + queue backlog snapshot (migration 0008).
  { name: "destination-health", intervalMs: DESTINATION_HEALTH_INTERVAL_MS, run: (ctx) => snapshotDestinationHealth(ctx) },
  // Signal Gap & Revenue Leak Detector + Data Quality Inbox scan (migration 0009).
  { name: "data-quality", intervalMs: DATA_QUALITY_INTERVAL_MS, run: (ctx) => runDataQualityJobs(ctx) },
  // Change & Release Center: publishes drafts whose scheduled time is due (migration 0010).
  { name: "scheduled-publish", intervalMs: SCHEDULED_PUBLISH_INTERVAL_MS, run: (ctx) => runScheduledPublications(ctx) },
];

/** Lightweight in-process scheduler over `JOB_SCHEDULE`; the first tick of every job runs immediately. */
export function runScheduledJobs(ctx: WorkerContext): JobsHandle {
  const timers: NodeJS.Timeout[] = [];
  const statuses: JobStatus[] = [];
  for (const job of JOB_SCHEDULE) {
    const status: JobStatus = { name: job.name, intervalMs: job.intervalMs, runs: 0, failures: 0, running: false, lastStartedAt: null, lastFinishedAt: null, lastDurationMs: null, lastError: null };
    statuses.push(status);
    const tick = async () => {
      if (status.running) {
        ctx.logger.warn({ job: job.name }, "job still running, tick skipped");
        return;
      }
      status.running = true;
      const started = Date.now();
      status.lastStartedAt = new Date(started).toISOString();
      try {
        await job.run(ctx);
        status.lastError = null;
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
