import { intlLocale } from "@/lib/format";

/** Date-time formatting of the Releases module on top of `lib/format.ts` (which covers dates only). */
export function formatDateTime(value: string | Date, locale: string, style: "short" | "long" = "short"): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), style === "long" ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" }).format(date);
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
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), "day");
  return rtf.format(Math.round(diff / (30 * 86_400)), "month");
}

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** One decimal at most, locale separators ("20.5" / "20,5"); the unit sign comes from the message. */
export function formatShare(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value);
}

/** The first 12 hex characters of a digest for display; the full value stays in the title attribute. */
export function shortDigest(digest: string): string {
  return digest.slice(0, 12);
}
