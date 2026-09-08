import { intlLocale } from "@/lib/format";

export { formatDateTime, formatRelative } from "@/components/ops/inbox/format";

/** `5_400_000` → "1 h 30 min" (en) / "1 Std. 30 Min." (de); seconds are dropped, days appear from 24 h. */
export function formatDuration(ms: number, locale: string): string {
  const total = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const tag = intlLocale(locale);
  const unit = (value: number, u: "day" | "hour" | "minute") => new Intl.NumberFormat(tag, { style: "unit", unit: u, unitDisplay: "short" }).format(value);
  const parts: string[] = [];
  if (days) parts.push(unit(days, "day"));
  if (hours) parts.push(unit(hours, "hour"));
  if (minutes || !parts.length) parts.push(unit(minutes, "minute"));
  return parts.slice(0, 2).join(" ");
}

/** `1_536_000` → "1.5 MB"; small files in kB, never a bare byte count above 1 kB. */
export function formatBytes(bytes: number, locale: string): string {
  const tag = intlLocale(locale);
  if (bytes >= 1024 * 1024) return new Intl.NumberFormat(tag, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
  if (bytes >= 1024) return new Intl.NumberFormat(tag, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 }).format(bytes / 1024);
  return new Intl.NumberFormat(tag, { style: "unit", unit: "byte", maximumFractionDigits: 0 }).format(bytes);
}
