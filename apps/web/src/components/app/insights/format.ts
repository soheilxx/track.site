import { formatNumber, intlLocale } from "@/lib/format";

/** Count with the locale's grouping ("1,234" / "1.234" / "1 234"). */
export const count = (n: number, locale: string): string => formatNumber(n, locale);

/** Ratio 0–1 as a percentage with at most one decimal ("12.5 %"). */
export const percent = (ratio: number, locale: string): string =>
  formatNumber(ratio, locale, { style: "percent", maximumFractionDigits: 1 });

/** Date + time in the viewer's locale (medium date, short time), in UTC like the rest of the dashboard's calendar values. */
export function formatDateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

/** Hours with one decimal, or whole days once a span exceeds two days ("1.5 h", "3 d"). */
export function formatSpan(
  hours: number,
  locale: string,
  units: { hours: string; days: string },
): string {
  if (hours >= 48) return `${formatNumber(Math.round(hours / 24), locale)} ${units.days}`;
  return `${formatNumber(hours, locale, { maximumFractionDigits: 1 })} ${units.hours}`;
}

/** Calendar day of an ISO `YYYY-MM-DD` key, short numeric form ("4 Sept"). */
export function formatDayKey(day: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
