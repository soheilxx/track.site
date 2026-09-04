import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE, isKnownLocale, isLocale, routing, type AppLocale } from "@/i18n/routing";
import { CARD_CONTENT_TYPE, CARD_SIZE, SocialCard } from "./(marketing)/tracking-knowledge/social-card";

/**
 * Default 1200×630 social card for every `/[locale]/**` page that does not define its own
 * (file-based Open Graph image for the whole marketing tree; the knowledge index and articles
 * override it with their own cards). One tagline and one footer line per programme locale — the
 * tagline matches `meta.defaultTitle` of the locale's message catalog (without the "Track –" prefix).
 */
export const dynamic = "force-static";
export const size = CARD_SIZE;
export const contentType = CARD_CONTENT_TYPE;
export const alt = "Track";

const TAGLINE: Record<AppLocale, string> = {
  en: "AI-first tag manager and server-side event router",
  de: "AI-first Tag Manager und Server-Side Event Router",
  fr: "Tag manager AI-first et routeur d’événements côté serveur",
  es: "Tag manager AI-first y router de eventos server-side",
  it: "Tag manager AI-first e router di eventi server-side",
  nl: "AI-first tagmanager en server-side event router",
};

const FOOTER: Record<AppLocale, string> = {
  en: "One snippet. Every platform. Consent built in.",
  de: "Ein Snippet. Jede Plattform. Consent eingebaut.",
  fr: "Un seul snippet. Toutes les plateformes. Consentement intégré.",
  es: "Un solo snippet. Todas las plataformas. Consentimiento integrado.",
  it: "Un solo snippet. Tutte le piattaforme. Consenso integrato.",
  nl: "Eén snippet. Elk platform. Toestemming ingebouwd.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function DefaultSocialCard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("not found", { status: 404 });
  const l: AppLocale = isKnownLocale(locale) ? locale : DEFAULT_LOCALE;
  return new ImageResponse(<SocialCard title={TAGLINE[l]} footer={FOOTER[l]} />, { ...CARD_SIZE });
}
