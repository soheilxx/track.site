import { intlLocale } from "@/lib/format";

/** Date + time for audit entries and requests, on top of `lib/format.ts` (which covers dates only). */
export function formatDateTime(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}
