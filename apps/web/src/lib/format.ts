import { DEFAULT_LOCALE, isKnownLocale, type AppLocale } from "@/i18n/routing";

/**
 * Locale-aware number, currency and date formatting for the six programme locales, on top of
 * `Intl`. One BCP 47 tag per app locale so pricing, billing, knowledge dates and the dashboard format
 * the same way; unknown locales format as English. Prices are EUR only (tariff catalogue).
 *
 * English uses `en-IE`: euro amounts read "€19" (symbol first, no code) and dates read
 * "17 August 2026" — the conventions of the English-speaking EU market Track sells into.
 */
export const INTL_LOCALES: Record<AppLocale, string> = {
  en: "en-IE",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  nl: "nl-NL",
};

/** BCP 47 tag for an app locale (English for unknown values). */
export function intlLocale(locale: string): string {
  return INTL_LOCALES[isKnownLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** `500000` → "500,000" (en), "500.000" (de/es/it/nl), "500 000" (fr). */
export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export interface CurrencyFormatOptions {
  /** ISO 4217 code; the tariff catalogue is EUR only. */
  currency?: string;
  /** Fraction digits; the default shows whole euros without decimals and cents when present ("€19", "€19.90"). */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/** Amount in major units (euros): `19` → "€19" (en), "19 €" (de/fr/es/it), "€ 19" (nl). */
export function formatCurrency(amount: number, locale: string, options: CurrencyFormatOptions = {}): string {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const { currency = "EUR", minimumFractionDigits = hasCents ? 2 : 0, maximumFractionDigits = 2 } = options;
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, minimumFractionDigits, maximumFractionDigits: Math.max(minimumFractionDigits, maximumFractionDigits) }).format(amount);
}

/** Amount in minor units (cents, as the tariff catalogue and Stripe store it): `1900` → "€19". */
export function formatCents(cents: number, locale: string, options: CurrencyFormatOptions = {}): string {
  return formatCurrency(cents / 100, locale, options);
}

export type DateStyle = "long" | "short" | "month";

/**
 * Calendar date of an ISO string or Date, formatted in UTC so a date-only value ("2026-08-17") never
 * shifts by the server's time zone: "17 August 2026" (en), "17. August 2026" (de), "17 août 2026" (fr),
 * "17 de agosto de 2026" (es), "17 agosto 2026" (it), "17 augustus 2026" (nl). `short` is the numeric
 * form, `month` is month + year.
 */
export function formatDate(value: string | Date, locale: string, style: DateStyle = "long"): string {
  const date = value instanceof Date ? value : new Date(value);
  const options: Intl.DateTimeFormatOptions = style === "short" ? { dateStyle: "medium" } : style === "month" ? { month: "long", year: "numeric" } : { dateStyle: "long" };
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: "UTC" }).format(date);
}
