import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Faq, FinalCta, PageHero, Section, Steps, faqJsonLd } from "@/components/marketing/page-shell";
import { routing } from "@/i18n/routing";
import { INTEGRATIONS, integrationBySlug } from "@/lib/integrations-catalog";
import { pick } from "@/lib/marketing-copy";
import { alternatesFor, breadcrumbJsonLd } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => INTEGRATIONS.map((i) => ({ locale, slug: i.slug })));
}

const COPY = {
  en: {
    eyebrow: "Integration",
    integrations: "Integrations",
    modes: "Delivery modes",
    browser: "Browser tag — loaded by the track.site snippet after consent, no vendor code on your site.",
    server: "Server API — delivered by the worker with retries, health checks and a redacted payload preview per attempt.",
    offline: "Offline / CRM conversions — server events flagged as offline reach this platform with the vendor's offline action source.",
    hybrid: "Hybrid — both paths share the same event id; the vendor deduplicates on",
    setupTitle: "Setup in the wizard",
    steps: [
      { title: "Identifiers", text: "Enter the public IDs (pixel, tag, account). Formats are validated against the vendor's documentation." },
      { title: "Credentials", text: "Tokens go into the encrypted vault through the secure card; OAuth providers connect with one click. The assistant never sees secrets." },
      { title: "Validate and map", text: "The vendor credentials are validated with the cheapest read call; canonical events are mapped to the platform's event names with verified defaults." },
      { title: "Test and publish", text: "A flagged test event runs through the real pipeline and shows the vendor's answer. Publish creates a signed configuration version." },
    ],
    consent: "Consent",
    consentText: "Requires the marketing purpose (analytics for Google Analytics 4, necessary for your own webhooks). Without it nothing is loaded in the browser and nothing is sent from the server. Inferred consent is never exported.",
    access: "Prerequisites",
    faq: [
      { q: "Can I run server-only?", a: "Yes. Choose server mode in the wizard; the vendor script is never loaded and matching relies on hashed identifiers and click ids captured by the tracker." },
      { q: "How are duplicates avoided?", a: "The browser tag and the server request carry the same event id, and purchases add the order id. The worker also deduplicates repeated source events before delivery." },
      { q: "What if the vendor API changes?", a: "API versions are pinned centrally with the verification date; sunset warnings appear in the destination health long before an endpoint is retired." },
    ],
    cta: "Connect",
    ctaText: "Set it up with the guided wizard or let the assistant do it in chat.",
    start: "Start free",
    all: "All integrations",
  },
  de: {
    eyebrow: "Integration",
    integrations: "Integrationen",
    modes: "Zustellmodi",
    browser: "Browser-Tag — vom track.site-Snippet nach Consent geladen, kein Anbieter-Code auf deiner Site.",
    server: "Server-API — vom Worker zugestellt, mit Retries, Health-Checks und geschwärzter Payload-Vorschau pro Versuch.",
    offline: "Offline-/CRM-Conversions — als offline markierte Server-Events erreichen diese Plattform mit der Offline-Action-Source des Anbieters.",
    hybrid: "Hybrid — beide Wege teilen dieselbe Event-ID; der Anbieter dedupliziert über",
    setupTitle: "Einrichtung im Assistenten",
    steps: [
      { title: "Kennungen", text: "Öffentliche IDs (Pixel, Tag, Konto) eingeben. Formate werden gegen die Anbieter-Dokumentation validiert." },
      { title: "Zugangsdaten", text: "Tokens gehen über die sichere Karte in den verschlüsselten Tresor; OAuth-Anbieter verbinden sich per Klick. Der Assistent sieht nie Geheimnisse." },
      { title: "Validieren und mappen", text: "Die Zugangsdaten werden mit dem günstigsten Leseaufruf geprüft; kanonische Events werden mit geprüften Standards auf die Eventnamen der Plattform abgebildet." },
      { title: "Testen und veröffentlichen", text: "Ein markierter Testevent läuft durch die echte Pipeline und zeigt die Antwort des Anbieters. Veröffentlichen erzeugt eine signierte Konfigurationsversion." },
    ],
    consent: "Consent",
    consentText: "Benötigt den Zweck Marketing (Analytics für Google Analytics 4, Notwendig für eigene Webhooks). Ohne ihn wird im Browser nichts geladen und vom Server nichts gesendet. Abgeleiteter Consent wird nie exportiert.",
    access: "Voraussetzungen",
    faq: [
      { q: "Kann ich nur serverseitig senden?", a: "Ja. Wähle im Assistenten den Servermodus; das Anbieter-Skript wird nie geladen und das Matching stützt sich auf gehashte Kennungen und vom Tracker erfasste Click-IDs." },
      { q: "Wie werden Duplikate vermieden?", a: "Browser-Tag und Server-Request tragen dieselbe Event-ID, Käufe zusätzlich die Bestellnummer. Der Worker dedupliziert wiederholte Quell-Events zudem vor der Zustellung." },
      { q: "Was, wenn sich die Anbieter-API ändert?", a: "API-Versionen sind zentral mit Prüfdatum gepinnt; Sunset-Warnungen erscheinen im Destination-Zustand lange bevor ein Endpunkt abgeschaltet wird." },
    ],
    cta: "Verbinden",
    ctaText: "Mit dem geführten Assistenten einrichten oder den Chat-Assistenten machen lassen.",
    start: "Kostenlos starten",
    all: "Alle Integrationen",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const i = integrationBySlug(slug);
  if (!i) return {};
  return { title: seoTitle(i.name), description: seoDescription(i.summary[locale === "de" ? "de" : "en"]), alternates: alternatesFor(`/integrations/${slug}`, locale) };
}

export default async function IntegrationPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const i = integrationBySlug(slug);
  if (!i) notFound();
  const c = pick(locale, COPY);
  const lang = locale === "de" ? "de" : "en";
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: c.integrations, path: "/integrations" }, { name: i.name, path: `/integrations/${slug}` }], locale), faqJsonLd(c.faq), { "@context": "https://schema.org", "@type": "SoftwareApplication", name: `track.site × ${i.name}`, applicationCategory: "BusinessApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" } }]} />
      <PageHero eyebrow={c.eyebrow} title={i.name} text={i.summary[lang]}>
        <div className="mt-6 flex flex-wrap gap-2">
          {i.browser ? <Badge tone="neutral">Browser</Badge> : null}
          {i.server ? <Badge tone="neutral">Server</Badge> : null}
          {i.offline ? <Badge tone="neutral">Offline</Badge> : null}
          <Badge tone="neutral">dedup: {i.dedup}</Badge>
        </div>
      </PageHero>
      <Section title={c.modes}>
        <ul className="grid gap-3 md:grid-cols-2">
          {i.browser ? <Mode text={c.browser} /> : null}
          {i.server ? <Mode text={c.server} /> : null}
          {i.offline ? <Mode text={c.offline} /> : null}
          {i.browser && i.server ? <Mode text={`${c.hybrid} ${i.dedup}.`} /> : null}
        </ul>
        {i.accessNote ? (
          <div className="mt-6 rounded-2xl border border-warn/40 bg-warn-soft p-4 text-sm text-ink-2">
            <p className="font-semibold text-ink">{c.access}</p>
            <p className="mt-1">{i.accessNote[lang]}</p>
          </div>
        ) : null}
      </Section>
      <Section title={c.setupTitle} tone="muted">
        <Steps items={c.steps} />
      </Section>
      <Section title={c.consent}>
        <p className="max-w-3xl text-sm text-ink-2">{c.consentText}</p>
      </Section>
      <Section tone="muted">
        <Faq items={c.faq} />
      </Section>
      <FinalCta title={`${c.cta}: ${i.name}`} text={c.ctaText} primary={{ label: c.start, href: "/signup" }} secondary={{ label: c.all, href: "/integrations" }} />
    </>
  );
}

function Mode({ text }: { text: string }) {
  return (
    <li className="inline-flex items-start gap-2 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> {text}
    </li>
  );
}
