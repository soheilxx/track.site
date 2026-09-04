import { defineRouting } from "next-intl/routing";

/**
 * Six-locale programme (redesign supplement §7): every public URL carries a locale prefix
 * (`/en` included), `/` redirects deterministically to `/en`, and there is no geo or
 * Accept-Language redirect. Dashboard (/app), API and CDN paths are never localized by URL.
 *
 * A locale is ACTIVE only once its UI catalogs, marketing/legal copy and all knowledge articles
 * exist, so no English fallback is ever served on a localized public page. Since 2026-09-04 all six
 * programme locales are active (`docs/i18n-parity-report.md` shows zero gaps for every locale);
 * `ACTIVE_LOCALES` stays a separate list so a locale can be withdrawn again without touching the
 * type model — nothing else in the app hard-codes the locale list.
 */
export const ALL_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const;
export type AppLocale = (typeof ALL_LOCALES)[number];

/** Locales served publicly: all six programme locales (enable stage of phase 4, docs/14-localization.md §3). */
export const ACTIVE_LOCALES: readonly AppLocale[] = ["en", "de", "fr", "es", "it", "nl"];
export const DEFAULT_LOCALE: AppLocale = "en";

/** Native language names for the switcher (written out, no flags). */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
};

/** Open Graph locale codes for `og:locale` / `og:locale:alternate`. */
export const OG_LOCALES: Record<AppLocale, string> = {
  en: "en_US",
  de: "de_DE",
  fr: "fr_FR",
  es: "es_ES",
  it: "it_IT",
  nl: "nl_NL",
};

/** Name of the cookie that stores a deliberate language choice (read for /app, never used to redirect). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const routing = defineRouting({
  locales: ACTIVE_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  // deterministic URLs: no Accept-Language / cookie based redirects; `/` → `/en` is handled by the proxy
  localeDetection: false,
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365 },
  // hreflang lives in the HTML head (one source of truth via pageMetadata), not in a Link header
  alternateLinks: false,
});

export const LOCALES = routing.locales;

/** True for a locale that is served publicly (`ACTIVE_LOCALES`). */
export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (ACTIVE_LOCALES as readonly string[]).includes(value);
}

/** True for any of the six programme locales (identical to `isLocale` while all six are active; kept for callers that must accept a withdrawn locale). */
export function isKnownLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (ALL_LOCALES as readonly string[]).includes(value);
}
