import { defineRouting } from "next-intl/routing";

/** English is the default (no prefix); German lives under /de. Dashboard/API/CDN paths are not localized by URL. */
export const routing = defineRouting({
  locales: ["en", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];
export const LOCALES = routing.locales;
export const DEFAULT_LOCALE = routing.defaultLocale;

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}
