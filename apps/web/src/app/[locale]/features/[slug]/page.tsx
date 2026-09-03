import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { JsonLd } from "@/components/marketing/json-ld";
import { Faq, FeatureGrid, FinalCta, PageHero, Section, faqJsonLd } from "@/components/marketing/page-shell";
import { routing } from "@/i18n/routing";
import { FEATURES, pick } from "@/lib/marketing-copy";
import { FEATURE_PAGES } from "@/lib/routes";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => FEATURE_PAGES.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const f = pick(locale, FEATURES).find((x) => x.slug === slug);
  if (!f) return {};
  return pageMetadata({ locale, path: `/features/${slug}`, title: seoTitle(f.title), description: seoDescription(f.short) });
}

const LABELS = { en: { features: "Features", more: "More features", faq: "Questions", cta: "Try it on your domain", ctaText: "Create a site, install one snippet and let the assistant configure the first destination in minutes.", start: "Start free", pricing: "See pricing" }, de: { features: "Funktionen", more: "Weitere Funktionen", faq: "Fragen", cta: "Auf deiner Domain ausprobieren", ctaText: "Site anlegen, ein Snippet installieren und den Assistenten in Minuten die erste Destination einrichten lassen.", start: "Kostenlos starten", pricing: "Preise ansehen" } };

export default async function FeaturePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const all = pick(locale, FEATURES);
  const f = all.find((x) => x.slug === slug);
  if (!f) notFound();
  const l = pick(locale, LABELS);
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: l.features, path: "/features" }, { name: f.title, path: `/features/${slug}` }], locale), faqJsonLd(f.faq)]} />
      <PageHero eyebrow={l.features} title={f.title} text={f.intro} />
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {f.sections.map((s) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-base font-semibold text-ink">{s.title}</h2>
              <p className="mt-2 text-sm text-ink-2">{s.text}</p>
            </div>
          ))}
        </div>
        <ul className="mt-8 grid gap-2 sm:grid-cols-2">
          {f.bullets.map((b) => (
            <li key={b} className="inline-flex items-start gap-2 text-sm text-ink-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {b}
            </li>
          ))}
        </ul>
      </Section>
      <Section title={l.faq} tone="muted">
        <Faq items={f.faq} />
      </Section>
      <Section title={l.more}>
        <FeatureGrid items={all.filter((x) => x.slug !== slug).map((x) => ({ title: x.title, text: x.short, href: `/features/${x.slug}` }))} columns={3} />
      </Section>
      <FinalCta title={l.cta} text={l.ctaText} primary={{ label: l.start, href: "/signup" }} secondary={{ label: l.pricing, href: "/pricing" }} />
    </>
  );
}
