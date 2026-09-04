import { formatNumber, intlLocale } from "@/lib/format";

/** Date-time formatting of the Events module on top of `lib/format.ts` (which covers dates only). */
export function formatDateTime(value: string | Date, locale: string, style: "short" | "long" = "short"): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), style === "long" ? { dateStyle: "medium", timeStyle: "medium" } : { dateStyle: "short", timeStyle: "medium" }).format(date);
}

export function formatTime(value: string | Date, locale: string, withMillis = false): string {
  const date = value instanceof Date ? value : new Date(value);
  const base = new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: "medium" }).format(date);
  return withMillis ? `${base}.${String(date.getMilliseconds()).padStart(3, "0")}` : base;
}

/** "3 minutes ago" / "in 2 hours" relative to `now`. */
export function formatRelative(value: string | Date, locale: string, now: number = Date.now()): string {
  const date = value instanceof Date ? value : new Date(value);
  const diff = (date.getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86_400), "day");
}

export function formatCount(value: number, locale: string): string {
  return formatNumber(value, locale);
}
