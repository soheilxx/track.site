import { ALL_LOCALES, type AppLocale } from "@/i18n/routing";
import type { LocalizedCopy } from "./types";

/**
 * Structural parity of a localized copy constant: every non-null locale must have exactly the keys
 * of the English source (recursively; arrays compare their length and the shape of their first
 * element; leaves compare their value kind). Used by the unit tests next to every copy module and
 * by `scripts/i18n-parity.mjs` for the parity report, so both apply the same rule.
 */

/** Structural signature of a copy object: key paths, array lengths and value kinds. */
export function shapeOf(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    const first = value[0];
    return [`${path}[${value.length}]`, ...(first !== undefined ? shapeOf(first, `${path}[]`) : [])];
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shapeOf((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path}:${typeof value}`];
}

export interface LocaleParity {
  locale: AppLocale;
  /** False when the entry is `null` (not translated yet). */
  present: boolean;
  /** Key paths of the English source that the locale lacks (all of them when absent). */
  missing: string[];
  /** Key paths the locale has but the English source does not. */
  extra: string[];
}

/** Parity of every programme locale against `copy.en`. */
export function copyParity<T>(copy: LocalizedCopy<T>): LocaleParity[] {
  const reference = shapeOf(copy.en);
  const referenceSet = new Set(reference);
  return ALL_LOCALES.map((locale) => {
    const entry = copy[locale];
    if (entry === null || entry === undefined) return { locale, present: false, missing: reference, extra: [] };
    const actual = shapeOf(entry);
    const actualSet = new Set(actual);
    return { locale, present: true, missing: reference.filter((k) => !actualSet.has(k)), extra: actual.filter((k) => !referenceSet.has(k)) };
  });
}

/** True for an object keyed by every programme locale (the shape of every `*_COPY` constant). */
export function isLocalizedCopy(value: unknown): value is LocalizedCopy<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ALL_LOCALES.every((locale) => locale in record) && record.en !== null && record.en !== undefined;
}
