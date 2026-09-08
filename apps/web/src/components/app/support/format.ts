import { intlLocale } from "@/lib/format";

/** Date + time of messages and events, on top of `lib/format.ts` (which covers dates only). */
export function formatDateTime(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** File sizes of attachments: "512 B", "24.5 kB", "1.2 MB" in the reader's number format. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "kB", "MB", "GB"] as const;
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)} ${units[unit]}`;
}
