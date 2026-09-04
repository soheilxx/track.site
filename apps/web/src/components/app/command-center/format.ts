import { intlLocale } from "@/lib/format";

/**
 * Time and quantity formatting for the Command Center on top of `lib/format.ts` (one BCP 47 tag per
 * app locale). Measurements are stamped in UTC and rendered in the site's time zone; an unknown
 * zone falls back to UTC instead of throwing.
 */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** "4 Sept 2026, 12:00" */
export function formatDateTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

/** "12:00" */
export function formatTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: "short", timeZone }).format(new Date(iso));
}

/** "13:00" hour label of a bucket */
export function formatHour(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** "4 Sept" for a `YYYY-MM-DD` UTC day */
export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "5 minutes ago" / "in 2 days" relative to `now` */
export function formatRelative(iso: string, now: Date, locale: string): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (abs < 45) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86_400), "day");
}

/** `12.34` (percent) → "12.3%" (en) / "12,3 %" (de) */
export function formatPercent(pct: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 }).format(pct / 100);
}

/** Seconds → "42s", "5 min", "2 h" in the locale's narrow unit form */
export function formatDuration(seconds: number, locale: string): string {
  const unit = (value: number, u: "second" | "minute" | "hour") => new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: u, unitDisplay: "narrow", maximumFractionDigits: 0 }).format(value);
  if (seconds < 90) return unit(seconds, "second");
  if (seconds < 5400) return unit(seconds / 60, "minute");
  return unit(seconds / 3600, "hour");
}
