/**
 * Constants and codes of the Change & Release Center that both the server module (`releases.ts`,
 * which is `server-only`) and the client components (dialogs, labels) need. No runtime dependency on
 * the database or the session — this file may be imported from Client Components; `releases.ts`
 * re-exports everything here for the server side.
 */

/** minimum lead time of a scheduled publication */
export const SCHEDULE_MIN_LEAD_MINUTES = 5;
/** maximum horizon of a scheduled publication */
export const SCHEDULE_MAX_DAYS = 90;

/** Rule-based signals that make a change critical (four-eyes in production). */
export const CRITICAL_REASONS = ["critical_event", "consent_weaker", "destination_purpose_weaker", "destination_stopped", "marketing_destination_added", "kill_switch", "allowed_hosts_reduced"] as const;
export type CriticalReason = (typeof CRITICAL_REASONS)[number];

export type FourEyesState = "not_required" | "single_publisher" | "satisfied" | "pending" | "stale" | "rejected" | "missing";

/** `schedule_error` codes written by the worker job `scheduled-publish`. */
export const SCHEDULE_ERROR_CODES = ["signing_key_missing", "draft_not_open", "draft_changed", "approval_invalid", "lint_failed", "publish_failed"] as const;
