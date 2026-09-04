import { describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES, DEFAULT_LOCALE } from "@/i18n/routing";
import { AUTH_COPY, COPY_LOCALES, FEATURES, FORM_COPY, HOME_COPY, HOW_IT_WORKS, INTEGRATIONS_COPY, PRICING_COPY, SECONDARY_COPY, SHARED_COPY, isCopyLocale, pick, type LocalizedCopy } from "./index";

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
  const modules: Record<string, LocalizedCopy<unknown>> = { SHARED_COPY, FORM_COPY, HOME_COPY, FEATURES, HOW_IT_WORKS, INTEGRATIONS_COPY, PRICING_COPY, AUTH_COPY, SECONDARY_COPY };
  for (const [name, copy] of Object.entries(modules)) {
    it(name, () => {
      const reference = shape(copy.en);
      for (const locale of COPY_LOCALES) expect(shape(copy[locale]), `${name}.${locale}`).toEqual(reference);
    });
  }

  it("feature slugs match across locales", () => {
    expect(FEATURES.de.map((f) => f.slug)).toEqual(FEATURES.en.map((f) => f.slug));
  });
});
