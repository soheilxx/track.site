import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge, Card, Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Link } from "@/i18n/navigation";
import { CONTENT_TYPE_LABELS, KNOWLEDGE_NAME, KNOWLEDGE_PATH, LEVEL_LABELS, articlePath, hasFilters, labelFor, listArticles, listTopics, parseFilters, topicLabel } from "@/lib/knowledge";
import { absoluteUrl, breadcrumbJsonLd, localizedPath, pageMetadata, publisherJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";
import { CARD_SIZE } from "./social-card";
import { formatDate, knowledgeCopy, readingLabel } from "./copy";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const { locale } = await params;
  const c = knowledgeCopy(locale);
  const filters = parseFilters(await searchParams);
  const image = { url: absoluteUrl(`${KNOWLEDGE_PATH}/opengraph-image`, locale), width: CARD_SIZE.width, height: CARD_SIZE.height, alt: c.cardAlt };
  const description = seoDescription(c.intro);
  return pageMetadata({
    locale,
    path: KNOWLEDGE_PATH,
    title: seoTitle(KNOWLEDGE_NAME),
    description,
    rss: absoluteUrl(`${KNOWLEDGE_PATH}/feed.xml`, locale),
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image", title: KNOWLEDGE_NAME, description, images: [image] },
    // filtered listings carry no editorial value of their own (supplement §7): follow, but do not index
    ...(hasFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  });
}

/**
 * Tracking Knowledge index. The listing is the existing card list with the new taxonomy (topic,
 * level, content type); the visual hub (search, featured story, learning paths) is a later phase.
 * Filters come from the URL (`?topic=…&platform=…&shop=…&type=…&level=…&recency=…`).
 */
export default async function KnowledgeIndex({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = knowledgeCopy(locale);
  const filters = parseFilters(await searchParams);
  const filtered = hasFilters(filters);
  const [articles, topics] = await Promise.all([listArticles(locale, { filters }), listTopics(locale)]);
  const chip = (active: boolean) => `rounded-full px-3 py-1 ${active ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-3"}`;
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: c.breadcrumbHome, path: "/" }, { name: KNOWLEDGE_NAME, path: KNOWLEDGE_PATH }], locale),
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: KNOWLEDGE_NAME,
            description: c.intro,
            url: absoluteUrl(KNOWLEDGE_PATH, locale),
            inLanguage: locale,
            publisher: publisherJsonLd(locale),
          },
        ]}
      />
      <Container className="py-14 md:py-20">
        <p className="text-sm font-medium text-primary">Track</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">{KNOWLEDGE_NAME}</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">{c.intro}</p>
        <nav aria-label={c.topic} className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          <Link href={KNOWLEDGE_PATH} className={chip(!filters.topic)}>
            {c.all}
          </Link>
          {topics
            .filter((t) => t.count > 0)
            .map((t) => (
              <Link key={t.id} href={`${KNOWLEDGE_PATH}?topic=${t.id}`} className={chip(filters.topic === t.id)} aria-current={filters.topic === t.id ? "page" : undefined}>
                {t.label} ({t.count})
              </Link>
            ))}
          <a href={localizedPath(`${KNOWLEDGE_PATH}/feed.xml`, locale)} className="ml-auto text-xs text-ink-3 hover:text-ink">
            {c.rss}
          </a>
        </nav>
        {filtered ? (
          <p className="mt-4 text-xs text-ink-3">
            {c.filtered} ·{" "}
            <Link href={KNOWLEDGE_PATH} className="text-primary hover:underline">
              {c.reset}
            </Link>
          </p>
        ) : null}
        {articles.length === 0 ? (
          <p className="mt-10 text-sm text-ink-3" role="status">
            {filtered ? c.emptyFiltered : c.empty}
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <li key={a.slug}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <Badge tone="neutral">{topicLabel(a.topic, locale)}</Badge>
                    <span>{labelFor(CONTENT_TYPE_LABELS[a.contentType], locale)}</span>
                    <span>· {labelFor(LEVEL_LABELS[a.level], locale)}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-ink">
                    <Link href={articlePath(a.slug)} className="hover:underline">
                      {a.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-sm text-ink-2">{a.excerpt}</p>
                  <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-4 text-xs text-ink-3">
                    <time dateTime={a.updatedAt ?? a.publishedAt}>
                      {a.updatedAt ? `${c.updated} ` : ""}
                      {formatDate(locale, a.updatedAt ?? a.publishedAt)}
                    </time>
                    <span>· {readingLabel(locale, a.readingMinutes)}</span>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
