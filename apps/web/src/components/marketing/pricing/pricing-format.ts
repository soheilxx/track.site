import { intlLocale } from "@/lib/format";

/**
 * Formatting and constants of the pricing page that need NO tariff catalogue: the client islands
 * that stay in the hydration bundle (plan cards, matrix CTAs, interval toggle) import from here, so
 * `@track-site/catalog` (plans, features and labels in six locales, ~25 KB minified) only travels in
 * the lazily loaded finder/calculator chunk. `pricing-helpers.ts` re-exports everything below.
 */

/** Fills `{placeholder}` templates from the copy module (functions cannot cross the client boundary). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match));
}

/** BCP 47 tag for number formatting per app locale (`lib/format.ts`; EUR formats: `€19` / `19 €` / `€ 19`). */
export function numberLocale(locale: string): string {
  return intlLocale(locale);
}

/** Integer cents → currency string; whole amounts without decimals, fractional ones with two. */
export function formatMoney(cents: number, currency: string, locale: string, fractionDigits?: number): string {
  const amount = cents / 100;
  const digits = fractionDigits ?? (Number.isInteger(amount) ? 0 : 2);
  return new Intl.NumberFormat(numberLocale(locale), { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

/** Major units (as delivered by `PublicPrice.amount`) → currency string. */
export function formatAmount(amount: number, currency: string, locale: string, fractionDigits?: number): string {
  return formatMoney(Math.round(amount * 100), currency, locale, fractionDigits);
}

export function formatInteger(n: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 0 }).format(n);
}

/** `500,000` → `500K` / `500.000`, `5,000,000` → `5M` / `5 Mio.` (slider end labels). */
export function formatCompact(n: number, locale: string): string {
  return new Intl.NumberFormat(numberLocale(locale), { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** `["70 %", "90 %", "100 %"]` → `70 %, 90 % and 100 %` / `70 %, 90 % und 100 %`. */
export function formatList(items: string[], locale: string): string {
  return new Intl.ListFormat(numberLocale(locale), { style: "long", type: "conjunction" }).format(items);
}

/* ------------------------------------------------------------------- links */

export const CONTACT_SALES_HREF = "/contact?topic=enterprise";
export const SIGNUP_HREF = "/signup";

/** Signup links of one plan per billing interval, resolved on the server with `signupHref()` and handed to the client islands. */
export interface PlanHrefs {
  monthly: string;
  yearly: string;
}

/* ---------------------------------------------------------------- volumes */

/** Upper bound of the calculator input (events per month). */
export const MAX_EVENTS = 1_000_000_000;

/** Discrete stops of the event-volume slider; strictly increasing and covering every paid plan limit. */
export const EVENT_STOPS: readonly number[] = [50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000];

/** Index of the largest stop that is ≤ `events` (0 when below the first stop). */
export function nearestStopIndex(events: number): number {
  let index = 0;
  for (let i = 0; i < EVENT_STOPS.length; i += 1) {
    const stop = EVENT_STOPS[i];
    if (stop !== undefined && stop <= events) index = i;
  }
  return index;
}

export function clampEvents(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_EVENTS, Math.floor(n));
}

/** Parses a typed volume ("1.500.000", "2,000,000", "750000"); null when there is no digit at all. */
export function parseEventsInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return clampEvents(Number.parseInt(digits, 10));
}

/** Answer options of the finder's event question; `Infinity` = "more than the largest listed volume". */
export const FINDER_EVENT_OPTIONS: readonly number[] = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, Number.POSITIVE_INFINITY];
