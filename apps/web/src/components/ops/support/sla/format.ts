import type { SupportBusinessHours } from "@track-site/db";
import { intlLocale } from "@/lib/format";
import { SLA_WEEKDAYS, type SlaWeekday } from "./constants";

/**
 * Formatting of the SLA editor: business minutes as localized durations ("8 hr", "8 Std.", "7 days") and
 * business hours as a compact, localized summary ("Mon–Fri 09:00–18:00"). Everything comes from `Intl`;
 * no English literals.
 */
const UNIT_MINUTES = { day: 1440, hour: 60, minute: 1 } as const;

function unit(value: number, name: "day" | "hour" | "minute", locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: name, unitDisplay: "short", maximumFractionDigits: 0 }).format(value);
}

/** 90 → "1 hr 30 min"; 10 080 → "7 days"; 0 or invalid → "—". */
export function formatBusinessMinutes(minutes: number | null | undefined, locale: string): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "—";
  let rest = Math.round(minutes);
  const parts: string[] = [];
  for (const name of ["day", "hour", "minute"] as const) {
    const size = UNIT_MINUTES[name];
    const amount = Math.floor(rest / size);
    if (amount > 0) {
      parts.push(unit(amount, name, locale));
      rest -= amount * size;
    }
  }
  return parts.join(" ");
}

/** `540` → "09:00" in the operator's locale (24-hour clock is kept for consistency across the six locales). */
export function formatMinutesOfDay(minutes: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Monday 2026-09-07 anchors the localized weekday names (short form). */
const WEEKDAY_ANCHOR = Date.UTC(2026, 8, 7);

export function weekdayLabel(day: SlaWeekday, locale: string, form: "short" | "long" = "short"): string {
  const index = SLA_WEEKDAYS.indexOf(day);
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: form, timeZone: "UTC" }).format(new Date(WEEKDAY_ANCHOR + index * 86_400_000));
}

/**
 * Groups consecutive days with identical windows: "Mon–Fri 09:00–18:00 · Sat 10:00–14:00". Days without
 * a window are skipped; a policy without any window yields an empty array (the caller says "24/7").
 */
export function businessHoursSummary(hours: SupportBusinessHours | null | undefined, locale: string): string[] {
  const groups: Array<{ from: SlaWeekday; to: SlaWeekday; key: string; text: string }> = [];
  for (const day of SLA_WEEKDAYS) {
    const windows = (hours?.days?.[day] ?? []).filter((w) => Array.isArray(w) && w.length === 2 && w[0] < w[1]);
    if (!windows.length) continue;
    const text = windows.map(([s, e]) => `${formatMinutesOfDay(s)}–${formatMinutesOfDay(e)}`).join(", ");
    const last = groups[groups.length - 1];
    if (last && last.key === text && SLA_WEEKDAYS.indexOf(last.to) === SLA_WEEKDAYS.indexOf(day) - 1) last.to = day;
    else groups.push({ from: day, to: day, key: text, text });
  }
  return groups.map((g) => `${g.from === g.to ? weekdayLabel(g.from, locale) : `${weekdayLabel(g.from, locale)}–${weekdayLabel(g.to, locale)}`} ${g.text}`);
}

/** Date + time in the operator's locale. */
export function formatDateTime(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
}
