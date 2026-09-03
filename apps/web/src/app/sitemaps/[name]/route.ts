import { ACTIVE_LOCALES, isLocale, type AppLocale } from "@/i18n/routing";
import { articlePath, listArticles, pathsForGroup } from "@/lib/knowledge";
import { STATIC_MARKETING_ROUTES } from "@/lib/routes";
import { SITEMAP_SECTIONS, parseSitemapName, sitemapName, sitemapUrlsetXml, type SitemapEntry } from "@/lib/seo";

export const dynamic = "force-static";

export function generateStaticParams() {
  return ACTIVE_LOCALES.flatMap((locale) => SITEMAP_SECTIONS.map((section) => ({ name: sitemapName(section, locale) })));
}

function pageEntries(): SitemapEntry[] {
  const now = new Date();
  return STATIC_MARKETING_ROUTES.map((r) => ({ path: r.path, lastModified: now, changeFrequency: r.changeFrequency, priority: r.priority }));
}

/**
 * Published Tracking Knowledge articles of one locale. Slugs are localized, so every entry carries
 * its own per-locale alternates (only locales with a published version are listed).
 */
async function knowledgeEntries(locale: AppLocale): Promise<SitemapEntry[]> {
  const articles = await listArticles(locale);
  return Promise.all(
    articles.map(async (a) => ({
      path: articlePath(a.slug),
      alternates: await pathsForGroup(a.translationGroupId),
      lastModified: new Date(a.updatedAt ?? a.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  );
}

/** `/sitemaps/pages-<locale>.xml` and `/sitemaps/knowledge-<locale>.xml` for every active locale. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const parsed = parseSitemapName(name);
  if (!parsed || !isLocale(parsed.locale)) return new Response("not found", { status: 404 });
  const entries = parsed.section === "pages" ? pageEntries() : await knowledgeEntries(parsed.locale);
  return new Response(sitemapUrlsetXml(entries, parsed.locale), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
