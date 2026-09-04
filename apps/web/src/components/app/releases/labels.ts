import type { Tone } from "@track-site/ui";
import type { ReleaseActionError } from "@/server/actions/releases";
import { CRITICAL_REASONS, SCHEDULE_ERROR_CODES, SCHEDULE_MAX_DAYS, SCHEDULE_MIN_LEAD_MINUTES } from "@/server/release-rules";
import type { ReadableChange } from "@/server/releases";

/**
 * Label helpers shared by the server and client components of the module. `t` is the `releases`
 * namespace translator (from `getTranslations` or `useTranslations`); unknown codes fall back to the
 * raw value so nothing is ever hidden.
 */
export type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

const KNOWN_ERRORS: ReadonlySet<string> = new Set<ReleaseActionError>([
  "generic",
  "invalid",
  "forbidden",
  "not_found",
  "not_open",
  "lint",
  "approval_required",
  "approval_pending",
  "approval_rejected",
  "acknowledge_required",
  "self_approval",
  "stale",
  "reason_required",
  "signing",
  "schedule_invalid",
  "schedule_too_soon",
  "schedule_too_far",
  "already_active",
]);

/** Maps an action error code to its message; unknown codes read as the generic error. */
export function errorLabel(t: TranslateFn, code: string | null | undefined): string {
  return t(`errors.${code && KNOWN_ERRORS.has(code) ? code : "generic"}`, { min: SCHEDULE_MIN_LEAD_MINUTES, max: SCHEDULE_MAX_DAYS });
}

const KNOWN_REASONS: ReadonlySet<string> = new Set(CRITICAL_REASONS);

export function criticalReasonLabel(t: TranslateFn, code: string): string {
  return KNOWN_REASONS.has(code) ? t(`fourEyes.reasons.${code}`) : code;
}

const SCHEDULE_ERRORS: ReadonlySet<string> = new Set(SCHEDULE_ERROR_CODES);

export function scheduleErrorLabel(t: TranslateFn, code: string): string {
  return SCHEDULE_ERRORS.has(code) ? t(`draft.schedule.reasons.${code}`) : code;
}

export const ENVIRONMENT_TONE: Record<"production" | "staging" | "development", Tone> = { production: "ok", staging: "warn", development: "info" };

export const DECISION_TONE: Record<"pending" | "approved" | "rejected" | "withdrawn", Tone> = { pending: "info", approved: "ok", rejected: "bad", withdrawn: "neutral" };

export const CHANGE_TONE: Record<"added" | "removed" | "enabled" | "disabled" | "changed", Tone> = { added: "info", removed: "bad", enabled: "ok", disabled: "warn", changed: "info" };

export const OP_TONE: Record<ReadableChange["op"], Tone> = { add: "info", remove: "bad", change: "neutral" };

/** A diff value as text: scalars as they are, objects as compact JSON (truncated), nothing as the localized "none". */
export function changeValue(t: TranslateFn, value: unknown): string {
  if (value === null || value === undefined) return t("changes.none");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const json = JSON.stringify(value);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}

/** Subject of a change: the destination name (or id) / event name, plus the field below it. */
export function changeSubject(t: TranslateFn, change: ReadableChange, destinationNames: Record<string, string>): { subject: string | null; field: string | null } {
  if (change.area === "destinations" && change.key) return { subject: destinationNames[change.key] ?? t("changes.unknownDestination", { id: change.key.slice(0, 8) }), field: change.field };
  if (change.area === "events" && change.key) return { subject: change.key, field: change.field };
  return { subject: null, field: change.field ?? change.path };
}

const TEST_LAB_JOURNEYS = new Set(["page_view", "lead", "add_to_cart", "checkout", "purchase"]);
const TEST_LAB_STATUSES = new Set(["pending", "sent", "rejected", "failed"]);

export function journeyLabel(t: TranslateFn, journey: string): string {
  return TEST_LAB_JOURNEYS.has(journey) ? t(`testLab.journey.${journey}`) : journey;
}

export function runStatusLabel(t: TranslateFn, status: string): string {
  return TEST_LAB_STATUSES.has(status) ? t(`testLab.status.${status}`) : status;
}

export const RUN_STATUS_TONE: Record<string, Tone> = { pending: "info", sent: "ok", rejected: "bad", failed: "bad" };
