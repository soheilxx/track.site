import { routing } from "@/i18n/routing";
import { KNOWLEDGE_NAME, KNOWLEDGE_PATH, articlePath, listArticles, topicLabel } from "@/lib/knowledge";
import { absoluteUrl } from "@/lib/seo";
import { knowledgeCopy } from "../copy";

export const dynamic = "force-static";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** RSS 2.0 feed of the published Tracking Knowledge articles per locale. */
export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return new Response("not found", { status: 404 });
  const c = knowledgeCopy(locale);
  const articles = await listArticles(locale);
  const items = articles
    .map((a) => {
      const url = absoluteUrl(articlePath(a.slug), locale);
      return `<item><title>${esc(a.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate><description>${esc(a.description)}</description><category>${esc(topicLabel(a.topic, locale))}</category></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(`Track ${KNOWLEDGE_NAME}`)}</title><link>${absoluteUrl(KNOWLEDGE_PATH, locale)}</link><atom:link href="${absoluteUrl(`${KNOWLEDGE_PATH}/feed.xml`, locale)}" rel="self" type="application/rss+xml"/><description>${esc(c.feedDescription)}</description><language>${locale}</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
