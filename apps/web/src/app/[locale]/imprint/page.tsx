import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { OperatorBlock } from "@/components/marketing/legal-page";
import { operatorFromEnv } from "@/lib/legal-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";

const COPY = {
  en: { title: "Imprint", intro: "Legal information about the operator of track.site pursuant to § 5 DDG and § 18 MStV.", dispute: "The European Commission provides a platform for online dispute resolution (https://ec.europa.eu/consumers/odr). The operator is neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board.", liability: "Despite careful control we assume no liability for the content of external links; the operators of the linked pages are solely responsible for their content." },
  de: { title: "Impressum", intro: "Angaben gemäß § 5 DDG und § 18 MStV zum Betreiber von track.site.", dispute: "Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit (https://ec.europa.eu/consumers/odr). Der Betreiber ist nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.", liability: "Trotz sorgfältiger Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links; für deren Inhalt sind ausschließlich die Betreiber der verlinkten Seiten verantwortlich." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = locale === "de" ? COPY.de : COPY.en;
  return { title: c.title, description: c.intro, alternates: alternatesFor("/imprint", locale), robots: { index: true, follow: false } };
}

export default async function ImprintPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = locale === "de" ? COPY.de : COPY.en;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.title, path: "/imprint" }], locale)} />
      <Container className="max-w-3xl py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
        <OperatorBlock operator={operatorFromEnv()} locale={locale} />
        <p className="mt-8 text-sm text-ink-2">{c.dispute}</p>
        <p className="mt-4 text-sm text-ink-2">{c.liability}</p>
      </Container>
    </>
  );
}
