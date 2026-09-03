import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

interface Guide {
  id: string;
  title: string;
  text: string;
  code?: string;
  bullets?: string[];
}

const COPY: Record<"en" | "de", { title: string; intro: string; guides: Guide[]; toc: string }> = {
  en: {
    title: "Documentation",
    intro: "Everything needed to install Track, send server events, integrate consent and configure destinations. The dashboard assistant links here for each step.",
    toc: "On this page",
    guides: [
      { id: "install", title: "Install the snippet", text: "Add the asynchronous script to every page, ideally in the head. It loads the signed configuration for your tracking ID, respects consent and never blocks rendering. Replace TRACKING_ID with the six-character ID from your dashboard.", code: `<script async src="https://cdn.track.site/v1/tracker.js" data-site="TRACKING_ID"></script>` },
      { id: "events", title: "Send browser events", text: "Standard events (page_view, view_item, add_to_cart, begin_checkout, purchase, generate_lead, sign_up, subscribe, start_trial, contact, book_appointment, download, search, login) carry validated parameters; custom events use lowercase snake_case names.", code: `window.tsq = window.tsq || [];\ntsq.push(["track", "purchase", { order_id: "A1001", currency: "EUR", value: 129.9, items: [{ item_id: "SKU-1", price: 99.9, quantity: 1 }] }]);\ntsq.push(["identify", { user_id: "u_42", email: "customer@example.com" }]); // hashed client-side before transport` },
      { id: "server", title: "Server API and offline conversions", text: "Create a source key in Settings → Server source keys and send events from your backend, CRM or POS. Provide the same order id as the browser event for deduplication; add props.offline for offline conversions.", code: `curl -X POST https://api.track.site/v1/s \\\n  -H "Authorization: Bearer tsk_..." -H "Content-Type: application/json" \\\n  -d '{"events":[{"name":"purchase","ts":1767225600000,"props":{"offline":true},"commerce":{"order_id":"A1001","currency":"EUR","value":129.9},"user_data":{"email":"customer@example.com"},"click_ids":{"gclid":"Cj0K..."},"consent":{"granted":["necessary","marketing"],"source":"crm"}}]}'` },
      { id: "consent", title: "Consent integration", text: "Use a supported CMP (TCF 2.2, GPP/GPC, Cookiebot, OneTrust, Usercentrics) — the tracker reads it automatically — or call the consent API from your own banner. Purposes: necessary, analytics, marketing, personalization. Withdrawal stops everything immediately.", code: `tsq.push(["consent", { granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "2026-09" }]);` },
      { id: "destinations", title: "Destinations", text: "Every destination has a 19-step wizard: identifiers, vault credentials or OAuth, vendor validation, event mapping with verified defaults, a real test event, lint, diff and approval-gated publish. Browser and server share one event id; purchases add the order id.", bullets: ["Meta, Google Ads/YouTube, GA4, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat", "X, Taboola, Outbrain, Amazon Ads, Spotify, Quora", "Yahoo DSP, The Trade Desk, Google Marketing Platform, AdRoll, Criteo, affiliate postbacks (13 presets), webhooks"] },
      { id: "shops", title: "Shop platforms", text: "Shopify (app with order webhooks and web pixel), WooCommerce (plugin with signed order webhooks) and Shopware 6 (app with storefront script and order webhooks) send verified purchase and refund events with order ids. Install the plugin, paste the tracking ID and source key, done.", bullets: ["Verified source: events are marked source_verified and used as the authoritative conversion", "Refunds create negative-value events for vendors that support them", "Browser purchases from the theme are deduplicated by order id"] },
      { id: "privacy", title: "Privacy center and DSAR", text: "Retention windows per data kind, consent policy versions per site and data subject requests (export, delete, restrict, rectify, object, portability) are handled in Consent & Privacy. Requests use hashed identifiers only and produce an audited report." },
      { id: "api", title: "Reference", text: "Ingest: POST /v1/e (browser batches, ≤50 events), POST /v1/s (server batches, ≤100 events, Bearer source key), POST /v1/affiliate/in/{trackingId}/{preset} (inbound network postbacks). Configuration manifests: GET /c/{trackingId}/manifest.json and the signed bundle. All responses are JSON; 202 means durably queued." },
    ],
  },
  de: {
    title: "Dokumentation",
    intro: "Alles, was du brauchst, um Track zu installieren, Server-Events zu senden, Consent zu integrieren und Destinationen zu konfigurieren. Der Dashboard-Assistent verlinkt bei jedem Schritt hierher.",
    toc: "Auf dieser Seite",
    guides: [
      { id: "install", title: "Snippet installieren", text: "Füge das asynchrone Script auf jeder Seite ein, idealerweise im Head. Es lädt die signierte Konfiguration für deine Tracking-ID, respektiert Consent und blockiert nie das Rendering. Ersetze TRACKING_ID durch die sechsstellige ID aus deinem Dashboard.", code: `<script async src="https://cdn.track.site/v1/tracker.js" data-site="TRACKING_ID"></script>` },
      { id: "events", title: "Browser-Events senden", text: "Standardevents (page_view, view_item, add_to_cart, begin_checkout, purchase, generate_lead, sign_up, subscribe, start_trial, contact, book_appointment, download, search, login) tragen validierte Parameter; Custom-Events verwenden Namen in lowercase snake_case.", code: `window.tsq = window.tsq || [];\ntsq.push(["track", "purchase", { order_id: "A1001", currency: "EUR", value: 129.9, items: [{ item_id: "SKU-1", price: 99.9, quantity: 1 }] }]);\ntsq.push(["identify", { user_id: "u_42", email: "customer@example.com" }]); // wird clientseitig vor dem Transport gehasht` },
      { id: "server", title: "Server-API und Offline-Conversions", text: "Lege in Einstellungen → Server-Source-Keys einen Key an und sende Events aus Backend, CRM oder Kasse. Übergib dieselbe Bestellnummer wie das Browser-Event zur Deduplizierung; setze props.offline für Offline-Conversions.", code: `curl -X POST https://api.track.site/v1/s \\\n  -H "Authorization: Bearer tsk_..." -H "Content-Type: application/json" \\\n  -d '{"events":[{"name":"purchase","ts":1767225600000,"props":{"offline":true},"commerce":{"order_id":"A1001","currency":"EUR","value":129.9},"user_data":{"email":"customer@example.com"},"click_ids":{"gclid":"Cj0K..."},"consent":{"granted":["necessary","marketing"],"source":"crm"}}]}'` },
      { id: "consent", title: "Consent-Integration", text: "Nutze ein unterstütztes CMP (TCF 2.2, GPP/GPC, Cookiebot, OneTrust, Usercentrics) — der Tracker liest es automatisch — oder rufe die Consent-API aus deinem eigenen Banner auf. Zwecke: necessary, analytics, marketing, personalization. Ein Widerruf stoppt alles sofort.", code: `tsq.push(["consent", { granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "2026-09" }]);` },
      { id: "destinations", title: "Destinationen", text: "Jede Destination hat einen 19-Schritte-Assistenten: Kennungen, Tresor-Zugangsdaten oder OAuth, Anbieter-Validierung, Event-Mapping mit geprüften Standards, echter Testevent, Lint, Diff und freigabepflichtige Veröffentlichung. Browser und Server teilen eine Event-ID; Käufe ergänzen die Bestellnummer.", bullets: ["Meta, Google Ads/YouTube, GA4, TikTok, Microsoft, LinkedIn, Reddit, Pinterest, Snapchat", "X, Taboola, Outbrain, Amazon Ads, Spotify, Quora", "Yahoo DSP, The Trade Desk, Google Marketing Platform, AdRoll, Criteo, Affiliate-Postbacks (13 Presets), Webhooks"] },
      { id: "shops", title: "Shopsysteme", text: "Shopify (App mit Order-Webhooks und Web Pixel), WooCommerce (Plugin mit signierten Order-Webhooks) und Shopware 6 (App mit Storefront-Script und Order-Webhooks) senden verifizierte Kauf- und Erstattungsevents mit Bestellnummern. Plugin installieren, Tracking-ID und Source-Key einfügen, fertig.", bullets: ["Verifizierte Quelle: Events sind source_verified und gelten als maßgebliche Conversion", "Erstattungen erzeugen Events mit negativem Wert für Anbieter, die das unterstützen", "Browser-Käufe aus dem Theme werden über die Bestellnummer dedupliziert"] },
      { id: "privacy", title: "Datenschutz-Center und DSAR", text: "Aufbewahrungsfristen pro Datenart, Consent-Policy-Versionen pro Site und Betroffenenanfragen (Export, Löschen, Einschränken, Berichtigen, Widerspruch, Übertragbarkeit) werden unter Consent & Datenschutz bearbeitet. Anfragen nutzen nur gehashte Kennungen und erzeugen einen auditierten Bericht." },
      { id: "api", title: "Referenz", text: "Ingest: POST /v1/e (Browser-Batches, ≤50 Events), POST /v1/s (Server-Batches, ≤100 Events, Bearer-Source-Key), POST /v1/affiliate/in/{trackingId}/{preset} (eingehende Netzwerk-Postbacks). Konfigurations-Manifeste: GET /c/{trackingId}/manifest.json und das signierte Bundle. Alle Antworten sind JSON; 202 bedeutet dauerhaft in der Queue." },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, COPY);
  return pageMetadata({ locale, path: "/docs", title: seoTitle(c.title), description: seoDescription(c.intro) });
}

export default async function DocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, COPY);
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.title, path: "/docs" }], locale), { "@context": "https://schema.org", "@type": "TechArticle", headline: c.title, description: c.intro, inLanguage: locale }]} />
      <Container className="grid gap-10 py-14 md:grid-cols-[220px_1fr] md:py-20">
        <nav aria-label={c.toc} className="md:sticky md:top-24 md:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{c.toc}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {c.guides.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`} className="text-ink-2 hover:text-ink">
                  {g.title}
                </a>
              </li>
            ))}
            <li className="pt-2">
              <Link href="/integrations" className="text-primary hover:underline">
                Integrations →
              </Link>
            </li>
          </ul>
        </nav>
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
          <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
          <div className="mt-10 space-y-12">
            {c.guides.map((g) => (
              <section key={g.id} id={g.id} className="scroll-mt-24">
                <h2 className="font-display text-2xl font-semibold text-ink">{g.title}</h2>
                <p className="mt-3 text-ink-2">{g.text}</p>
                {g.code ? <pre className="mt-4 overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">{g.code}</pre> : null}
                {g.bullets ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
                    {g.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </Container>
    </>
  );
}
