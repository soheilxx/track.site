/**
 * Limits and enumerations of the support reports (docs/18 §"Reports"), shared by the client components and the
 * server module `@/server/support/reports` (which re-exports them). No imports: this file is safe in either
 * bundle (docs/17 §"Client bundles").
 */

/** quick ranges offered above the report, in calendar days ending today (UTC) */
export const REPORT_PRESET_DAYS = [7, 30, 90] as const;
export const REPORT_DEFAULT_DAYS = 30;
export const REPORT_RANGE_MAX_DAYS = 365;

export const REPORT_BUCKETS = ["day", "week"] as const;
export type ReportBucket = (typeof REPORT_BUCKETS)[number];
/** ranges longer than this many days are bucketed by ISO week unless the URL says otherwise */
export const REPORT_WEEKLY_FROM_DAYS = 60;

/** tickets of the range loaded for the per-ticket figures (times, SLA, satisfaction, categories, tags) */
export const REPORT_MAX_TICKETS = 20_000;
/** below this many tickets in the range, medians, rates and shares are shown but flagged */
export const SMALL_SAMPLE_TICKETS = 20;
/** a 90th percentile is only shown from this many measured tickets on */
export const MIN_P90_SAMPLE = 10;
export const REPORT_TOP_LIMIT = 10;

export const REPORT_EXPORT_KINDS = [
  "summary",
  "volume",
  "backlog",
  "times",
  "sla",
  "agents",
  "csat",
  "categories",
  "tags",
  "organisations",
] as const;
export type ReportExportKind = (typeof REPORT_EXPORT_KINDS)[number];

/** workflow statuses that count as open backlog */
export const OPEN_TICKET_STATUSES = ["new", "open", "pending", "on_hold"] as const;

export const CSAT_SCORES = [1, 2, 3, 4, 5] as const;
export type CsatScore = (typeof CSAT_SCORES)[number];

/** Mirrors of the `@track-site/db` enumerations for client bundles (the unit test guards against drift). */
export const REPORT_CHANNELS = ["email", "form", "dashboard", "api", "agent"] as const;
export const REPORT_STATUSES = [
  "new",
  "open",
  "pending",
  "on_hold",
  "solved",
  "closed",
  "spam",
] as const;
export const REPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
