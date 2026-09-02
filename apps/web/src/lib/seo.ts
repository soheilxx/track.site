import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/** Absolute URLs, canonicals and hreflang pairs from the configured marketing host. */
export function baseUrl(): string {
  return (process.env.HOST_MARKETING ?? "http://localhost:3000").replace(/\/$/, "");
}

export function localizedPath(path: string, locale: string): string {
  const clean = path === "/" ? "" : path.replace(/\/$/, "");
  return locale === routing.defaultLocale ? clean || "/" : `/${locale}${clean}`;
}

export function absoluteUrl(path: string, locale: string = routing.defaultLocale): string {
  return `${baseUrl()}${localizedPath(path, locale)}`;
}

export function alternatesFor(path: string, locale: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = absoluteUrl(path, l);
  languages["x-default"] = absoluteUrl(path, routing.defaultLocale);
  return { canonical: absoluteUrl(path, locale), languages };
}

export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "track.site",
    url: baseUrl(),
    logo: `${baseUrl()}/brand/logo.svg`,
    sameAs: [],
  };
}

export function websiteJsonLd() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: "track.site", url: baseUrl(), inLanguage: ["en", "de"] };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>, locale: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path, locale) })),
  };
}
