import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeAiSetup } from "@/components/marketing/home/ai-setup";
import { HomeFinalCta } from "@/components/marketing/home/final-cta";
import { HomeFlow } from "@/components/marketing/home/flow";
import { HomeHero } from "@/components/marketing/home/hero";
import { HomeKnowledge } from "@/components/marketing/home/knowledge";
import { HomeOutcomes } from "@/components/marketing/home/outcomes";
import { HomePlatforms } from "@/components/marketing/home/platforms";
import { HomePricingTeaser } from "@/components/marketing/home/pricing-teaser";
import { HomeTrust } from "@/components/marketing/home/trust";
import { HomeUseCases } from "@/components/marketing/home/use-cases";
import { JsonLd } from "@/components/marketing/json-ld";
import { HOME_COPY, pick } from "@/lib/marketing-copy";
import { organizationJsonLd, pageMetadata, websiteJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  // the home page carries the brand itself: no " · Track" template suffix, one complete sentence within snippet length
  return pageMetadata({ locale, path: "/", title: { absolute: seoTitle(t("defaultTitle"), 70) }, description: seoDescription(t("defaultDescription")) });
}

/**
 * Home (supplement §4, recommended sequence): hero with the interactive demo → platforms → three
 * outcomes → Snippet → Track → Platforms flow → guided AI setup → use cases → consent/security/EU
 * trust → selected Tracking Knowledge → pricing teaser → focused final CTA. Server component; only
 * the demo and the domain form hydrate on the client.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = pick(locale, HOME_COPY);
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(locale)]} />
      <HomeHero copy={copy} />
      <HomePlatforms copy={copy} />
      <HomeOutcomes copy={copy} />
      <HomeFlow copy={copy} />
      <HomeAiSetup copy={copy} />
      <HomeUseCases copy={copy} />
      <HomeTrust copy={copy} />
      <HomeKnowledge copy={copy} locale={locale} />
      <HomePricingTeaser copy={copy} locale={locale} />
      <HomeFinalCta copy={copy} />
    </>
  );
}
