import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/marketing/json-ld";
import { FeatureGrid, FinalCta, PageHero, Section } from "@/components/marketing/page-shell";
import { FEATURES, pick } from "@/lib/marketing-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

const COPY = {
  en: { eyebrow: "Features", title: "Everything a modern tag manager should have done years ago", text: "AI-guided setup, a consent-aware server-side router for 22 destination types, an event debugger with lineage and a health score that tells you what to fix.", cta: "Start with your domain", ctaText: "Free to start. Signed configuration, EU data plane, no code on your site beyond one snippet.", secondary: "See how it works" },
  de: { eyebrow: "Funktionen", title: "Alles, was ein moderner Tag-Manager schon vor Jahren hätte können sollen", text: "KI-geführte Einrichtung, ein consent-konformer serverseitiger Router für 22 Destinationstypen, ein Event-Debugger mit Herkunft und ein Health-Score, der sagt, was zu tun ist.", cta: "Mit deiner Domain starten", ctaText: "Kostenlos starten. Signierte Konfiguration, EU-Datenebene, kein Code auf deiner Site außer einem Snippet.", secondary: "So funktioniert es" },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return { title: seoTitle(c.eyebrow), description: seoDescription(c.text), alternates: alternatesFor("/features", locale) };
}

export default async function FeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  const features = pick(locale, FEATURES);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.eyebrow, path: "/features" }], locale)} />
      <PageHero eyebrow={c.eyebrow} title={c.title} text={c.text} />
      <Section>
        <FeatureGrid items={features.map((f) => ({ title: f.title, text: f.short, href: `/features/${f.slug}` }))} columns={3} />
      </Section>
      <FinalCta title={c.cta} text={c.ctaText} primary={{ label: c.cta, href: "/signup" }} secondary={{ label: c.secondary, href: "/how-it-works" }} />
    </>
  );
}
