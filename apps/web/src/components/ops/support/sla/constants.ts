/**
 * Client-safe constants of the SLA policy editor (docs/18 §"SLA engine"). The server engine
 * (`apps/web/src/server/support/sla.ts`) imports them from here so client components never pull a
 * server module by value (docs/17 §"Client bundles"); the worker job carries its own mirror.
 */
export const SLA_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type SlaWeekday = (typeof SLA_WEEKDAYS)[number];

export const SLA_CLOCKS = ["first_response", "resolution"] as const;
export type SlaClock = (typeof SLA_CLOCKS)[number];

/** Units of the target inputs; a "day" is 24 hours of business time (the seed's "7 d" = 10 080 minutes). */
export const SLA_TARGET_UNITS = ["minutes", "hours", "days"] as const;
export type SlaTargetUnit = (typeof SLA_TARGET_UNITS)[number];
export const SLA_UNIT_MINUTES: Record<SlaTargetUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** Target bounds in business minutes: 5 minutes … 90 days. */
export const SLA_TARGET_MIN_MINUTES = 5;
export const SLA_TARGET_MAX_MINUTES = 90 * 1440;

export const SLA_WARNING_PERCENT_DEFAULT = 80;
export const SLA_WARNING_PERCENT_MIN = 1;
export const SLA_WARNING_PERCENT_MAX = 99;

/** Solved tickets close automatically after this many days unless the policy says otherwise (null = never). */
export const SLA_AUTO_CLOSE_DAYS_DEFAULT = 7;
export const SLA_AUTO_CLOSE_DAYS_MAX = 365;

export const SLA_NAME_MAX = 80;
export const SLA_DESCRIPTION_MAX = 500;
export const SLA_TIMEZONE_DEFAULT = "Europe/Berlin";

/** Time zones offered by the editor's datalist; any zone `Intl` knows is accepted. */
export const SLA_TIMEZONE_SUGGESTIONS = [
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Dublin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export const SLA_PATHS = {
  settings: "/ops/support/settings",
  list: "/ops/support/settings/sla",
  create: "/ops/support/settings/sla/new",
  edit: (id: string) => `/ops/support/settings/sla/${encodeURIComponent(id)}`,
} as const;
