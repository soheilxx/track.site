import { listPosts } from "@/lib/blog";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** RSS 2.0 feed per locale. */
export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return new Response("not found", { status: 404 });
  const posts = await listPosts(locale);
  const items = posts
    .map((p) => `<item><title>${esc(p.title)}</title><link>${absoluteUrl(`/blog/${p.slug}`, locale)}</link><guid isPermaLink="true">${absoluteUrl(`/blog/${p.slug}`, locale)}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${esc(p.description)}</description><category>${esc(p.category)}</category></item>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>track.site blog</title><link>${absoluteUrl("/blog", locale)}</link><atom:link href="${absoluteUrl("/blog/feed.xml", locale)}" rel="self" type="application/rss+xml"/><description>Server-side tracking, consent and attribution guides</description><language>${locale}</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
