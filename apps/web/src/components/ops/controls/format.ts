import { intlLocale } from "@/lib/format";

/**
 * Date + time in the operator's locale, UTC-labelled where the value is a window boundary (announcements are
 * scheduled in UTC). The UTC form uses explicit components: `timeZoneName` cannot be combined with
 * `dateStyle` / `timeStyle` (Intl throws "Invalid option", which took the announcements list down).
 */
export function formatDateTime(
  iso: string | null | undefined,
  locale: string,
  timeZone?: "UTC",
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = timeZone
    ? {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
      }
    : { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
}

/** ISO → value of a `datetime-local` input in UTC ("2026-09-08T14:30"). */
export function toUtcInputValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}
