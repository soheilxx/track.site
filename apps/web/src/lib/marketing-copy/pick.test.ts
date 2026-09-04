import { describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES, DEFAULT_LOCALE } from "@/i18n/routing";
import * as copyModules from "./index";
import { COPY_LOCALES, FEATURES, isCopyLocale, pick, type LocalizedCopy } from "./index";

/** Structural signature of a copy object: key paths, array lengths and value kinds. */
function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    const first = value[0];
    return [`${path}[${value.length}]`, ...(first !== undefined ? shape(first, `${path}[]`) : [])];
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return [`${path}:${typeof value}`];
}

function isLocalizedCopy(value: unknown): value is LocalizedCopy<unknown> {
  return !!value && typeof value === "object" && COPY_LOCALES.every((locale) => locale in (value as Record<string, unknown>));
}

/** Every `*_COPY`-style constant the barrel exports (objects keyed by copy locale), discovered instead of listed. */
const MODULES = Object.entries(copyModules as Record<string, unknown>).filter((entry): entry is [string, LocalizedCopy<unknown>] => isLocalizedCopy(entry[1]));

describe("marketing copy locales", () => {
  it("covers every active locale with typed copy and keeps English as the default", () => {
    for (const locale of ACTIVE_LOCALES) expect(COPY_LOCALES).toContain(locale);
    for (const locale of COPY_LOCALES) expect(ALL_LOCALES).toContain(locale);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("pick serves active locales strictly", () => {
    const copy: LocalizedCopy<string> = { en: "English", de: "Deutsch" };
    expect(pick("en", copy)).toBe("English");
    expect(pick("de", copy)).toBe("Deutsch");
    expect(() => pick("de", { en: "English" } as unknown as LocalizedCopy<string>)).toThrow(/active locale "de"/);
  });

  it("pick falls back to English only for inactive or unknown locales", () => {
    const copy: LocalizedCopy<string> = { en: "English", de: "Deutsch" };
    expect(pick("fr", copy)).toBe("English");
    expect(pick("xx", copy)).toBe("English");
    expect(pick("", copy)).toBe("English");
    expect(isCopyLocale("fr")).toBe(false);
    expect(isCopyLocale("de")).toBe(true);
  });
});

describe("marketing copy modules have the same shape in every locale", () => {
  it("exports every copy module through the barrel", () => {
    const names = MODULES.map(([name]) => name).sort();
    expect(names).toEqual(["AUTH_COPY", "CONSENT_COPY", "FEATURES", "FEATURES_PAGE_COPY", "FEATURE_DETAIL_COPY", "FEATURE_UI_COPY", "FOOTER_COPY", "FORM_COPY", "HEADER_COPY", "HOME_COPY", "HOW_IT_WORKS", "INTEGRATIONS_COPY", "KNOWLEDGE_ARTICLE_COPY", "KNOWLEDGE_HUB_COPY", "PRICING_COPY", "SECONDARY_COPY"]);
  });

  for (const [name, copy] of MODULES) {
    it(name, () => {
      const reference = shape(copy.en);
      expect(reference.length).toBeGreaterThan(0);
      for (const locale of COPY_LOCALES) expect(shape(copy[locale]), `${name}.${locale}`).toEqual(reference);
    });
  }

  it("feature slugs match across locales", () => {
    expect(FEATURES.de.map((f) => f.slug)).toEqual(FEATURES.en.map((f) => f.slug));
  });
});
