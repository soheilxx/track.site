import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { FORM_COPY, pick } from "@/lib/marketing-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";


const COPY = {
  en: { title: "Contact", intro: "Questions about plans, enterprise volume, data processing agreements or partnerships. We answer within one business day.", enterprise: "Enterprise request: individual volume, SSO, SLA, dedicated processing." },
  de: { title: "Kontakt", intro: "Fragen zu Tarifen, Enterprise-Volumen, Auftragsverarbeitung oder Partnerschaften. Wir antworten innerhalb eines Werktags.", enterprise: "Enterprise-Anfrage: individuelles Volumen, SSO, SLA, dedizierte Verarbeitung." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return { title: c.title, description: c.intro, alternates: alternatesFor("/contact", locale) };
}

export default async function ContactPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ topic?: string }> }) {
  const { locale } = await params;
  const { topic } = await searchParams;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.title, path: "/contact" }], locale), { "@context": "https://schema.org", "@type": "ContactPage", name: c.title }]} />
      <Container className="max-w-2xl py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
        {topic === "enterprise" ? <p className="mt-3 rounded-xl bg-primary-soft px-4 py-2 text-sm text-primary">{c.enterprise}</p> : null}
        <div className="mt-8">
          <ContactForm kind="contact" locale={locale} topic={topic === "enterprise" ? "enterprise" : undefined} copy={pick(locale, FORM_COPY)} />
        </div>
      </Container>
    </>
  );
}
