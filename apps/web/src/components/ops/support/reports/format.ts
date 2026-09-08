import { formatDate, formatNumber, intlLocale } from "@/lib/format";

/** Count with the locale's grouping. */
export const count = (n: number, locale: string): string => formatNumber(n, locale);

/** Ratio 0–1 as a percentage with at most one decimal; "—" for an unmeasured value. */
export const percent = (ratio: number | null, locale: string): string =>
  ratio === null
    ? "—"
    : formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 1 });

/** Decimal with at most `digits` fraction digits; "—" for an unmeasured value. */
export const decimal = (value: number | null, locale: string, digits = 1): string =>
  value === null ? "—" : formatNumber(value, locale, { maximumFractionDigits: digits });

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
 * Date + time in UTC with the zone spelled out, so operators in different zones read the same instant
 * (explicit components: `timeZoneName` cannot be combined with `dateStyle` / `timeStyle`).
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

const unit = (value: number, unitName: "day" | "hour" | "minute", locale: string): string =>
  new Intl.NumberFormat(intlLocale(locale), {
    style: "unit",
    unit: unitName,
    unitDisplay: "narrow",
    maximumFractionDigits: 0,
  }).format(value);

/**
 * Duration in the two largest units ("2d 4h", "3h 12min", "45min"); anything under a minute reads "< 1min";
 * "—" for an unmeasured value. Units come from `Intl` in the reader's locale.
 */
export function duration(ms: number | null, locale: string): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const totalMinutes = Math.round(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return `< ${unit(1, "minute", locale)}`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1)
    return hours
      ? `${unit(days, "day", locale)} ${unit(hours, "hour", locale)}`
      : unit(days, "day", locale);
  if (hours >= 1)
    return minutes
      ? `${unit(hours, "hour", locale)} ${unit(minutes, "minute", locale)}`
      : unit(hours, "hour", locale);
  return unit(minutes, "minute", locale);
}
