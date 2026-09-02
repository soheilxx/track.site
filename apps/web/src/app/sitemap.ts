import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { listPosts } from "@/lib/blog";
import { STATIC_MARKETING_ROUTES } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";

/** One entry per route and locale with hreflang alternates; lastmod from content where known. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];
  for (const r of STATIC_MARKETING_ROUTES) {
    for (const locale of routing.locales) {
      entries.push({
        url: absoluteUrl(r.path, locale),
        lastModified: now,
        changeFrequency: r.changeFrequency,
        priority: r.priority,
        alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(r.path, l)])) },
      });
    }
  }
  for (const locale of routing.locales) {
    const posts = await listPosts(locale);
    for (const p of posts) {
      entries.push({
        url: absoluteUrl(`/blog/${p.slug}`, locale),
        lastModified: new Date(p.updatedAt ?? p.publishedAt),
        changeFrequency: "monthly",
        priority: 0.7,
        alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(`/blog/${p.slug}`, l)])) },
      });
    }
  }
  return entries;
}
