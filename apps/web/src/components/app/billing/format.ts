import { formatNumber, intlLocale } from "@/lib/format";

/** Count with the locale's grouping ("1,234" / "1.234" / "1 234"). */
export const count = (n: number, locale: string): string => formatNumber(n, locale);

/** Ratio 0–1 as a percentage with at most one decimal ("72.5 %"). */
export const percent = (ratio: number, locale: string): string => formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 1 });

/** Signed ratio as a percentage ("+50 %", "−20 %"). */
export const signedPercent = (ratio: number, locale: string): string => formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** Date + time (medium date, short time) in UTC, like the rest of the dashboard's calendar values. */
export function formatDateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
}

/** Calendar day of an ISO `YYYY-MM-DD` key, short numeric form ("4 Sept"). */
export function formatDayKey(day: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}
