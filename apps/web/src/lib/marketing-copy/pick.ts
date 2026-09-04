import { ACTIVE_LOCALES } from "@/i18n/routing";
import { COPY_LOCALES, type CopyLocale, type LocalizedCopy } from "./types";

/** True when typed marketing copy exists for `value`. */
export function isCopyLocale(value: unknown): value is CopyLocale {
  return typeof value === "string" && (COPY_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve the copy object for a locale.
 *
 * - Active locales (`ACTIVE_LOCALES` in i18n/routing.ts) are served strictly: their copy must exist.
 *   A missing entry throws instead of silently rendering English on a localized public page
 *   (supplement §7: no mixed-language pages).
 * - Inactive programme locales (fr/es/it/nl until they roll out) and unknown values fall back to
 *   English. They are never routed publicly, so the fallback only affects previews, tooling and
 *   defensive code paths (e.g. an unvalidated `locale` param).
 */
export function pick<T>(locale: string, copy: LocalizedCopy<T>): T {
  if (isCopyLocale(locale)) {
    const entry = copy[locale];
    if (entry !== undefined) return entry;
  }
  if ((ACTIVE_LOCALES as readonly string[]).includes(locale)) {
    throw new Error(`Marketing copy is missing for the active locale "${locale}". Add it to COPY_LOCALES and every copy module before activating the locale.`);
  }
  return copy.en;
}
