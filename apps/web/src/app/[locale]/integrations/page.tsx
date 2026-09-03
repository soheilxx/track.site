import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge, Card } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { FinalCta, PageHero, Section } from "@/components/marketing/page-shell";
import { Link } from "@/i18n/navigation";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { pick } from "@/lib/marketing-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

const COPY = {
  en: { eyebrow: "Integrations", title: "Every destination with browser tag, server API and shared deduplication", text: "Twenty-two destination types, thirteen affiliate network presets and three shop platforms — each fully implemented, documented and tested against the vendor contract. No “coming soon”.", groups: { 1: "Core advertising platforms", 2: "Reach and discovery", 3: "Programmatic, retargeting and affiliate", commerce: "Shop platforms" }, browser: "Browser", server: "Server", offline: "Offline", cta: "Connect your first platform", ctaText: "The wizard walks through identifiers, credentials, mapping and a verified test event in 19 steps.", start: "Start free", how: "How it works" },
  de: { eyebrow: "Integrationen", title: "Jede Destination mit Browser-Tag, Server-API und gemeinsamer Deduplizierung", text: "Zweiundzwanzig Destinationstypen, dreizehn Affiliate-Netzwerk-Presets und drei Shopsysteme — jeweils vollständig umgesetzt, dokumentiert und gegen den Anbieter-Vertrag getestet. Kein „Coming soon“.", groups: { 1: "Zentrale Werbeplattformen", 2: "Reichweite und Discovery", 3: "Programmatic, Retargeting und Affiliate", commerce: "Shopsysteme" }, browser: "Browser", server: "Server", offline: "Offline", cta: "Erste Plattform verbinden", ctaText: "Der Assistent führt in 19 Schritten durch Kennungen, Zugangsdaten, Mapping und einen verifizierten Testevent.", start: "Kostenlos starten", how: "So funktioniert es" },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return { title: seoTitle(c.eyebrow), description: seoDescription(c.text), alternates: alternatesFor("/integrations", locale) };
}

export default async function IntegrationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  const lang = locale === "de" ? "de" : "en";
  const groups = [1, 2, 3, "commerce"] as const;
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.eyebrow, path: "/integrations" }], locale), { "@context": "https://schema.org", "@type": "ItemList", itemListElement: INTEGRATIONS.map((i, n) => ({ "@type": "ListItem", position: n + 1, name: i.name })) }]} />
      <PageHero eyebrow={c.eyebrow} title={c.title} text={c.text} />
      {groups.map((g) => (
        <Section key={String(g)} title={c.groups[g]} tone={g === 2 || g === "commerce" ? "muted" : "default"}>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.filter((i) => i.group === g).map((i) => (
              <li key={i.slug}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-ink">
                      <Link href={`/integrations/${i.slug}`} className="hover:underline">
                        {i.name}
                      </Link>
                    </h3>
                    <span className="flex gap-1">
                      {i.browser ? <Badge tone="neutral">{c.browser}</Badge> : null}
                      {i.server ? <Badge tone="neutral">{c.server}</Badge> : null}
                      {i.offline ? <Badge tone="neutral">{c.offline}</Badge> : null}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-2">{i.summary[lang]}</p>
                  {i.accessNote ? <p className="mt-2 text-xs text-warn">{i.accessNote[lang]}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      <FinalCta title={c.cta} text={c.ctaText} primary={{ label: c.start, href: "/signup" }} secondary={{ label: c.how, href: "/how-it-works" }} />
    </>
  );
}
