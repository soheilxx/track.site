import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { JsonLd } from "@/components/marketing/json-ld";
import { HubEditorial } from "@/components/marketing/knowledge/hub/editorial";
import { HubProvider } from "@/components/marketing/knowledge/hub/provider";
import { DirectorySection, FeaturedStory, FreshLists, HubHero, LearningPaths, PlatformGuides, ProductCta, TopicWorlds } from "@/components/marketing/knowledge/hub/sections";
import { buildHubSearchResponse, getHubData, hubCopy, hubLabels, islandCopy } from "@/components/marketing/knowledge/hub/server";
import { fill } from "@/components/marketing/knowledge/hub/text";
import { KNOWLEDGE_NAME, KNOWLEDGE_PATH, KNOWLEDGE_TAXONOMY, topicLabel } from "@/lib/knowledge";
import { hasHubQuery, parseHubQuery } from "@/lib/knowledge-search";
import { absoluteUrl, breadcrumbJsonLd, localizedPath, pageMetadata, publisherJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";
import { knowledgeCopy } from "./copy";
import { CARD_SIZE } from "./social-card";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const { locale } = await params;
  const c = hubCopy(locale);
  const query = parseHubQuery(await searchParams, KNOWLEDGE_TAXONOMY);
  const image = { url: absoluteUrl(`${KNOWLEDGE_PATH}/opengraph-image`, locale), width: CARD_SIZE.width, height: CARD_SIZE.height, alt: knowledgeCopy(locale).cardAlt };
  const description = seoDescription(c.meta.description);
  const topic = query.topic ? topicLabel(query.topic, locale) : null;
  const title = query.q ? seoTitle(fill(c.meta.searchTitle, { q: query.q })) : topic ? seoTitle(`${topic} · ${KNOWLEDGE_NAME}`) : seoTitle(KNOWLEDGE_NAME);
  return pageMetadata({
    locale,
    path: KNOWLEDGE_PATH,
    title,
    description,
    rss: absoluteUrl(`${KNOWLEDGE_PATH}/feed.xml`, locale),
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image", title: KNOWLEDGE_NAME, description, images: [image] },
    // search results and filtered listings carry no editorial value of their own (supplement §6): follow, but do not index
    ...(hasHubQuery(query) ? { robots: { index: false, follow: true } } : {}),
  });
}

/**
 * Tracking Knowledge hub (supplement §6): hero with an immediately usable search, one large featured
 * story, topic worlds and curated learning paths, platform and shop-system guides, "newly published"
 * and "recently updated", the complete filterable directory and a restrained product CTA.
 *
 * The URL is the state (`?q=&topic=&platform=&shop=&type=&level=&recency=`): this server page renders
 * the initial result set from it; the client island keeps the URL in sync with `history.replaceState`
 * and fetches live results through a server action, so the index never ships to the browser.
 */
export default async function KnowledgeHub({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = hubCopy(locale);
  const labels = hubLabels(locale);
  const query = parseHubQuery(await searchParams, KNOWLEDGE_TAXONOMY);
  const [response, data] = await Promise.all([buildHubSearchResponse(locale, query), getHubData(locale)]);
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: c.breadcrumbs.home, path: "/" }, { name: KNOWLEDGE_NAME, path: KNOWLEDGE_PATH }], locale),
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: KNOWLEDGE_NAME,
            description: c.meta.description,
            url: absoluteUrl(KNOWLEDGE_PATH, locale),
            inLanguage: locale,
            publisher: publisherJsonLd(locale),
          },
        ]}
      />
      <Suspense fallback={null}>
        <HubProvider locale={locale} copy={islandCopy(locale)} taxonomy={KNOWLEDGE_TAXONOMY} initial={response}>
          <HubHero copy={c} corpus={response.corpus} topicCount={data.topics.length} languages={data.languages} formAction={localizedPath(KNOWLEDGE_PATH, locale)} rssHref={localizedPath(`${KNOWLEDGE_PATH}/feed.xml`, locale)} />
          <HubEditorial>
            {data.featured ? <FeaturedStory article={data.featured} locale={locale} copy={c} labels={labels} /> : null}
            <TopicWorlds topics={data.topics} copy={c} />
            <LearningPaths paths={data.paths} copy={c} labels={labels} />
            <PlatformGuides platforms={data.guides.platforms} shopSystems={data.guides.shopSystems} copy={c} />
            <FreshLists published={data.published} updated={data.updated} locale={locale} copy={c} labels={labels} />
          </HubEditorial>
          <DirectorySection copy={c} />
        </HubProvider>
      </Suspense>
      <ProductCta copy={c} />
    </>
  );
}
