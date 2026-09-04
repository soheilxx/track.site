import { formatDate, formatNumber, intlLocale } from "@/lib/format";

/**
 * Locale-aware time formatting for the Destination Health Center on top of `lib/format.ts`
 * (same BCP 47 mapping). `now` is the page's `generatedAt`, so server and client render the same
 * relative strings (no hydration mismatch, no ticking clock).
 */
export function formatDateTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 days ago" / "in 2 hours" relative to `now` (ms since epoch). */
export function formatRelative(iso: string | null, locale: string, now: number): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const diff = at - now;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(Math.round(diff / 1000), "second");
}

/** Compact duration: "45 sec", "12 min", "3.5 hr", "2 days". */
export function formatDuration(ms: number, locale: string): string {
  const unit = (value: number, u: string, digits = 0) => new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: u, unitDisplay: "short", maximumFractionDigits: digits }).format(value);
  if (ms < 60_000) return unit(ms / 1000, "second");
  if (ms < 3_600_000) return unit(ms / 60_000, "minute");
  if (ms < 86_400_000) return unit(ms / 3_600_000, "hour", 1);
  return unit(ms / 86_400_000, "day", 1);
}

export function formatPercent(rate: number, locale: string): string {
  return formatNumber(rate, locale, { style: "percent", maximumFractionDigits: 1 });
}

export function formatCount(value: number, locale: string): string {
  return formatNumber(value, locale);
}

/** Calendar date of a date-only ISO string ("2026-09-02") via `lib/format.ts`; unparseable values are shown as given. */
export function formatIsoDate(value: string, locale: string): string {
  return Number.isNaN(new Date(value).getTime()) ? value : formatDate(value, locale);
}
