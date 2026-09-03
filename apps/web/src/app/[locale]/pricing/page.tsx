import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Badge, Card, buttonVariants, cn } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Faq, FinalCta, PageHero, Section, faqJsonLd } from "@/components/marketing/page-shell";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { publicPlans, usageRulesCopy } from "@/server/pricing";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export const dynamic = "force-dynamic";

const COPY = {
  en: {
    eyebrow: "Pricing",
    title: "Plans that grow with your event volume",
    text: "Every plan includes browser and server-side tracking, all standard destinations, the AI assistant, the consent engine, the live event debugger and EU data processing. List prices are net in EUR, VAT is added where applicable; billing runs through Stripe and monthly billing is the default.",
    perMonth: "per month",
    perYear: "per year",
    yearlyNote: (yearly: string, monthly: string) => `${yearly} per year when paid annually, i.e. ${monthly} per month (ten monthly instalments).`,
    custom: "Custom",
    customText: "Custom volume, contract and SLA.",
    recommended: "Recommended",
    overage: (price: string, events: string) => `Optional overage: ${price} per ${events} additional events, never activated without your choice.`,
    overageContractual: "Overage is agreed in the contract.",
    contactSales: "Talk to sales",
    start: "Get started",
    included: "Included in every plan",
    includedItems: ["AI setup assistant with approval-gated publishing", "Consent policy engine, Consent Mode v2, CMP adapters", "Signed configuration versions with rollback", "Event debugger with lineage and redacted payloads", "EU data plane, row-level tenant isolation, audit log"],
    whatCounts: "What counts as an event?",
    whatCountsText: "An event is counted exactly once when the Track ingestion accepts it. Forwarding the same event to several destinations does not increase usage. Not counted:",
    overageTitle: "Overage and cost control",
    overageText: "You are warned at 70 %, 90 % and 100 % of your monthly event limit and see a usage forecast. Overage is never activated without your explicit choice between:",
    faq: [
      { q: "What counts as a billable event?", a: "An event that the ingestion accepted, counted once. Invalid or rejected events, detected duplicates, technical retries, test and debug events, internal system events and events dropped for missing consent are never billed." },
      { q: "What happens when I reach the limit?", a: "You are warned at 70 %, 90 % and 100 %. Nothing is bought or switched silently: you choose in advance whether to allow event packs, set a monthly cost limit, or pause processing at the limit after the communicated grace window. Upgrades are possible at any time." },
      { q: "Can I cancel?", a: "Yes, monthly plans cancel at the end of the period through the Stripe portal. Data is retained for the configured retention window and can be exported." },
    ],
    cta: "Start with Track",
    ctaText: "No credit card needed to create a site and configure your first destination.",
  },
  de: {
    eyebrow: "Preise",
    title: "Tarife, die mit deinem Eventvolumen wachsen",
    text: "Jeder Tarif enthält Browser- und Server-Side-Tracking, alle Standard-Destinations, den AI-Assistenten, die Consent Engine, den Live Event Debugger und EU-Datenverarbeitung. Listenpreise netto in EUR, zzgl. USt., sofern anwendbar; abgerechnet wird über Stripe, monatliche Abrechnung ist voreingestellt.",
    perMonth: "pro Monat",
    perYear: "pro Jahr",
    yearlyNote: (yearly: string, monthly: string) => `${yearly} pro Jahr bei jährlicher Vorauszahlung, rechnerisch ${monthly} pro Monat (zehn Monatsraten).`,
    custom: "Custom",
    customText: "Individuelles Volumen, Vertrag und SLA.",
    recommended: "Empfohlen",
    overage: (price: string, events: string) => `Optionaler Mehrverbrauch: ${price} je ${events} weitere Events, niemals ungefragt aktiviert.`,
    overageContractual: "Mehrverbrauch wird vertraglich vereinbart.",
    contactSales: "Mit dem Vertrieb sprechen",
    start: "Jetzt starten",
    included: "In jedem Tarif enthalten",
    includedItems: ["KI-Einrichtungsassistent mit freigabepflichtiger Veröffentlichung", "Consent-Policy-Engine, Consent Mode v2, CMP-Adapter", "Signierte Konfigurationsversionen mit Rollback", "Event-Debugger mit Herkunft und geschwärzten Payloads", "EU-Datenebene, Row-Level-Mandantentrennung, Audit-Log"],
    whatCounts: "Was zählt als Event?",
    whatCountsText: "Ein Event wird genau einmal gezählt, wenn es von der Track-Ingestion erfolgreich angenommen wurde. Die Weiterleitung desselben Events an mehrere Destinations erhöht den Verbrauch nicht. Nicht berechnet werden:",
    overageTitle: "Mehrverbrauch und Kostenkontrolle",
    overageText: "Bei 70 %, 90 % und 100 % deines monatlichen Eventlimits wirst du gewarnt und siehst eine Verbrauchsprognose. Mehrverbrauch wird niemals ungefragt aktiviert; du wählst ausdrücklich zwischen:",
    faq: [
      { q: "Was zählt als abrechenbares Event?", a: "Ein Event, das die Ingestion angenommen hat, genau einmal gezählt. Ungültige oder abgelehnte Events, erkannte Duplikate, technische Retries, Test- und Debug-Events, interne Systemereignisse und wegen fehlender Einwilligung verworfene Events werden nie berechnet." },
      { q: "Was passiert beim Erreichen des Limits?", a: "Du wirst bei 70 %, 90 % und 100 % gewarnt. Nichts wird still gekauft oder umgestellt: Du entscheidest vorab, ob Eventpakete erlaubt sind, ein monatliches Kostenlimit gilt oder die Verarbeitung beim Limit nach der kommunizierten Grace Period pausiert. Ein Upgrade ist jederzeit möglich." },
      { q: "Kann ich kündigen?", a: "Ja, Monatstarife enden zum Periodenende über das Stripe-Portal. Daten bleiben für die konfigurierte Aufbewahrungsfrist erhalten und können exportiert werden." },
    ],
    cta: "Mit Track starten",
    ctaText: "Keine Kreditkarte nötig, um eine Site anzulegen und die erste Destination zu konfigurieren.",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return pageMetadata({ locale, path: "/pricing", title: seoTitle(c.eyebrow), description: seoDescription(c.text) });
}

function money(v: { amount: number; currency: string }, locale: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-IE", { style: "currency", currency: v.currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(v.amount);
}

function integer(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-IE").format(n);
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  const plans = publicPlans(locale);
  const rules = usageRulesCopy(locale);
  const offers = plans.filter((p) => p.monthly).map((p) => ({ "@type": "Offer", name: p.name, price: p.monthly!.amount, priceCurrency: p.monthly!.currency, category: "subscription" }));
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.eyebrow, path: "/pricing" }], locale), faqJsonLd(c.faq), ...(offers.length ? [{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND_NAME, applicationCategory: "BusinessApplication", operatingSystem: "Web", offers }] : [])]} />
      <PageHero eyebrow={c.eyebrow} title={c.title} text={c.text} />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <li key={p.id}>
              <Card className={`flex h-full flex-col p-5 ${p.recommended ? "border-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-ink">{p.name}</h2>
                  {p.recommended ? <Badge tone="ok">{c.recommended}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-ink-3">{p.audience}</p>
                <div className="mt-3 min-h-[3.5rem]">
                  {p.monthly && p.yearly ? (
                    <p>
                      <span className="font-display text-3xl font-bold text-ink">{money(p.monthly, locale)}</span> <span className="text-sm text-ink-3">{c.perMonth}</span>
                      <span className="block text-xs text-ink-3">{c.yearlyNote(money(p.yearly, locale), money({ amount: p.yearly.monthlyEquivalent, currency: p.yearly.currency }, locale, 2))}</span>
                    </p>
                  ) : (
                    <p>
                      <span className="font-display text-3xl font-bold text-ink">{c.custom}</span>
                      <span className="block text-xs text-ink-3">{c.customText}</span>
                    </p>
                  )}
                </div>
                {p.inherits ? <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-3">{p.inherits}</p> : null}
                <ul className={`${p.inherits ? "mt-2" : "mt-4"} space-y-1.5 text-sm text-ink-2`}>
                  {p.bullets.map((b) => (
                    <li key={b} className="inline-flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-3">{p.overage ? c.overage(money(p.overage.price, locale), integer(p.overage.events, locale)) : c.overageContractual}</p>
                <div className="mt-auto pt-5">
                  <Link href={p.contactSales ? "/contact?topic=enterprise" : "/signup"} className={cn(buttonVariants({ variant: p.recommended ? "primary" : "secondary" }), "w-full")}>
                    {p.contactSales ? c.contactSales : c.start}
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
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">{c.whatCounts}</h2>
            <p className="mt-2 text-sm text-ink-2">{c.whatCountsText}</p>
            <ul className="mt-3 space-y-1 text-sm text-ink-2">
              {rules.notCounted.map((r) => (
                <li key={r} className="inline-flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {r}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">{c.overageTitle}</h2>
            <p className="mt-2 text-sm text-ink-2">{c.overageText}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
              {rules.overagePolicies.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ol>
          </Card>
        </div>
      </Section>
      <Section>
        <Faq items={c.faq} />
      </Section>
      <FinalCta title={c.cta} text={c.ctaText} primary={{ label: c.start, href: "/signup" }} secondary={{ label: c.contactSales, href: "/contact?topic=enterprise" }} />
    </>
  );
}
