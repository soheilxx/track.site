import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Container, cn } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { KeyTakeaways, PrimarySources, ResponsibleEditor, TrackCta } from "@/components/marketing/knowledge/article/blocks";
import { ArticleFeedback } from "@/components/marketing/knowledge/article/feedback";
import { ArticleHeader } from "@/components/marketing/knowledge/article/header";
import { articleMdxComponents } from "@/components/marketing/knowledge/article/mdx-components";
import { ReadingProgress } from "@/components/marketing/knowledge/article/reading-progress";
import { RelatedArticles } from "@/components/marketing/knowledge/article/related";
import { ArticleToc } from "@/components/marketing/knowledge/article/toc";
import { LocalizedPathsFor } from "@/components/marketing/localized-paths";
import { routing } from "@/i18n/routing";
import { KNOWLEDGE_NAME, KNOWLEDGE_PATH, articlePath, authorFor, getArticle, labelFor, listArticles, pathsForGroup, socialCardAlt, topicLabel } from "@/lib/knowledge";
import { ARTICLE_BODY_ID, articleExtras, articleSchemaType, compileArticle, ctaForTopic, rankRelated, readingTimeDuration } from "@/lib/knowledge-article";
import { KNOWLEDGE_ARTICLE_COPY } from "@/lib/marketing-copy/knowledge-article";
import { pick } from "@/lib/marketing-copy/pick";
import { absoluteUrl, breadcrumbJsonLd, pageMetadata, publisherJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";
import { CARD_SIZE } from "../social-card";

/*
 * Tracking Knowledge article (redesign supplement §6 "Neues Artikeltemplate"): breadcrumbs, topic /
 * level / intro, responsible editor (the editorial team record), published / updated / reviewed
 * dates, reading time + progress, sticky table of contents, 65–75 ch text column, key takeaways,
 * MDX blocks (tables, steps, diagrams, code with copy, callouts), primary sources, a topic-specific
 * Track CTA, related articles, feedback and a print stylesheet. Server component; the only client
 * islands are the progress bar, the feedback buttons and the code-block copy button.
 */

export async function generateStaticParams() {
  const params: Array<{ locale: string; slug: string }> = [];
  for (const locale of routing.locales) for (const a of await listArticles(locale)) params.push({ locale, slug: a.slug });
  return params;
}

/** Absolute URL of the article's generated 1200×630 social card (`card.png/route.tsx`, a stable route instead of the hashed opengraph-image convention). */
function socialCardUrl(locale: string, slug: string): string {
  return absoluteUrl(`${articlePath(slug)}/card.png`, locale);
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await getArticle(locale, slug);
  if (!article || article.status !== "published") return {};
  const author = authorFor(article.author, locale);
  const image = { url: socialCardUrl(locale, slug), width: CARD_SIZE.width, height: CARD_SIZE.height, alt: socialCardAlt(article.title, locale) };
  const title = seoTitle(article.title);
  const description = seoDescription(article.description);
  return pageMetadata({
    locale,
    path: articlePath(slug),
    // canonical + hreflang from the localized slugs of every published version (never an English fallback)
    localizedPaths: await pathsForGroup(article.translationGroupId),
    title,
    description,
    openGraph: { type: "article", publishedTime: article.publishedAt, modifiedTime: article.updatedAt ?? undefined, authors: [author.displayName], section: topicLabel(article.topic, locale), tags: article.tags, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  });
}

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const article = await getArticle(locale, slug);
  if (!article || article.status !== "published") notFound();
  const copy = pick(locale, KNOWLEDGE_ARTICLE_COPY);
  const author = authorFor(article.author, locale);
  const [{ content, headings }, extras, published, localizedPaths] = await Promise.all([
    compileArticle(article.content, articleMdxComponents(copy)),
    articleExtras(locale, article.translationGroupId),
    listArticles(locale),
    pathsForGroup(article.translationGroupId),
  ]);
  const related = rankRelated(published, article, 3);
  const cta = ctaForTopic(article.topic);
  const topic = topicLabel(article.topic, locale);
  const canonical = absoluteUrl(articlePath(slug), locale);
  const imageUrl = socialCardUrl(locale, slug);
  const schemaType = articleSchemaType(article.contentType);
  const hasToc = headings.length >= 2;
  const hasTakeaways = extras.takeaways.length > 0;
  return (
    <>
      <ReadingProgress targetId={ARTICLE_BODY_ID} label={copy.progress} />
      {/* language switcher: translation of this article per locale (localized slugs), index for locales without one */}
      <LocalizedPathsFor paths={localizedPaths} fallback={KNOWLEDGE_PATH} />
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: copy.breadcrumbs.home, path: "/" }, { name: KNOWLEDGE_NAME, path: KNOWLEDGE_PATH }, { name: article.title, path: articlePath(slug) }], locale),
          {
            "@context": "https://schema.org",
            // TechArticle for reference/tutorial content, BlogPosting otherwise (supplement §6)
            "@type": schemaType,
            headline: article.title,
            description: article.description,
            image: [imageUrl],
            // the responsible editor is the editorial team record, never an invented person
            author: { "@type": "Organization", name: author.displayName, url: absoluteUrl(KNOWLEDGE_PATH, locale) },
            publisher: publisherJsonLd(locale),
            mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
            url: canonical,
            datePublished: article.publishedAt,
            dateModified: article.updatedAt ?? article.publishedAt,
            inLanguage: locale,
            keywords: article.tags.join(", "),
            articleSection: topic,
            timeRequired: readingTimeDuration(article.readingMinutes),
            ...(schemaType === "TechArticle" && article.level !== "intermediate" ? { proficiencyLevel: article.level === "beginner" ? "Beginner" : "Expert" } : {}),
          },
        ]}
      />
      <article>
        <div className="border-b border-line bg-surface">
          <Container className="py-8 md:py-12">
            <ArticleHeader article={article} locale={locale} copy={copy} editorName={author.displayName} />
          </Container>
        </div>
        <Container className="py-10 md:py-14">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start lg:gap-16 xl:grid-cols-[minmax(0,1fr)_16rem]">
            <ArticleToc headings={headings} label={copy.toc} className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1" />
            <div className={cn("min-w-0 lg:col-start-1 lg:row-start-1 lg:mt-0", hasToc && "mt-8")}>
              <KeyTakeaways heading={copy.takeaways} items={extras.takeaways} />
              <div id={ARTICLE_BODY_ID} className={cn("prose-track", hasTakeaways && "mt-10")}>
                {content}
              </div>
              {article.legalNotice ? <p className="mt-10 max-w-[70ch] border-t border-line pt-4 text-small text-ink-3">{copy.legal}</p> : null}
              <PrimarySources heading={copy.sources.heading} text={copy.sources.text} sources={article.sources} />
              <div className="mt-12 max-w-[70ch]">
                <ArticleFeedback translationGroupId={article.translationGroupId} locale={locale} labels={copy.feedback} />
              </div>
              <TrackCta eyebrow={copy.cta.eyebrow} item={copy.cta.items[cta.key]} href={cta.href} />
              <ResponsibleEditor heading={copy.editor} name={author.displayName} role={labelFor(author.role, locale)} bio={labelFor(author.bio, locale)} />
            </div>
          </div>
        </Container>
      </article>
      <RelatedArticles heading={copy.related} items={related} locale={locale} minutesTemplate={copy.meta.minutes} />
    </>
  );
}
