import { describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES, DEFAULT_LOCALE } from "@/i18n/routing";
import * as copyModules from "./index";
import { COPY_LOCALES, FEATURES, availableLocales, copyParity, isCopyLocale, isLocalizedCopy, pick, type LocalizedCopy } from "./index";

/** Fixture with a value for every programme locale (the type requires one for each copy locale — all six since the enable stage). */
const six = <T>(en: T, others: Partial<Record<(typeof ALL_LOCALES)[number], T | null>> = {}): LocalizedCopy<T> =>
  ({ en, de: en, fr: en, es: en, it: en, nl: en, ...others }) as LocalizedCopy<T>;

/** Every `*_COPY`-style constant the barrel exports (objects keyed by every programme locale), discovered instead of listed. */
const MODULES = Object.entries(copyModules as Record<string, unknown>).filter((entry): entry is [string, LocalizedCopy<unknown>] => isLocalizedCopy(entry[1]));

describe("copy locale model", () => {
  it("requires typed copy for all six programme locales and keeps English as the default", () => {
    expect([...COPY_LOCALES]).toEqual([...ALL_LOCALES]);
    expect([...ACTIVE_LOCALES]).toEqual([...ALL_LOCALES]);
    for (const locale of ACTIVE_LOCALES) expect(COPY_LOCALES).toContain(locale);
    for (const locale of COPY_LOCALES) expect(ALL_LOCALES).toContain(locale);
    expect(DEFAULT_LOCALE).toBe("en");
    for (const locale of ALL_LOCALES) expect(isCopyLocale(locale), locale).toBe(true);
    expect(isCopyLocale("xx")).toBe(false);
    expect(isCopyLocale(undefined)).toBe(false);
  });

  it("pick serves every active locale strictly and throws for a missing active entry", () => {
    const copy = six("English", { de: "Deutsch", fr: "Français", es: "Español", it: "Italiano", nl: "Nederlands" });
    expect(pick("en", copy)).toBe("English");
    expect(pick("de", copy)).toBe("Deutsch");
    expect(pick("fr", copy)).toBe("Français");
    expect(pick("es", copy)).toBe("Español");
    expect(pick("it", copy)).toBe("Italiano");
    expect(pick("nl", copy)).toBe("Nederlands");
    // a `null` entry can only come from a stale index.ts; it must never render English on a localized page
    for (const locale of ACTIVE_LOCALES) {
      if (locale === DEFAULT_LOCALE) continue;
      expect(() => pick(locale, six("English", { [locale]: null })), locale).toThrow(new RegExp(`active locale "${locale}"`));
    }
  });

  it("pick falls back to English only for unknown locales", () => {
    const copy = six("English", { de: "Deutsch" });
    expect(pick("xx", copy)).toBe("English");
    expect(pick("", copy)).toBe("English");
    expect(availableLocales(copy)).toEqual([...ALL_LOCALES]);
    expect(availableLocales(six("English", { nl: null }))).toEqual(["en", "de", "fr", "es", "it"]);
  });

  it("copyParity reports missing locales and key differences against English", () => {
    const parity = copyParity(six({ a: "x", b: { c: "y" } }));
    for (const locale of ALL_LOCALES) expect(parity.find((p) => p.locale === locale)).toEqual({ locale, present: true, missing: [], extra: [] });
    expect(copyParity(six({ a: "x" }, { fr: null })).find((p) => p.locale === "fr")?.present).toBe(false);
    const drift = copyParity({ ...six({ a: "x", b: { c: "y" } }), fr: { a: "x", b: {}, d: "z" } as never });
    expect(drift.find((p) => p.locale === "fr")).toEqual({ locale: "fr", present: true, missing: ["b.c:string"], extra: ["d:string"] });
  });
});

describe("copy modules", () => {
  it("are all exported through the barrel", () => {
    const names = MODULES.map(([name]) => name).sort();
    expect(names).toEqual([
      "AUTH_COPY",
      "CONSENT_COPY",
      "FEATURES",
      "FEATURES_PAGE_COPY",
      "FEATURE_DETAIL_COPY",
      "FEATURE_UI_COPY",
      "FOOTER_COPY",
      "FORM_COPY",
      "HEADER_COPY",
      "HOME_COPY",
      "HOW_IT_WORKS",
      "INTEGRATIONS_COPY",
      "INTEGRATION_CATALOG_TEXT",
      "KNOWLEDGE_ARTICLE_COPY",
      "KNOWLEDGE_COPY",
      "KNOWLEDGE_HUB_COPY",
      "KNOWLEDGE_LABELS",
      "PRICING_COPY",
      "SECONDARY_COPY",
    ]);
  });

  for (const [name, copy] of MODULES) {
    it(`${name}: every programme locale has a value (all six are active) with the English shape`, () => {
      for (const locale of ALL_LOCALES) expect(locale in copy, `${name}.${locale} key`).toBe(true);
      for (const locale of ACTIVE_LOCALES) expect(copy[locale], `${name}.${locale} must not be null for an active locale`).not.toBeNull();
      expect(availableLocales(copy), `${name} must be translated into all six locales`).toEqual([...ALL_LOCALES]);
      for (const entry of copyParity(copy)) {
        expect(entry.present, `${name}.${entry.locale} present`).toBe(true);
        expect(entry.missing, `${name}.${entry.locale} lacks keys`).toEqual([]);
        expect(entry.extra, `${name}.${entry.locale} has keys that en does not`).toEqual([]);
      }
    });
  }

  it("feature slugs match across locales", () => {
    for (const locale of availableLocales(FEATURES)) expect(FEATURES[locale]?.map((f) => f.slug)).toEqual(FEATURES.en.map((f) => f.slug));
  });
});
