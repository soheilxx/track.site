import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ACTIVE_LOCALES, ALL_LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, OG_LOCALES, isKnownLocale, isLocale, routing } from "@/i18n/routing";
import { BRAND_NAME, PUBLISHER_LOGO_PATH, absoluteUrl, alternatesFor, localizedPath, organizationJsonLd, pageMetadata, parseSitemapName, publisherJsonLd, publisherLogoUrl, sitemapIndexXml, sitemapName, sitemapUrlsetXml, websiteJsonLd } from "./seo";

beforeEach(() => {
  process.env.HOST_MARKETING = "https://www.track.site";
});

describe("routing", () => {
  it("knows all six programme locales and serves only the active ones", () => {
    expect(ALL_LOCALES).toEqual(["en", "de", "fr", "es", "it", "nl"]);
    expect(ACTIVE_LOCALES.every((l) => ALL_LOCALES.includes(l))).toBe(true);
    expect(ACTIVE_LOCALES).toContain("en");
    expect(routing.localePrefix).toBe("always");
    expect(routing.localeDetection).toBe(false);
    expect(routing.defaultLocale).toBe("en");
    expect(isLocale("de")).toBe(true);
    expect(isLocale("fr")).toBe(ACTIVE_LOCALES.includes("fr"));
    expect(isKnownLocale("fr")).toBe(true);
    expect(isKnownLocale("xx")).toBe(false);
  });
  it("has native names and Open Graph codes for every locale", () => {
    expect(LOCALE_NAMES).toEqual({ en: "English", de: "Deutsch", fr: "Français", es: "Español", it: "Italiano", nl: "Nederlands" });
    expect(OG_LOCALES).toEqual({ en: "en_US", de: "de_DE", fr: "fr_FR", es: "es_ES", it: "it_IT", nl: "nl_NL" });
  });
});

describe("localizedPath / absoluteUrl", () => {
  it("always prefixes, English included", () => {
    expect(localizedPath("/", "en")).toBe("/en");
    expect(localizedPath("/", "de")).toBe("/de");
    expect(localizedPath("/pricing", "en")).toBe("/en/pricing");
    expect(localizedPath("/pricing/", "de")).toBe("/de/pricing");
    expect(localizedPath("blog/feed.xml", "de")).toBe("/de/blog/feed.xml");
    expect(absoluteUrl("/pricing")).toBe("https://www.track.site/en/pricing");
    expect(absoluteUrl("/", "de")).toBe("https://www.track.site/de");
  });
});

describe("alternatesFor", () => {
  it("emits a self canonical, one hreflang per active locale and x-default = English", () => {
    const de = alternatesFor("/pricing", "de");
    expect(de.canonical).toBe("https://www.track.site/de/pricing");
    const languages = de.languages as Record<string, string>;
    expect(Object.keys(languages).sort()).toEqual([...ACTIVE_LOCALES, "x-default"].sort());
    expect(languages.de).toBe("https://www.track.site/de/pricing");
    expect(languages.en).toBe("https://www.track.site/en/pricing");
    expect(languages["x-default"]).toBe("https://www.track.site/en/pricing");
    // reciprocal: the English page lists exactly the same set
    expect(alternatesFor("/pricing", "en").languages).toEqual(de.languages);
    expect(alternatesFor("/pricing", "en").canonical).toBe("https://www.track.site/en/pricing");
  });
});

