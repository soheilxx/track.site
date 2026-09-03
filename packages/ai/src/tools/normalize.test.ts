import { describe, expect, it } from "vitest";
import { EVENT_NAME_RULE, normalizeCurrency, normalizeEventName, normalizeMarkets } from "./normalize.ts";

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

describe("normalizeEventName", () => {
  it("maps vendor, camelCase, spaced and lowercase spellings to the canonical standard event", () => {
    expect(normalizeEventName("AddToCart")).toEqual({ name: "add_to_cart", isStandard: true });
    expect(normalizeEventName("addtocart")).toEqual({ name: "add_to_cart", isStandard: true });
    expect(normalizeEventName("Add to cart")).toEqual({ name: "add_to_cart", isStandard: true });
    expect(normalizeEventName("Add-To-Cart")).toEqual({ name: "add_to_cart", isStandard: true });
    expect(normalizeEventName("PageView")).toEqual({ name: "page_view", isStandard: true });
    expect(normalizeEventName("Lead")).toEqual({ name: "generate_lead", isStandard: true });
    expect(normalizeEventName("lead")).toEqual({ name: "generate_lead", isStandard: true });
    expect(normalizeEventName("Purchase")).toEqual({ name: "purchase", isStandard: true });
    expect(normalizeEventName("InitiateCheckout")).toEqual({ name: "begin_checkout", isStandard: true });
    expect(normalizeEventName("CompleteRegistration")).toEqual({ name: "sign_up", isStandard: true });
    expect(normalizeEventName("signup")).toEqual({ name: "sign_up", isStandard: true });
    expect(normalizeEventName(" purchase ")).toEqual({ name: "purchase", isStandard: true });
  });
  it("keeps valid custom names and snake_cases natural language", () => {
    expect(normalizeEventName("newsletter_signup")).toEqual({ name: "newsletter_signup", isStandard: false });
    expect(normalizeEventName("Newsletter Signup")).toEqual({ name: "newsletter_signup", isStandard: false });
    expect(normalizeEventName("phoneClick")).toEqual({ name: "phone_click", isStandard: false });
  });
  it("rejects reserved prefixes and unmappable names with the rule and the vocabulary", () => {
    expect(() => normalizeEventName("fb_purchase")).toThrow(/fb_/);
    expect(() => normalizeEventName("fb_purchase")).toThrow(/purchase, refund/);
    expect(() => normalizeEventName("1st_click")).toThrow(/snake_case/);
    expect(() => normalizeEventName("")).toThrow(/not valid/);
    expect(() => normalizeEventName("ünïcode")).toThrow(/not valid/);
    expect(EVENT_NAME_RULE).toContain("add_to_cart");
  });
});
