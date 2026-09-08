import { formatNumber, intlLocale } from "@/lib/format";

/**
 * Formatting for the platform health page (same BCP 47 mapping as `lib/format.ts`). Every timestamp is
 * rendered in UTC — operators compare heartbeats, queue ages and vendor clocks across regions, so one
 * zone for the whole page beats the server's local zone.
 */

export function fmtDateTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(date);
}

/** Time of day only, with the zone spelled out ("14:03:21 UTC"). */
export function fmtTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: "medium", timeZone: "UTC" }).format(date)} UTC`;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 minutes ago" relative to `now` (ms since epoch) so server and client render the same string. */
export function fmtRelative(iso: string | null, locale: string, now: number): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const diff = at - now;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(Math.round(diff / 1000), "second");
}

function unit(value: number, name: string, locale: string, maximumFractionDigits = 0, unitDisplay: "narrow" | "short" = "narrow"): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: name, unitDisplay, maximumFractionDigits }).format(value);
}

/** "340 ms", "3.4 s", "12 min", "1.5 h", "2.3 d". */
export function fmtDuration(ms: number | null, locale: string): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const v = Math.max(0, ms);
  if (v < 1000) return unit(Math.round(v), "millisecond", locale);
  if (v < 60_000) return unit(v / 1000, "second", locale, 1);
  if (v < 3_600_000) return unit(Math.round(v / 60_000), "minute", locale);
  if (v < 86_400_000) return unit(v / 3_600_000, "hour", locale, 1);
  return unit(v / 86_400_000, "day", locale, 1);
}

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** Binary steps, short unit ("12.3 MB"). */
export function fmtBytes(bytes: number | null, locale: string): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  let value = Math.max(0, bytes);
  let i = 0;
  while (value >= 1024 && i < BYTE_UNITS.length - 1) {
    value /= 1024;
    i += 1;
  }
  return unit(value, BYTE_UNITS[i]!, locale, i === 0 ? 0 : 1, "short");
}

/** `0.125` → "12.5 %". */
export function fmtPercent(rate: number | null, locale: string): string | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

export function fmtCount(value: number, locale: string): string {
  return formatNumber(value, locale);
}
