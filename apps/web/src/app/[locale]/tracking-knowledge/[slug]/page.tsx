import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { Badge, Card, Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { LocalizedPathsFor } from "@/components/marketing/localized-paths";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CONTENT_TYPE_LABELS, KNOWLEDGE_NAME, KNOWLEDGE_PATH, LEVEL_LABELS, articlePath, authorFor, getArticle, labelFor, listArticles, pathsForGroup, relatedArticles, socialCardAlt, topicLabel } from "@/lib/knowledge";
import { BRAND_NAME, absoluteUrl, breadcrumbJsonLd, pageMetadata, publisherJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";
import { formatDate, knowledgeCopy, readingLabel } from "../copy";
import { CARD_SIZE } from "../social-card";

export async function generateStaticParams() {
  const params: Array<{ locale: string; slug: string }> = [];
  for (const locale of routing.locales) for (const a of await listArticles(locale)) params.push({ locale, slug: a.slug });
  return params;
}

/** Absolute URL of the article's generated 1200×630 social card (`opengraph-image.tsx` next to this page). */
function socialCardUrl(locale: string, slug: string): string {
  return absoluteUrl(`${articlePath(slug)}/opengraph-image`, locale);
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
    localizedPaths: await pathsForGroup(article.translationGroupId),
    title,
    description,
    openGraph: { type: "article", publishedTime: article.publishedAt, modifiedTime: article.updatedAt ?? undefined, authors: [author.displayName], section: topicLabel(article.topic, locale), tags: article.tags, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  });
}

export default async function KnowledgeArticle({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const article = await getArticle(locale, slug);
  if (!article || article.status !== "published") notFound();
  const c = knowledgeCopy(locale);
  const author = authorFor(article.author, locale);
  const [related, localizedPaths] = await Promise.all([relatedArticles(locale, article), pathsForGroup(article.translationGroupId)]);
  const canonical = absoluteUrl(articlePath(slug), locale);
  const topic = topicLabel(article.topic, locale);
  const level = labelFor(LEVEL_LABELS[article.level], locale);
  const contentType = labelFor(CONTENT_TYPE_LABELS[article.contentType], locale);
  const imageUrl = socialCardUrl(locale, slug);
  return (
    <>
      {/* language switcher: translation of this article per locale (localized slugs), index for locales without one */}
      <LocalizedPathsFor paths={localizedPaths} fallback={KNOWLEDGE_PATH} />
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: c.breadcrumbHome, path: "/" }, { name: KNOWLEDGE_NAME, path: KNOWLEDGE_PATH }, { name: article.title, path: articlePath(slug) }], locale),
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: article.title,
            description: article.description,
            image: [imageUrl],
            author: { "@type": "Organization", name: BRAND_NAME, url: absoluteUrl("/", locale) },
            publisher: publisherJsonLd(locale),
            mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
            url: canonical,
            datePublished: article.publishedAt,
            dateModified: article.updatedAt ?? article.publishedAt,
            inLanguage: locale,
            keywords: article.tags.join(", "),
            articleSection: topic,
            isPartOf: { "@type": "Blog", name: KNOWLEDGE_NAME, url: absoluteUrl(KNOWLEDGE_PATH, locale) },
          },
        ]}
      />
      <Container className="max-w-3xl py-14 md:py-20">
        <nav className="text-xs text-ink-3" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1.5">
            <li>
              <Link href="/" className="hover:underline">
                {c.breadcrumbHome}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={KNOWLEDGE_PATH} className="hover:underline">
                {KNOWLEDGE_NAME}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={`${KNOWLEDGE_PATH}?topic=${article.topic}`} className="hover:underline">
                {topic}
              </Link>
            </li>
          </ol>
        </nav>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <Badge tone="neutral">{topic}</Badge>
          <span>{contentType}</span>
          <span>· {level}</span>
        </div>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">{article.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{article.description}</p>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>
            {c.by} {author.displayName}
          </span>
          <time dateTime={article.publishedAt}>{formatDate(locale, article.publishedAt)}</time>
          {article.updatedAt ? (
            <span>
              {c.updated} <time dateTime={article.updatedAt}>{formatDate(locale, article.updatedAt)}</time>
            </span>
          ) : null}
          {article.reviewedAt ? (
            <span>
              {c.reviewed} <time dateTime={article.reviewedAt}>{formatDate(locale, article.reviewedAt)}</time>
            </span>
          ) : null}
          <span>{readingLabel(locale, article.readingMinutes)}</span>
          {article.tags.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </p>
        <article className="prose prose-neutral mt-10 max-w-none text-ink-2 prose-headings:font-display prose-headings:text-ink prose-a:text-primary prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-pre:bg-ink prose-pre:text-white">
          <MDXRemote source={article.content} options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]] } }} />
        </article>
        {article.legalNotice ? <p className="mt-8 rounded-xl border border-line bg-surface p-4 text-xs text-ink-3">{c.legal}</p> : null}
        {article.sources.length ? (
          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">{c.sources}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {article.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} rel="noreferrer nofollow" target="_blank" className="text-primary hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Card className="mt-10 p-5">
          <p className="text-sm font-semibold text-ink">{author.displayName}</p>
          <p className="text-xs text-ink-3">{labelFor(author.role, locale)}</p>
          <p className="mt-2 text-sm text-ink-2">{labelFor(author.bio, locale)}</p>
        </Card>
        {related.length ? (
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold text-ink">{c.related}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={articlePath(r.slug)} className="block rounded-xl border border-line bg-surface p-4 text-sm font-medium text-ink hover:border-primary">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>
    </>
  );
}
