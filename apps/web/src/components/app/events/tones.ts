import type { Tone } from "@track-site/ui";
import type { CellStatus, StepTone } from "@/server/events-lineage";

/** Client-safe tone maps (the server helpers import node-only packages). */
export const CELL_TONE: Record<CellStatus, Tone> = { ok: "ok", warn: "warn", bad: "bad", info: "info", none: "neutral", unknown: "neutral" };
export const STEP_TONE: Record<StepTone, Tone> = { ok: "ok", warn: "warn", bad: "bad", info: "info", neutral: "neutral" };

export const STATE_TONE: Record<string, Tone> = { policy_passed: "neutral", routed: "info", delivered: "ok", deduplicated: "warn", rejected: "bad", policy_blocked: "bad", captured: "neutral", accepted: "neutral", normalized: "neutral", imported: "neutral" };
