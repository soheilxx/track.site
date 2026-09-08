import type { Tone } from "@track-site/ui";
import type { CollectorState, JobState, OverallState, StripeEventState } from "@/server/ops/health";

/** Semantic tone per state; the text next to it always carries the meaning as well. */
export const OVERALL_TONE: Record<OverallState, Tone> = { ok: "ok", warn: "warn", bad: "bad" };

export const COLLECTOR_TONE: Record<CollectorState, Tone> = {
  ok: "ok",
  degraded: "warn",
  kill_switch: "bad",
  unreachable: "bad",
  timeout: "bad",
  invalid: "warn",
};

export const JOB_TONE: Record<JobState, Tone> = { ok: "ok", failing: "warn", stale: "bad", never: "neutral" };

export const STRIPE_EVENT_TONE: Record<StripeEventState, Tone> = { processed: "ok", failed: "bad", pending: "warn" };

export const SEVERITY_TONE: Record<string, Tone> = { info: "info", warning: "warn", critical: "bad" };

export const INTEGRATION_STATUS_TONE: Record<string, Tone> = {
  connected: "ok",
  paused: "neutral",
  draft: "neutral",
  not_connected: "warn",
  error: "bad",
};

const RANK: Record<Tone, number> = { bad: 0, warn: 1, info: 2, neutral: 3, ok: 4 };

/** The most severe tone of a set (bad > warn > info > neutral > ok). */
export function worstTone(tones: readonly Tone[]): Tone {
  return tones.reduce<Tone>((acc, t) => (RANK[t] < RANK[acc] ? t : acc), "ok");
}
