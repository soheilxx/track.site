import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { Link } from "@/i18n/navigation";
import { FORM_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

const COPY = {
  en: { title: "Support", intro: "Customers reach engineering support here. Include your site's tracking ID (six characters, shown in the dashboard) so we can look at the right events — never paste access tokens.", docs: "Check the documentation first", status: "System status", placeholder: "Tracking ID, destination, what you expected and what happened." },
  de: { title: "Support", intro: "Kunden erreichen hier den Engineering-Support. Gib die Tracking-ID deiner Site an (sechs Zeichen, im Dashboard sichtbar), damit wir die richtigen Events prüfen — niemals Access-Tokens einfügen.", docs: "Erst in die Dokumentation schauen", status: "Systemstatus", placeholder: "Tracking-ID, Destination, was du erwartet hast und was passiert ist." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return pageMetadata({ locale, path: "/support", title: seoTitle(c.title), description: seoDescription(c.intro) });
}

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.title, path: "/support" }], locale)} />
      <Container className="max-w-2xl py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
        <p className="mt-3 flex gap-4 text-sm">
          <Link href="/docs" className="text-primary hover:underline">
            {c.docs}
          </Link>
          <Link href="/status" className="text-primary hover:underline">
            {c.status}
          </Link>
        </p>
        <div className="mt-8">
          <ContactForm kind="support" locale={locale} copy={pick(locale, FORM_COPY)} messagePlaceholder={c.placeholder} />
        </div>
      </Container>
    </>
  );
}
