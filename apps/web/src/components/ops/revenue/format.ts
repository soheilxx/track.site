import { formatCents, formatDate, formatNumber, intlLocale } from "@/lib/format";

/** Amount in cents (integer or fractional, e.g. a twelfth of a yearly price) → "€1,583.33" / "1.583,33 €". */
export const money = (cents: number, locale: string): string =>
  formatCents(cents, locale, { maximumFractionDigits: 2 });

/** Count with the locale's grouping. */
export const count = (n: number, locale: string): string => formatNumber(n, locale);

/** Ratio 0–1 as a percentage with at most one decimal. */
export const percent = (ratio: number, locale: string): string =>
  formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 1 });

/** Calendar date, numeric form, UTC (like the rest of the dashboard's calendar values). */
export const day = (value: Date, locale: string): string => formatDate(value, locale, "short");

/**
 * Date + time in UTC with the zone spelled out, so operators in different zones read the same instant.
 * Explicit components: `timeZoneName` cannot be combined with `dateStyle` / `timeStyle` (Intl throws
 * "Invalid option", which took the Revenue page down).
 */
export function dateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

/** Whole days between two instants (positive when `to` is later). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
