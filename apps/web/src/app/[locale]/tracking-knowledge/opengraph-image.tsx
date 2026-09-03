import { ImageResponse } from "next/og";
import { isLocale, routing } from "@/i18n/routing";
import { KNOWLEDGE_NAME, listArticles } from "@/lib/knowledge";
import { knowledgeCopy } from "./copy";
import { CARD_CONTENT_TYPE, CARD_SIZE, SocialCard } from "./social-card";

/** Locale-specific social card of the Tracking Knowledge index. */
export const dynamic = "force-static";
export const size = CARD_SIZE;
export const contentType = CARD_CONTENT_TYPE;
export const alt = `Track ${KNOWLEDGE_NAME}`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function KnowledgeIndexSocialCard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("not found", { status: 404 });
  const c = knowledgeCopy(locale);
  const count = (await listArticles(locale)).length;
  const countLabel = locale === "de" ? `${count} Artikel` : `${count} ${count === 1 ? "article" : "articles"}`;
  return new ImageResponse(<SocialCard eyebrow={KNOWLEDGE_NAME} title={c.intro} meta={count ? [countLabel] : []} footer={KNOWLEDGE_NAME} />, { ...CARD_SIZE });
}
