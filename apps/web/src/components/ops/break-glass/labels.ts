import { intlLocale } from "@/lib/format";
import type { BreakGlassState } from "@/server/ops/break-glass";

/**
 * Label helpers shared by the server and client components of the Break-glass module. `t` is the
 * `opsBreakGlass` namespace translator; unknown codes fall back to the generic message or the raw value so
 * nothing is ever hidden.
 */
export type TranslateFn = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

/** Action error code → message (unknown codes read as the generic error). */
export function errorLabel(t: TranslateFn, code: string | null | undefined, values?: Record<string, string | number>): string {
  const key = `errors.${code ?? "generic"}`;
  return t.has(key) ? t(key, values) : t("errors.generic");
}

/** Semantic tone of a state; always shown together with its text. */
export const STATE_TONE: Record<BreakGlassState, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  pending: "info",
  stale: "neutral",
  withdrawn: "neutral",
  active: "ok",
  revoked: "warn",
  expired: "neutral",
};

/** Requested window: the catalogued label for the offered durations, otherwise "n min". */
export function durationLabel(t: TranslateFn, minutes: number): string {
  const key = `request.durations.${minutes}`;
  return t.has(key) ? t(key) : t("active.countdown.minutes", { minutes });
}

/**
 * Date + time in the viewer's locale (lib/format.ts covers dates only). Pass next-intl's configured time zone
 * (`useTimeZone()` / `getTimeZone()`) so server and client render the same text.
 */
export function formatDateTime(value: string | Date, locale: string, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

/** "1 h 23 min", "12 min" or "under a minute" for a remaining window. */
export function formatRemaining(t: TranslateFn, ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes <= 0) return t("active.countdown.underMinute");
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? t("active.countdown.hoursMinutes", { hours, minutes }) : t("active.countdown.minutes", { minutes });
}

/** First segment of a grant id for compact labels; the full id stays in the `title`/`<code>` next to it. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
