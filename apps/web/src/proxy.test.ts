import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES } from "./i18n/routing";

// next-intl's middleware cannot be resolved by vitest's Node ESM loader (it imports the extension-less
// "next/server"); the proxy's own decisions are what is under test, so the intl handler is a marker stub.
vi.mock("next-intl/middleware", () => ({
  default: () => (request: NextRequest) => {
    const res = NextResponse.next();
    res.headers.set("x-test-intl", request.nextUrl.pathname);
    return res;
  },
}));

const { default: proxy, isUnlocalizedPath, localeRedirect } = await import("./proxy");

const req = (url: string, headers: Record<string, string> = {}) => new NextRequest(new URL(url, "http://localhost:3000"), { headers: { host: "localhost:3000", ...headers } });

describe("proxy: locale redirects", () => {
  it("308-redirects the root and unprefixed marketing paths to /en, keeping the query string", () => {
    const root = proxy(req("/"));
    expect(root.status).toBe(308);
    expect(root.headers.get("location")).toBe("http://localhost:3000/en");

    const pricing = proxy(req("/pricing?plan=growth&utm_source=x"));
    expect(pricing.status).toBe(308);
    expect(pricing.headers.get("location")).toBe("http://localhost:3000/en/pricing?plan=growth&utm_source=x");

    const nested = proxy(req("/integrations/google-ads/"));
    expect(nested.status).toBe(308);
    expect(nested.headers.get("location")).toBe("http://localhost:3000/en/integrations/google-ads");
  });

  it("serves every programme locale directly (no temporary redirect to English since all six are active)", () => {
    for (const locale of ALL_LOCALES) {
      expect(ACTIVE_LOCALES, locale).toContain(locale);
      const res = proxy(req(`/${locale}/pricing?x=1`));
      expect(res.status, locale).toBe(200);
      expect(res.headers.get("location"), locale).toBeNull();
      expect(res.headers.get("x-test-intl"), locale).toBe(`/${locale}/pricing`);
    }
  });

  it("honours a deliberate language choice (NEXT_LOCALE cookie) for unprefixed paths, English otherwise", () => {
    const chosen = proxy(req("/pricing", { cookie: "NEXT_LOCALE=fr" }));
    expect(chosen.status).toBe(308);
    expect(chosen.headers.get("location")).toBe("http://localhost:3000/fr/pricing");
    // an unknown value in the cookie never redirects anywhere but English
    expect(proxy(req("/pricing", { cookie: "NEXT_LOCALE=xx" })).headers.get("location")).toBe("http://localhost:3000/en/pricing");
  });

  it("never redirects dashboard, API, CDN, Next internals or file-like paths", () => {
    for (const path of ["/app", "/app/sites?x=1", "/api/health", "/cdn/v1/tracker.js", "/_next/image?url=x", "/robots.txt", "/sitemaps/pages-en.xml"]) {
      expect(isUnlocalizedPath(new URL(path, "http://x").pathname)).toBe(true);
      const res = proxy(req(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-test-intl"), path).toBeNull();
    }
    // "/application" is a marketing path, not the dashboard prefix
    expect(proxy(req("/application")).headers.get("location")).toBe("http://localhost:3000/en/application");
  });

  it("passes active-locale paths through to next-intl without redirecting", () => {
    for (const path of ["/en", "/en/pricing?x=1", "/de", "/de/blog/some-post", "/fr", "/es/pricing", "/it/tracking-knowledge", "/nl/integrations/meta"]) {
      expect(localeRedirect(req(path))).toBeNull();
      const res = proxy(req(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-test-intl"), path).toBe(new URL(path, "http://x").pathname);
    }
  });
});
