import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/marketing/json-ld";
import { Faq, FeatureGrid, FinalCta, PageHero, Section, Steps, faqJsonLd } from "@/components/marketing/page-shell";
import { HOW_IT_WORKS, pick } from "@/lib/marketing-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

const LABELS = { en: { eyebrow: "How it works", arch: "Architecture", archText: "A control plane for people and the assistant, a data plane for events. They share nothing but the signed configuration.", faq: "Questions", cta: "Ready when you are", ctaText: "The first destination is usually live within a quarter of an hour.", start: "Start free", docs: "Read the docs" }, de: { eyebrow: "So funktioniert es", arch: "Architektur", archText: "Eine Control Plane für Menschen und den Assistenten, eine Data Plane für Events. Sie teilen nichts außer der signierten Konfiguration.", faq: "Fragen", cta: "Bereit, wenn du es bist", ctaText: "Die erste Destination ist meist innerhalb einer Viertelstunde live.", start: "Kostenlos starten", docs: "Dokumentation lesen" } };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, HOW_IT_WORKS);
  return { title: seoTitle(c.title), description: seoDescription(c.intro), alternates: alternatesFor("/how-it-works", locale) };
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, HOW_IT_WORKS);
  const l = pick(locale, LABELS);
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: l.eyebrow, path: "/how-it-works" }], locale), faqJsonLd(c.faq), { "@context": "https://schema.org", "@type": "HowTo", name: c.title, step: c.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.text })) }]} />
      <PageHero eyebrow={l.eyebrow} title={c.title} text={c.intro} />
      <Section>
        <Steps items={c.steps} />
      </Section>
      <Section title={l.arch} text={l.archText} tone="muted">
        <FeatureGrid items={c.architecture} columns={4} />
      </Section>
      <Section title={l.faq}>
        <Faq items={c.faq} />
      </Section>
      <FinalCta title={l.cta} text={l.ctaText} primary={{ label: l.start, href: "/signup" }} secondary={{ label: l.docs, href: "/docs" }} />
    </>
  );
}
