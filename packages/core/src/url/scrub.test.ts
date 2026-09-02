import { describe, expect, it } from "vitest";
import { hostMatches, normalizeDomainInput, scrubUrl } from "./scrub.ts";

describe("scrubUrl", () => {
  it("removes PII/secret params, extracts click ids and utm, keeps harmless params", () => {
    const r = scrubUrl(
      "https://Shop.Example.com/p/1?utm_source=meta&fbclid=abc123&email=a@b.de&token=xyz&ref=home&q=shoes&gclid=g1#frag",
    );
    expect(r).not.toBeNull();
    expect(r!.host).toBe("shop.example.com");
    expect(r!.clickIds).toEqual({ fbclid: "abc123", gclid: "g1" });
    expect(r!.utm).toEqual({ utm_source: "meta" });
    expect(r!.removedParams.sort()).toEqual(["email", "token"]);
    expect(r!.url).toBe("https://shop.example.com/p/1?utm_source=meta&ref=home&q=shoes");
  });

  it("redacts email-like values anywhere and rejects non-http urls", () => {
    expect(scrubUrl("https://x.test/u/john@doe.com/profile?x=y")!.path).toBe("/u/_redacted_/profile");
    expect(scrubUrl("https://x.test/?search=me@mail.com")!.url).toBe("https://x.test/");
    expect(scrubUrl("javascript:alert(1)")).toBeNull();
    expect(scrubUrl("not a url")).toBeNull();
  });

  it("honours explicit allow and block lists", () => {
    const r = scrubUrl("https://x.test/?code=ABC&custom=1", { allowParams: ["code"], blockParams: ["custom"] });
    expect(r!.url).toBe("https://x.test/?code=ABC");
  });

  it("matches wildcard hosts", () => {
    expect(hostMatches("www.example.com", "*.example.com")).toBe(true);
    expect(hostMatches("example.com", "*.example.com")).toBe(true);
    expect(hostMatches("evil-example.com", "*.example.com")).toBe(false);
    expect(hostMatches("Example.COM", "example.com")).toBe(true);
  });

  it("normalizes domain input", () => {
    expect(normalizeDomainInput(" https://www.Shop.de/path?x=1 ")).toBe("www.shop.de");
    expect(normalizeDomainInput("shop.de")).toBe("shop.de");
    expect(normalizeDomainInput("localhost:3000")).toBe("localhost");
    expect(normalizeDomainInput("not a domain")).toBeNull();
    expect(normalizeDomainInput("")).toBeNull();
  });
});
