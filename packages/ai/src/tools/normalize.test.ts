import { describe, expect, it } from "vitest";
import { normalizeCurrency, normalizeMarkets } from "./normalize.ts";

describe("normalizeMarkets", () => {
  it("accepts ISO codes in any case and German or English country names", () => {
    expect(normalizeMarkets(["de", "Österreich", "Switzerland", "DE"])).toEqual(["DE", "AT", "CH"]);
    expect(normalizeMarkets(["Deutschland"])).toEqual(["DE"]);
    expect(normalizeMarkets(null)).toBeNull();
  });
  it("rejects what it cannot map with an actionable message", () => {
    expect(() => normalizeMarkets(["Deutschland", "Narnia"])).toThrow(/ISO 3166-1 alpha-2 .*Narnia/);
  });
});

describe("normalizeCurrency", () => {
  it("maps names and codes to ISO 4217", () => {
    expect(normalizeCurrency("Euro")).toBe("EUR");
    expect(normalizeCurrency("eur")).toBe("EUR");
    expect(normalizeCurrency("Schweizer Franken")).toBe("CHF");
    expect(normalizeCurrency("sek")).toBe("SEK");
    expect(normalizeCurrency(null)).toBeNull();
  });
  it("rejects unknown currencies", () => {
    expect(() => normalizeCurrency("Goldmünzen")).toThrow(/ISO 4217/);
  });
});
