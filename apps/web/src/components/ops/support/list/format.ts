import { intlLocale } from "@/lib/format";

/** Date + time for queue rows, on top of `lib/format.ts` (which covers dates only). */
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

/** "3 days ago" / "in 2 hours" relative to `now` (ms since epoch), so server and client render the same string. */
export function formatRelative(iso: string | null, locale: string, now: number): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const diff = at - now;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(Math.round(diff / 1000), "second");
}

/** Initials of a display name (two letters), for the assignee and presence avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0]?.slice(0, 2) ?? "?");
  return letters.toUpperCase();
}
