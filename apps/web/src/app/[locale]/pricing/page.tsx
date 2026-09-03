import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Badge, Button, Card } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Faq, FinalCta, PageHero, Section, faqJsonLd } from "@/components/marketing/page-shell";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/marketing-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";
import { publicPlans } from "@/server/pricing";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export const dynamic = "force-dynamic";

const COPY = {
  en: {
    eyebrow: "Pricing",
    title: "Plans that grow with your event volume",
    text: "Every plan includes the AI-guided setup, consent-aware browser and server delivery, the event debugger and EU data processing. Prices are billed by Stripe; the amounts below come directly from the configured Stripe prices.",
    perMonth: "per month",
    perYear: "per year",
    notConfigured: "Price not published yet — pricing for this plan is being finalized. Contact us for a quote.",
    contactSales: "Talk to sales",
    start: "Start free",
    limits: (l: { sites: number; eventsPerMonth: number; destinations: number; retentionDays: number; teamMembers: number; serverSide: boolean; exports: boolean; sso: boolean }) => [
      `${l.sites === 1 ? "1 site" : `${l.sites} sites`}`,
      `${l.eventsPerMonth.toLocaleString("en")} accepted events per month`,
      `${l.destinations >= 99 ? "All destinations" : `${l.destinations} destinations`}`,
      `${l.retentionDays} days event retention`,
      `${l.teamMembers} team members`,
      l.serverSide ? "Server-side delivery and offline conversions" : "Browser delivery",
      l.exports ? "Exports and DSAR reports" : "Standard privacy center",
      l.sso ? "SSO, SLA and dedicated processing" : "E-mail support",
    ],
    included: "Included in every plan",
    includedItems: ["AI setup assistant with approval-gated publishing", "Consent policy engine, Consent Mode v2, CMP adapters", "Signed configuration versions with rollback", "Event debugger with lineage and redacted payloads", "EU data plane, row-level tenant isolation, audit log"],
    faq: [
      { q: "What counts as an accepted event?", a: "An event that passed validation and consent policy and was stored. Dropped events (no consent, PII blocked, duplicates) are not billed." },
      { q: "What happens when I reach the limit?", a: "You are warned at 80 % and 100 %. Above the soft limit collection continues for a grace period; the dashboard shows the state honestly and you can upgrade at any time." },
      { q: "Can I cancel?", a: "Yes, monthly plans cancel at the end of the period through the Stripe portal. Data is retained for the configured retention window and can be exported." },
    ],
    cta: "Start with the free tier",
    ctaText: "No credit card needed to create a site and configure your first destination.",
  },
  de: {
    eyebrow: "Preise",
    title: "Tarife, die mit deinem Eventvolumen wachsen",
    text: "Jeder Tarif enthält die KI-geführte Einrichtung, consent-konforme Browser- und Server-Zustellung, den Event-Debugger und EU-Datenverarbeitung. Abgerechnet wird über Stripe; die Beträge unten stammen direkt aus den konfigurierten Stripe-Preisen.",
    perMonth: "pro Monat",
    perYear: "pro Jahr",
    notConfigured: "Preis noch nicht veröffentlicht — die Preisgestaltung für diesen Tarif wird gerade finalisiert. Kontaktiere uns für ein Angebot.",
    contactSales: "Mit dem Vertrieb sprechen",
    start: "Kostenlos starten",
    limits: (l: { sites: number; eventsPerMonth: number; destinations: number; retentionDays: number; teamMembers: number; serverSide: boolean; exports: boolean; sso: boolean }) => [
      `${l.sites === 1 ? "1 Site" : `${l.sites} Sites`}`,
      `${l.eventsPerMonth.toLocaleString("de")} akzeptierte Events pro Monat`,
      `${l.destinations >= 99 ? "Alle Destinationen" : `${l.destinations} Destinationen`}`,
      `${l.retentionDays} Tage Event-Aufbewahrung`,
      `${l.teamMembers} Teammitglieder`,
      l.serverSide ? "Serverseitige Zustellung und Offline-Conversions" : "Browser-Zustellung",
      l.exports ? "Exporte und DSAR-Berichte" : "Standard-Datenschutz-Center",
      l.sso ? "SSO, SLA und dedizierte Verarbeitung" : "E-Mail-Support",
    ],
    included: "In jedem Tarif enthalten",
    includedItems: ["KI-Einrichtungsassistent mit freigabepflichtiger Veröffentlichung", "Consent-Policy-Engine, Consent Mode v2, CMP-Adapter", "Signierte Konfigurationsversionen mit Rollback", "Event-Debugger mit Herkunft und geschwärzten Payloads", "EU-Datenebene, Row-Level-Mandantentrennung, Audit-Log"],
    faq: [
      { q: "Was zählt als akzeptiertes Event?", a: "Ein Event, das Validierung und Consent-Policy bestanden hat und gespeichert wurde. Verworfene Events (kein Consent, PII blockiert, Duplikate) werden nicht berechnet." },
      { q: "Was passiert beim Erreichen des Limits?", a: "Du wirst bei 80 % und 100 % gewarnt. Über dem Soft-Limit läuft die Erfassung für eine Frist weiter; das Dashboard zeigt den Zustand ehrlich an und du kannst jederzeit upgraden." },
      { q: "Kann ich kündigen?", a: "Ja, Monatstarife enden zum Periodenende über das Stripe-Portal. Daten bleiben für die konfigurierte Aufbewahrungsfrist erhalten und können exportiert werden." },
    ],
    cta: "Mit dem kostenlosen Einstieg beginnen",
    ctaText: "Keine Kreditkarte nötig, um eine Site anzulegen und die erste Destination zu konfigurieren.",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return { title: seoTitle(c.eyebrow), description: seoDescription(c.text), alternates: alternatesFor("/pricing", locale) };
}

function money(v: { amount: number; currency: string }, locale: string): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-IE", { style: "currency", currency: v.currency, maximumFractionDigits: 0 }).format(v.amount);
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  const plans = await publicPlans();
  const offers = plans.filter((p) => p.monthly).map((p) => ({ "@type": "Offer", name: p.name, price: p.monthly!.amount, priceCurrency: p.monthly!.currency, category: "subscription" }));
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.eyebrow, path: "/pricing" }], locale), faqJsonLd(c.faq), ...(offers.length ? [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "track.site", applicationCategory: "BusinessApplication", operatingSystem: "Web", offers }] : [])]} />
      <PageHero eyebrow={c.eyebrow} title={c.title} text={c.text} />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <li key={p.id}>
              <Card className={`flex h-full flex-col p-5 ${p.id === "growth" ? "border-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-ink">{p.name}</h2>
                  {p.id === "growth" ? <Badge tone="ok">{locale === "de" ? "Beliebt" : "Popular"}</Badge> : null}
                </div>
                <div className="mt-3 min-h-[3.5rem]">
                  {p.contactSales ? (
                    <p className="text-sm text-ink-2">{locale === "de" ? "Individuelles Volumen, Vertrag und SLA." : "Custom volume, contract and SLA."}</p>
                  ) : p.monthly ? (
                    <p>
                      <span className="font-display text-3xl font-bold text-ink">{money(p.monthly, locale)}</span> <span className="text-sm text-ink-3">{c.perMonth}</span>
                      {p.yearly ? (
                        <span className="block text-xs text-ink-3">
                          {money(p.yearly, locale)} {c.perYear}
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-xs text-warn">{c.notConfigured}</p>
                  )}
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
                  {c.limits(p.limits).map((l) => (
                    <li key={l} className="inline-flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {l}
                    </li>
                  ))}
                  {p.features.map((f) => (
                    <li key={f} className="inline-flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <Link href={p.contactSales ? "/contact?topic=enterprise" : "/signup"}>
                    <Button variant={p.id === "growth" ? "primary" : "secondary"} className="w-full">
                      {p.contactSales ? c.contactSales : c.start}
                    </Button>
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={c.included} tone="muted">
        <ul className="grid gap-2 sm:grid-cols-2">
          {c.includedItems.map((i) => (
            <li key={i} className="inline-flex items-start gap-2 text-sm text-ink-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {i}
            </li>
          ))}
        </ul>
      </Section>
      <Section>
        <Faq items={c.faq} />
      </Section>
      <FinalCta title={c.cta} text={c.ctaText} primary={{ label: c.start, href: "/signup" }} secondary={{ label: c.contactSales, href: "/contact?topic=enterprise" }} />
    </>
  );
}