describe("pageMetadata", () => {
  it("combines title, description, alternates and the Open Graph locale set", () => {
    const m = pageMetadata({ locale: "de", path: "/features", title: "Funktionen", description: "Beschreibung", openGraph: { type: "article" }, robots: { index: true, follow: false } });
    expect(m.title).toBe("Funktionen");
    expect(m.description).toBe("Beschreibung");
    expect(m.alternates?.canonical).toBe("https://www.track.site/de/features");
    expect((m.alternates?.languages as Record<string, string>)["x-default"]).toBe("https://www.track.site/en/features");
    const og = m.openGraph as Record<string, unknown>;
    expect(og.locale).toBe("de_DE");
    expect(og.url).toBe("https://www.track.site/de/features");
    expect(og.type).toBe("article");
    expect(og.siteName).toBe("Track");
    expect(og.alternateLocale).toEqual(ACTIVE_LOCALES.filter((l) => l !== "de").map((l) => OG_LOCALES[l]));
    expect(m.robots).toEqual({ index: true, follow: false });
  });
  it("adds an RSS alternate when a feed is given and falls back to en_US for unknown locales", () => {
    const m = pageMetadata({ locale: "en", path: "/blog", title: "Blog", description: "d", rss: "https://www.track.site/en/blog/feed.xml" });
    expect((m.alternates as { types?: Record<string, string> }).types).toEqual({ "application/rss+xml": "https://www.track.site/en/blog/feed.xml" });
    expect((pageMetadata({ locale: "zz", path: "/", title: "t", description: "d" }).openGraph as Record<string, unknown>).locale).toBe(OG_LOCALES[DEFAULT_LOCALE]);
  });
});

describe("brand in structured data", () => {
  it("names the organization, website and publisher 'Track' (the domain stays track.site)", () => {
    expect(BRAND_NAME).toBe("Track");
    expect(organizationJsonLd()).toMatchObject({ "@type": "Organization", name: "Track", url: "https://www.track.site/en" });
    expect(websiteJsonLd("de")).toMatchObject({ "@type": "WebSite", name: "Track", url: "https://www.track.site/de", inLanguage: "de" });
    expect(publisherJsonLd("de")).toEqual({ "@type": "Organization", name: "Track", url: "https://www.track.site/de", logo: { "@type": "ImageObject", url: `https://www.track.site${PUBLISHER_LOGO_PATH}` } });
  });
  it("points the publisher logo at a mark that exists in the repository (no 404 logo)", () => {
    expect(publisherLogoUrl()).toBe(`https://www.track.site${PUBLISHER_LOGO_PATH}`);
    expect(organizationJsonLd().logo).toBe(publisherLogoUrl());
    // Next serves `src/app/icon.svg` at `/icon.svg`; a static asset under `public/` would be served at the same path
    const candidates = [path.join(process.cwd(), "src", "app", PUBLISHER_LOGO_PATH), path.join(process.cwd(), "public", PUBLISHER_LOGO_PATH)];
    expect(candidates.some((p) => existsSync(p)), `${PUBLISHER_LOGO_PATH} must exist as ${candidates.join(" or ")}`).toBe(true);
  });
});

describe("sitemaps", () => {
  it("names, parses and indexes one pages + one knowledge sitemap per active locale", () => {
    expect(sitemapName("pages", "de")).toBe("pages-de.xml");
    expect(parseSitemapName("knowledge-en.xml")).toEqual({ section: "knowledge", locale: "en" });
    expect(parseSitemapName("pages-en.xml.bak")).toBeNull();
    expect(parseSitemapName("other-en.xml")).toBeNull();
    const index = sitemapIndexXml();
    expect(index.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const l of ACTIVE_LOCALES) {
      expect(index).toContain(`<loc>https://www.track.site/sitemaps/pages-${l}.xml</loc>`);
      expect(index).toContain(`<loc>https://www.track.site/sitemaps/knowledge-${l}.xml</loc>`);
    }
    expect((index.match(/<sitemap>/g) ?? []).length).toBe(ACTIVE_LOCALES.length * 2);
  });
  it("writes localized locs with reciprocal xhtml alternates and x-default", () => {
    const xml = sitemapUrlsetXml([{ path: "/", priority: 1, changeFrequency: "weekly", lastModified: new Date("2026-09-03T00:00:00Z") }, { path: "/blog/a&b" }], "de");
    expect(xml).toContain("<loc>https://www.track.site/de</loc>");
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://www.track.site/en"/>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="de" href="https://www.track.site/de"/>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://www.track.site/en"/>');
    expect(xml).toContain("<lastmod>2026-09-03T00:00:00.000Z</lastmod><changefreq>weekly</changefreq><priority>1</priority>");
    expect(xml).toContain("<loc>https://www.track.site/de/blog/a&amp;b</loc>");
    expect(xml).not.toContain("a&b");
  });
});
