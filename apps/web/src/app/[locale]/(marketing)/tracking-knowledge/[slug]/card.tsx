import { ImageResponse } from "next/og";
import { isLocale, routing } from "@/i18n/routing";
import { KNOWLEDGE_NAME, LEVEL_LABELS, getArticle, labelFor, listArticles, topicLabel } from "@/lib/knowledge";
import { formatDate, knowledgeCopy, readingLabel } from "../copy";
import { CARD_CONTENT_TYPE, CARD_SIZE, SocialCard } from "../social-card";

/**
 * Locale-specific 1200×630 social card per article (og:image / twitter:image). Prerendered for every
 * published article at build time; the page metadata references this route by absolute URL with a
 * localized alt text. No image files are stored in the repo.
 */
export const size = CARD_SIZE;
export const contentType = CARD_CONTENT_TYPE;
export const alt = `Track ${KNOWLEDGE_NAME}`;

export async function generateStaticParams() {
  const params: Array<{ locale: string; slug: string }> = [];
  for (const locale of routing.locales) for (const a of await listArticles(locale)) params.push({ locale, slug: a.slug });
  return params;
}

export async function renderArticleSocialCard({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return new Response("not found", { status: 404 });
  const article = await getArticle(locale, slug);
  if (!article || article.status !== "published") return new Response("not found", { status: 404 });
  const c = knowledgeCopy(locale);
  const dateLine = article.updatedAt ? `${c.updated} ${formatDate(locale, article.updatedAt)}` : formatDate(locale, article.publishedAt);
  return new ImageResponse(<SocialCard eyebrow={KNOWLEDGE_NAME} title={article.title} meta={[topicLabel(article.topic, locale), labelFor(LEVEL_LABELS[article.level], locale), readingLabel(locale, article.readingMinutes)]} footer={dateLine} />, { ...CARD_SIZE });
}
