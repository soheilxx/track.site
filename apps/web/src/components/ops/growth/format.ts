import { formatDate, formatNumber, intlLocale } from "@/lib/format";

/** Count with the locale's grouping. */
export const count = (n: number, locale: string): string => formatNumber(n, locale);

/** Ratio 0–1 as a percentage with at most one decimal; "—" for an unmeasured value. */
export const percent = (ratio: number | null, locale: string): string =>
  ratio === null
    ? "—"
    : formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 1 });

/** Whole or fractional days ("1.5 d"); "—" when nobody reached the milestone. */
export function daysValue(days: number | null, locale: string): string {
  if (days === null) return "—";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "unit",
    unit: "day",
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(days);
}

/** Calendar date of a `YYYY-MM-DD` key, numeric form, UTC. */
export const day = (key: string, locale: string): string =>
  formatDate(`${key}T00:00:00Z`, locale, "short");

/** Short axis label of a `YYYY-MM-DD` key ("8 Sep"). */
export function shortDay(key: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
}

/**
 * Date + time in UTC with the zone spelled out, so operators in different zones read the same instant.
 * Explicit components: `timeZoneName` cannot be combined with `dateStyle` / `timeStyle` (Intl throws
 * "Invalid option", which took the Growth page and the Overview down).
 */
export function dateTime(value: Date | string, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

/** Signed change between two counts ("+3", "−2", "±0"). */
export function signedDelta(current: number, previous: number, locale: string): string {
  const delta = current - previous;
  if (delta === 0) return "±0";
  return formatNumber(delta, locale, { signDisplay: "always" });
}
