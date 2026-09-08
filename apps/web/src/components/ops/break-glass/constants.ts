/**
 * Limits of a break-glass request (docs/17 §4), shared by the request form (client) and the server module
 * `@/server/ops/break-glass` (which re-exports them). No imports: this file is safe in either bundle.
 */
export const BREAK_GLASS_DURATIONS = [15, 30, 60, 120, 240] as const;
export type BreakGlassDuration = (typeof BREAK_GLASS_DURATIONS)[number];
export const BREAK_GLASS_MIN_MINUTES = 15;
export const BREAK_GLASS_MAX_MINUTES = 240;
export const BREAK_GLASS_REASON_MIN = 20;
export const BREAK_GLASS_REASON_MAX = 1000;
export const BREAK_GLASS_TICKET_MAX = 100;
/** ticket references are short identifiers (`SUP-1234`, `#4711`, `INC 2026-09-08/3`) */
export const BREAK_GLASS_TICKET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _#:./-]{0,99}$/;
