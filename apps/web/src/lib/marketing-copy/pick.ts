import { ACTIVE_LOCALES, ALL_LOCALES, isKnownLocale, type AppLocale } from "@/i18n/routing";
import { COPY_LOCALES, type CopyLocale, type LocalizedCopy } from "./types";

/** True when `value` is a locale whose copy entry is required by the type system (`COPY_LOCALES`). */
export function isCopyLocale(value: unknown): value is CopyLocale {
  return typeof value === "string" && (COPY_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve the copy object for a locale.
 *
 * - Active locales (`ACTIVE_LOCALES` in i18n/routing.ts) are served strictly: their entry must be
 *   present. A `null` entry throws instead of silently rendering English on a localized public page
 *   (supplement §7: no mixed-language pages, no silent English fallback).
 * - Inactive programme locales (fr/es/it/nl until they roll out) and unknown values fall back to
 *   English. They are never routed publicly, so the fallback only affects previews, tooling and
 *   defensive code paths (e.g. an unvalidated `locale` param or a user preference set before a
 *   locale was withdrawn).
 */
export function pick<T>(locale: string, copy: LocalizedCopy<T>): T {
  if (isKnownLocale(locale)) {
    const entry = copy[locale];
    if (entry !== null && entry !== undefined) return entry;
  }
  if ((ACTIVE_LOCALES as readonly string[]).includes(locale)) {
    throw new Error(`Copy is missing for the active locale "${locale}". Every copy area needs a <area>/${locale}.ts and a non-null entry in <area>/index.ts before the locale is activated (docs/14-localization.md).`);
  }
  return copy.en;
}

/** Locales that carry a non-null entry in `copy` (English is always among them). */
export function availableLocales<T>(copy: LocalizedCopy<T>): AppLocale[] {
  return ALL_LOCALES.filter((locale) => copy[locale] !== null && copy[locale] !== undefined);
}
