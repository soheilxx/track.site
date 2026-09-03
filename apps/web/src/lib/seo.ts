import type { Metadata } from "next";
import { ACTIVE_LOCALES, DEFAULT_LOCALE, OG_LOCALES, isKnownLocale, type AppLocale } from "@/i18n/routing";

/**
 * Absolute URLs, canonicals, hreflang pairs and sitemap XML from the configured marketing host.
 * Every public URL carries a locale prefix (`/en` included); the unprefixed form only exists as a
 * redirect source.
 */
export function baseUrl(): string {
  return (process.env.HOST_MARKETING ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Visible product name in titles, `og:site_name` and structured data (supplement §2); the domain stays `track.site`. */
export const BRAND_NAME = "Track";

/**
 * Locale-neutral path of the mark used as publisher/organization logo in JSON-LD: the 512 px raster
 * export of the Track mark under `public/brand/` (a square PNG is the safest publisher logo for
 * search engines). `seo.test.ts` asserts the file exists so the logo can never silently become a 404.
 */
export const PUBLISHER_LOGO_PATH = "/brand/icon-512.png";

export function publisherLogoUrl(): string {
  return `${baseUrl()}${PUBLISHER_LOGO_PATH}`;
}

/** `publisher` / `author` organization for `BlogPosting`/`Blog` JSON-LD with the real mark as logo. */
export function publisherJsonLd(locale: string = DEFAULT_LOCALE) {
  return { "@type": "Organization", name: BRAND_NAME, url: absoluteUrl("/", locale), logo: { "@type": "ImageObject", url: publisherLogoUrl() } };
}

/** `/pricing` + `de` → `/de/pricing`; `/` + `en` → `/en`. Trailing slashes are dropped. */
export function localizedPath(path: string, locale: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `/${locale}/${clean}` : `/${locale}`;
}

export function absoluteUrl(path: string, locale: string = DEFAULT_LOCALE): string {
  return `${baseUrl()}${localizedPath(path, locale)}`;
}

/** Self-referencing canonical plus reciprocal hreflang for every active locale and `x-default` (English). */
export function alternatesFor(path: string, locale: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of ACTIVE_LOCALES) languages[l] = absoluteUrl(path, l);
  languages["x-default"] = absoluteUrl(path, DEFAULT_LOCALE);
  return { canonical: absoluteUrl(path, locale), languages };
}

/**
 * Canonical + hreflang for a page whose path differs per locale (localized article slugs). Only the
 * locales present in `paths` get an alternate — a missing translation is never announced as an
 * English fallback. `x-default` is the English version when it exists, otherwise the page itself.
 */
export function alternatesForLocalizedPaths(paths: Partial<Record<AppLocale, string>>, locale: string, currentPath: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of ACTIVE_LOCALES) {
    const p = paths[l];
    if (p) languages[l] = absoluteUrl(p, l);
  }
  const defaultPath = paths[DEFAULT_LOCALE];
  languages["x-default"] = defaultPath ? absoluteUrl(defaultPath, DEFAULT_LOCALE) : absoluteUrl(currentPath, locale);
  return { canonical: absoluteUrl(currentPath, locale), languages };
}

export function ogLocale(locale: string): string {
  return isKnownLocale(locale) ? OG_LOCALES[locale] : OG_LOCALES[DEFAULT_LOCALE];
}

export interface PageMetadataInput {
  locale: string;
  /** Locale-neutral path of the page, e.g. `/pricing` or `/tracking-knowledge/some-slug`. */
  path: string;
  title: string | { absolute: string };
  description: string;
  /** Extra Open Graph fields (e.g. `type: "article"`, `publishedTime`, `images`); url, locale and siteName are always set. */
  openGraph?: Record<string, unknown>;
  /** Twitter card fields (e.g. `card: "summary_large_image"` with the same image as Open Graph). */
  twitter?: Metadata["twitter"];
  robots?: Metadata["robots"];
  /** Absolute URL of an RSS feed for this page, emitted as `alternates.types`. */
  rss?: string;
  /**
   * Per-locale paths when the page's slug is localized (knowledge articles). hreflang then uses these
   * instead of `path` for every locale; locales missing here get no alternate.
   */
  localizedPaths?: Partial<Record<AppLocale, string>>;
}

