import type { WorkerContext } from "../context.ts";
import { relayOutbox } from "./outbox.ts";
import { ensureEventPartitions, runRetention } from "./retention.ts";
import { checkUsageLimits } from "./usage.ts";

export interface JobsHandle {
  stop(): void;
}

/** Lightweight in-process scheduler; every job is idempotent and safe to run on several workers. */
export function runScheduledJobs(ctx: WorkerContext): JobsHandle {
  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    const tick = async () => {
      try {
        await fn();
      } catch (e) {
        ctx.logger.error({ job: name, err: e instanceof Error ? e.message : String(e) }, "job failed");
      }
    };
    void tick();
    const t = setInterval(() => void tick(), ms);
    t.unref();
    timers.push(t);
  };
  every(5_000, "outbox", () => relayOutbox(ctx));
  every(60_000, "usage", () => checkUsageLimits(ctx));
  every(6 * 60 * 60_000, "partitions", () => ensureEventPartitions(ctx));
  every(24 * 60 * 60_000, "retention", () => runRetention(ctx));
  return { stop: () => timers.forEach((t) => clearInterval(t)) };
}
