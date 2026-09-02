import { describe, expect, it } from "vitest";
import { checkDnsTxt, findMetaVerification, findTrackerSnippet } from "./domain-verify.ts";
import { inspectHtml } from "./site-inspect.ts";

describe("site inspection", () => {
  it("detects shopify with tags and cmp", () => {
    const html = `<html lang="de"><head><title>Mein Shop</title><script src="https://cdn.shopify.com/s/files/1/theme.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script><script src="https://app.usercentrics.eu/browser-ui/latest/loader.js"></script></head><body>Shopify.theme = {}; window.dataLayer = []; <button>In den Warenkorb</button></body></html>`;
    const r = inspectHtml(html);
    expect(r.platform).toBe("shopify");
    expect(r.confidence).toBeGreaterThan(0.8);
    expect(r.existingTags).toEqual(expect.arrayContaining(["gtag", "ga4"]));
    expect(r.cmp).toBe("usercentrics");
    expect(r.hasDataLayer).toBe(true);
    expect(r.isEcommerceLikely).toBe(true);
    expect(r.title).toBe("Mein Shop");
    expect(r.language).toBe("de");
  });
  it("prefers woocommerce over plain wordpress and never returns page content", () => {
    const r = inspectHtml(`<link href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"><script src="/wp-includes/js/jquery.js"></script><p>secret text john@example.com</p>`);
    expect(r.platform).toBe("woocommerce");
    expect(JSON.stringify(r)).not.toContain("john@example.com");
    expect(inspectHtml("<html><body>plain</body></html>").platform).toBe("custom");
  });
});

describe("domain verification helpers", () => {
  it("matches dns txt across candidate hosts", async () => {
    const resolver = async (host: string) => (host === "_track-site.shop.test" ? [["track-site-verify=abc"]] : []);
    expect((await checkDnsTxt("shop.test", "track-site-verify=abc", resolver)).ok).toBe(true);
    expect((await checkDnsTxt("shop.test", "track-site-verify=zzz", resolver)).ok).toBe(false);
  });
  it("finds meta tags and tracker snippets", () => {
    expect(findMetaVerification(`<meta name="track-site-verification" content="track-site-verify=x">`)).toBe("track-site-verify=x");
    expect(findMetaVerification(`<meta content="y" name='track-site-verification'>`)).toBe("y");
    expect(findTrackerSnippet(`<script async src="https://cdn.track.site/v1/tracker.js" data-site-id="a7k2q9"></script>`, "A7K2Q9")).toEqual({ found: true, siteIdMatches: true, async: true });
    expect(findTrackerSnippet(`<script src="/tracker.js" data-site-id="ZZZZZZ"></script>`, "A7K2Q9")).toEqual({ found: true, siteIdMatches: false, async: false });
    expect(findTrackerSnippet(`<html></html>`, "A7K2Q9").found).toBe(false);
  });
});
