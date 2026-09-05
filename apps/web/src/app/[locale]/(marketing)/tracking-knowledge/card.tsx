import { ImageResponse } from "next/og";
import { plural } from "@/components/marketing/knowledge/hub/text";
import { isLocale, routing } from "@/i18n/routing";
import { KNOWLEDGE_NAME, listArticles } from "@/lib/knowledge";
import { KNOWLEDGE_HUB_COPY } from "@/lib/marketing-copy/knowledge";
import { pick } from "@/lib/marketing-copy/pick";
import { knowledgeCopy } from "./copy";
import { CARD_CONTENT_TYPE, CARD_SIZE, SocialCard } from "./social-card";

/** Locale-specific social card of the Tracking Knowledge index. */
export const size = CARD_SIZE;
export const contentType = CARD_CONTENT_TYPE;
export const alt = `Track ${KNOWLEDGE_NAME}`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function renderKnowledgeIndexSocialCard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("not found", { status: 404 });
  const c = knowledgeCopy(locale);
  const count = (await listArticles(locale)).length;
  // "{n} articles" in the locale's own words: the hub's plural copy, not a hard-coded label per language
  const countLabel = plural(pick(locale, KNOWLEDGE_HUB_COPY).hero.articles, count);
  return new ImageResponse(<SocialCard eyebrow={KNOWLEDGE_NAME} title={c.intro} meta={count ? [countLabel] : []} footer={KNOWLEDGE_NAME} />, { ...CARD_SIZE });
}