/**
 * Metadata for an indexable localized page: title, description, self canonical, reciprocal hreflang
 * and the Open Graph locale set. Pages must use this instead of ad-hoc objects so no page drops the
 * alternates (a page-level `openGraph` replaces the layout's completely, hence the full set here).
 */
export function pageMetadata({ locale, path, title, description, openGraph, twitter, robots, rss, localizedPaths }: PageMetadataInput): Metadata {
  const alternates = localizedPaths ? alternatesForLocalizedPaths(localizedPaths, locale, path) : alternatesFor(path, locale);
  const alternateLocale = ACTIVE_LOCALES.filter((l) => l !== locale && (!localizedPaths || localizedPaths[l])).map(ogLocale);
  return {
    title,
    description,
    alternates: rss ? { ...alternates, types: { "application/rss+xml": rss } } : alternates,
    openGraph: {
      siteName: BRAND_NAME,
      type: "website",
      url: absoluteUrl(path, locale),
      locale: ogLocale(locale),
      alternateLocale,
      ...openGraph,
    } as Metadata["openGraph"],
    ...(twitter ? { twitter } : {}),
    ...(robots ? { robots } : {}),
  };
}

export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: absoluteUrl("/"),
    logo: publisherLogoUrl(),
    sameAs: [],
  };
}

export function websiteJsonLd(locale: string = DEFAULT_LOCALE) {
  return { "@context": "https://schema.org", "@type": "WebSite", name: BRAND_NAME, url: absoluteUrl("/", locale), inLanguage: locale };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>, locale: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path, locale) })),
  };
}

/* ---------- sitemap index + per-locale/section sitemaps ---------- */

export const SITEMAP_SECTIONS = ["pages", "knowledge"] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

export interface SitemapEntry {
  /** Locale-neutral path; alternates are derived for every active locale unless `alternates` is given. */
  path: string;
  /** Per-locale paths for localized slugs: only the locales listed here get an `xhtml:link` alternate. */
  alternates?: Partial<Record<AppLocale, string>>;
  lastModified?: Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** File name of one sitemap, e.g. `pages-de.xml`; served from `/sitemaps/<name>`. */
export function sitemapName(section: SitemapSection, locale: AppLocale): string {
  return `${section}-${locale}.xml`;
}

export function parseSitemapName(name: string): { section: SitemapSection; locale: string } | null {
  const m = /^(pages|knowledge)-([a-z]{2})\.xml$/.exec(name);
  if (!m) return null;
  return { section: m[1] as SitemapSection, locale: m[2]! };
}

/** Sitemap index listing one pages and one knowledge sitemap per active locale. */
export function sitemapIndexXml(locales: readonly AppLocale[] = ACTIVE_LOCALES): string {
  const items = locales.flatMap((locale) => SITEMAP_SECTIONS.map((section) => `<sitemap><loc>${escapeXml(`${baseUrl()}/sitemaps/${sitemapName(section, locale)}`)}</loc></sitemap>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join("")}</sitemapindex>`;
}

/** URL set for one locale with `xhtml:link` alternates for every active locale plus `x-default`. */
export function sitemapUrlsetXml(entries: readonly SitemapEntry[], locale: AppLocale, locales: readonly AppLocale[] = ACTIVE_LOCALES): string {
  const urls = entries.map((e) => {
    const pathFor = (l: AppLocale): string | undefined => (e.alternates ? e.alternates[l] : e.path);
    const own = pathFor(locale) ?? e.path;
    const xDefault = pathFor(DEFAULT_LOCALE) ? absoluteUrl(pathFor(DEFAULT_LOCALE)!, DEFAULT_LOCALE) : absoluteUrl(own, locale);
    const alternates = [
      ...locales.flatMap((l) => {
        const p = pathFor(l);
        return p ? [`<xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(absoluteUrl(p, l))}"/>`] : [];
      }),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(xDefault)}"/>`,
    ].join("");
    const lastmod = e.lastModified ? `<lastmod>${e.lastModified.toISOString()}</lastmod>` : "";
    const freq = e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : "";
    const prio = e.priority !== undefined ? `<priority>${e.priority}</priority>` : "";
    return `<url><loc>${escapeXml(absoluteUrl(own, locale))}</loc>${lastmod}${freq}${prio}${alternates}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`;
}
