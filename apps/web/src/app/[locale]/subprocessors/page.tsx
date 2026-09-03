import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { SUBPROCESSORS } from "@/lib/legal-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

const COPY = {
  en: { title: "Subprocessors", intro: "Third parties that process customer data on behalf of the operator, and the advertising vendors that receive events only when a customer configures them as a destination.", name: "Provider", purpose: "Purpose", region: "Region", basis: "Transfer basis", vendors: "Destination vendors (customer-selected)", vendorsText: "Each destination shows its data recipient, region and transfer basis in the setup wizard. Data reaches a vendor only for destinations you enable, only with the consent purpose the destination requires.", updated: "Last updated 2026-09-03. Customers are notified 30 days before changes." },
  de: { title: "Unterauftragsverarbeiter", intro: "Dritte, die Kundendaten im Auftrag des Betreibers verarbeiten, sowie die Werbeanbieter, die Events nur erhalten, wenn ein Kunde sie als Destination konfiguriert.", name: "Anbieter", purpose: "Zweck", region: "Region", basis: "Übermittlungsgrundlage", vendors: "Destinationsanbieter (vom Kunden gewählt)", vendorsText: "Jede Destination zeigt im Einrichtungsassistenten Datenempfänger, Region und Übermittlungsgrundlage. Daten erreichen einen Anbieter nur für aktivierte Destinationen und nur mit dem erforderlichen Consent-Zweck.", updated: "Stand 2026-09-03. Kunden werden 30 Tage vor Änderungen informiert." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = locale === "de" ? COPY.de : COPY.en;
  return pageMetadata({ locale, path: "/subprocessors", title: seoTitle(c.title), description: seoDescription(c.intro) });
}

export default async function SubprocessorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = locale === "de" ? COPY.de : COPY.en;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.title, path: "/subprocessors" }], locale)} />
      <Container className="max-w-4xl py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2">{c.name}</th>
                <th className="px-4 py-2">{c.purpose}</th>
                <th className="px-4 py-2">{c.region}</th>
                <th className="px-4 py-2">{c.basis}</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-4 py-2 text-ink-2">{s.purpose}</td>
                  <td className="px-4 py-2 text-ink-2">{s.region}</td>
                  <td className="px-4 py-2 text-ink-2">{s.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mt-10 font-display text-xl font-semibold text-ink">{c.vendors}</h2>
        <p className="mt-2 text-sm text-ink-2">{c.vendorsText}</p>
        <ul className="mt-4 flex flex-wrap gap-2 text-xs">
          {INTEGRATIONS.filter((i) => i.group !== "commerce" && i.type !== "webhook").map((i) => (
            <li key={i.slug} className="rounded-full border border-line bg-surface px-3 py-1 text-ink-2">
              {i.name}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-ink-3">{c.updated}</p>
      </Container>
    </>
  );
}
