import { formatNumber, intlLocale } from "@/lib/format";
import type { Tone } from "@track-site/ui";

/** Date and time in the site's time zone (issues and snapshots are timestamps, not calendar dates). */
export function formatDateTime(value: Date | string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone }).format(value instanceof Date ? value : new Date(value));
}

/** `0.2537` → "25.4%" (locale-aware). */
export function formatShare(share: number, locale: string): string {
  return formatNumber(share, locale, { style: "percent", maximumFractionDigits: 1 });
}

export const SEVERITY_TONE: Record<"info" | "warning" | "critical", Tone> = { info: "info", warning: "warn", critical: "bad" };
export const STATUS_TONE: Record<"open" | "acknowledged" | "resolved" | "muted", Tone> = { open: "warn", acknowledged: "info", resolved: "ok", muted: "neutral" };
export const GAP_TONE: Record<"no_consent" | "blocked" | "not_captured" | "delivery_failed" | "unknown", Tone> = { no_consent: "info", blocked: "warn", not_captured: "bad", delivery_failed: "bad", unknown: "neutral" };

/** Leak share → tone: ≥ 30 % bad, ≥ 10 % warn, measured and below ok, no data neutral. */
export function leakTone(share: number | null): "ok" | "warn" | "bad" | "neutral" {
  if (share == null) return "neutral";
  if (share >= 0.3) return "bad";
  if (share >= 0.1) return "warn";
  return "ok";
}
