import { describe, expect, it } from "vitest";
import { domainQuery, readStoredDomain, safeDomain, storeDomain } from "./domain";

describe("auth domain hand-over", () => {
  it("normalizes valid candidates to a bare lower-case hostname", () => {
    expect(safeDomain("Shop.Example.com")).toBe("shop.example.com");
    expect(safeDomain(" https://www.shop.de/path?x=1 ")).toBe("www.shop.de");
    expect(safeDomain("shop.example.com:8443")).toBe("shop.example.com");
  });

  it("rejects everything that is not a hostname", () => {
    expect(safeDomain("")).toBeNull();
    expect(safeDomain("   ")).toBeNull();
    expect(safeDomain("not a domain")).toBeNull();
    expect(safeDomain("javascript:alert(1)")).toBeNull();
    expect(safeDomain("<script>")).toBeNull();
    expect(safeDomain(`${"a".repeat(260)}.com`)).toBeNull();
    expect(safeDomain(null)).toBeNull();
    expect(safeDomain(undefined)).toBeNull();
    expect(safeDomain(["shop.de"])).toBeNull();
  });

  it("builds the query suffix only for a validated domain", () => {
    expect(domainQuery(null)).toBe("");
    expect(domainQuery("shop.de")).toBe("?domain=shop.de");
    expect(domainQuery("shop.de", false)).toBe("&domain=shop.de");
    expect(domainQuery("münchen.de")).toBe(`?domain=${encodeURIComponent("münchen.de")}`);
  });

  it("degrades to null without session storage", () => {
    // vitest runs these in node: no sessionStorage, and neither helper may throw
    expect(readStoredDomain()).toBeNull();
    expect(() => storeDomain("shop.de")).not.toThrow();
  });
});
