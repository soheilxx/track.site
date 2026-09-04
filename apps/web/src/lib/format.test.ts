import { describe, expect, it } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { INTL_LOCALES, formatCents, formatCurrency, formatDate, formatNumber, intlLocale } from "./format";

/** Intl uses non-breaking and narrow spaces as separators; tests compare on plain spaces. */
const plain = (s: string) => s.replace(/[\u00A0\u202F]/g, " ");

describe("locale formatting", () => {
  it("maps every programme locale to a BCP 47 tag and falls back to English", () => {
    for (const locale of ALL_LOCALES) expect(INTL_LOCALES[locale]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    expect(intlLocale("de")).toBe("de-DE");
    expect(intlLocale("xx")).toBe("en-IE");
  });

  it("formats numbers with the locale's grouping", () => {
    expect(plain(formatNumber(500_000, "en"))).toBe("500,000");
    expect(plain(formatNumber(500_000, "de"))).toBe("500.000");
    expect(plain(formatNumber(500_000, "fr"))).toBe("500 000");
    expect(plain(formatNumber(500_000, "es"))).toBe("500.000");
    expect(plain(formatNumber(500_000, "it"))).toBe("500.000");
    expect(plain(formatNumber(500_000, "nl"))).toBe("500.000");
  });

  it("formats euro amounts per locale without decimals for whole euros", () => {
    expect(plain(formatCurrency(19, "en"))).toBe("€19");
    expect(plain(formatCurrency(19, "de"))).toBe("19 €");
    expect(plain(formatCurrency(1800, "de"))).toBe("1.800 €");
    expect(plain(formatCurrency(19, "fr"))).toBe("19 €");
    expect(plain(formatCurrency(19, "es"))).toBe("19 €");
    expect(plain(formatCurrency(19, "it"))).toBe("19 €");
    expect(plain(formatCurrency(19, "nl"))).toBe("€ 19");
    expect(plain(formatCurrency(19.9, "en"))).toBe("€19.90");
    expect(plain(formatCents(1900, "en"))).toBe("€19");
    expect(plain(formatCents(1990, "de"))).toBe("19,90 €");
    expect(plain(formatCurrency(19, "en", { minimumFractionDigits: 2 }))).toBe("€19.00");
  });

  it("formats calendar dates in UTC per locale", () => {
    expect(formatDate("2026-08-17", "en")).toBe("17 August 2026");
    expect(formatDate("2026-08-17", "de")).toBe("17. August 2026");
    expect(formatDate("2026-08-17", "fr")).toBe("17 août 2026");
    expect(formatDate("2026-08-17", "es")).toBe("17 de agosto de 2026");
    expect(formatDate("2026-08-17", "it")).toBe("17 agosto 2026");
    expect(formatDate("2026-08-17", "nl")).toBe("17 augustus 2026");
    expect(formatDate("2026-08-17T23:30:00.000Z", "en")).toBe("17 August 2026");
    expect(formatDate(new Date("2026-08-17"), "de", "month")).toBe("August 2026");
    expect(formatDate("2026-08-17", "de", "short")).toBe("17.08.2026");
    expect(formatDate("2026-08-17", "xx")).toBe("17 August 2026");
  });
});
