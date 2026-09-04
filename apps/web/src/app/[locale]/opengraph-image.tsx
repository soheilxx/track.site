import { ImageResponse } from "next/og";
import { isLocale, routing } from "@/i18n/routing";
import { CARD_CONTENT_TYPE, CARD_SIZE, SocialCard } from "./(marketing)/tracking-knowledge/social-card";

/**
 * Default 1200×630 social card for every `/[locale]/**` page that does not define its own
 * (file-based Open Graph image for the whole marketing tree; the knowledge index and articles
 * override it with their own cards).
 */
export const dynamic = "force-static";
export const size = CARD_SIZE;
export const contentType = CARD_CONTENT_TYPE;
export const alt = "Track";

const TAGLINE = {
  en: "AI-first tag manager and server-side event router",
  de: "AI-first Tag Manager und Server-Side Event Router",
} as const;

const FOOTER = {
  en: "One snippet. Every platform. Consent built in.",
  de: "Ein Snippet. Jede Plattform. Consent eingebaut.",
} as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function DefaultSocialCard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("not found", { status: 404 });
  const l = locale === "de" ? "de" : "en";
  return new ImageResponse(<SocialCard title={TAGLINE[l]} footer={FOOTER[l]} />, { ...CARD_SIZE });
}
