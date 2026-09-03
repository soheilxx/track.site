import { sitemapIndexXml } from "@/lib/seo";

export const dynamic = "force-static";

/** Sitemap index: one `pages` and one `knowledge` sitemap per active locale under /sitemaps/. */
export function GET() {
  return new Response(sitemapIndexXml(), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
