import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Container } from "@track-site/ui";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { FORM_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

const COPY = {
  en: { title: "Book a demo", intro: "Thirty minutes with an engineer: we set up a destination on your real site, send a test event and walk through consent, deduplication and the debugger.", agenda: ["Your stack: platform, CMP, current tags and pain points", "Live setup of one destination with the assistant", "Consent policy, click ids and offline conversions for your case", "Pricing, migration plan and data processing agreement"], placeholder: "Which platforms and shop system do you use, and what should we show?" },
  de: { title: "Demo buchen", intro: "Dreißig Minuten mit einem Engineer: Wir richten eine Destination auf deiner echten Site ein, senden einen Testevent und gehen Consent, Deduplizierung und den Debugger durch.", agenda: ["Dein Stack: Plattform, CMP, aktuelle Tags und Schmerzpunkte", "Live-Einrichtung einer Destination mit dem Assistenten", "Consent-Policy, Click-IDs und Offline-Conversions für deinen Fall", "Preise, Migrationsplan und Auftragsverarbeitungsvertrag"], placeholder: "Welche Plattformen und welches Shopsystem nutzt ihr, und was sollen wir zeigen?" },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return pageMetadata({ locale, path: "/demo", title: seoTitle(c.title), description: seoDescription(c.intro) });
}

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.title, path: "/demo" }], locale)} />
      <Container className="grid gap-10 py-14 md:grid-cols-[1fr_1.2fr] md:py-20">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
          <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
          <ul className="mt-6 space-y-2">
            {c.agenda.map((a) => (
              <li key={a} className="inline-flex items-start gap-2 text-sm text-ink-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {a}
              </li>
            ))}
          </ul>
        </div>
        <ContactForm kind="demo" locale={locale} copy={pick(locale, FORM_COPY)} messagePlaceholder={c.placeholder} />
      </Container>
    </>
  );
}
