import type { HowItWorksCopy } from "../types";
import { SNIPPET } from "./samples";

/**
 * Dutch (nl, "je" register) copy of the how-it-works area. Same shape as en.ts; see docs/14-localization.md.
 */

export const HOW_IT_WORKS_NL: HowItWorksCopy = {
  eyebrow: "Zo werkt het",
  title: "Van je domein naar geverifieerde conversies op elk platform",
  intro: "Eén snippet op je site, één begeleide sessie met de assistent, één ondertekende configuratie die je goedkeurt. Vanaf dat moment neemt Track de events over – met een toestemmingscheck voor elke destination en een debugger die je laat zien wat er is gebeurd.",
  cta: "Start met je domein",
  ctaSecondary: "Bekijk de functies",
  stage: {
    title: "Snippet → Track → platformen",
    description: "De snippet op je website verstuurt events vanuit de browser; je shop of server verstuurt dezelfde conversies met een gedeelde event-ID. Track toetst de toestemming bij een policycheck en stuurt elk event door naar Meta, Google Ads, Google Analytics 4 en TikTok.",
    caption: "Snippet → Track → Toestemming/policy → platformen. Hetzelfde beeld zie je in de debugger voor elk echt event.",
  },
  milestonesTitle: "Vier mijlpalen, één sessie",
  milestonesText: "Dit is het perspectief van de klant. De technische controles achter elke mijlpaal staan verderop.",
  youLabel: "Jij",
  outcomeLabel: "Je krijgt",
  steps: [
    { title: "Maak je site aan", text: "Meld je aan met je domein. Track maakt de site, een openbare tracking-ID van zes tekens en de snippet van één regel aan.", you: "het domein invoeren en de snippet plakken – of de Shopify-, WooCommerce- of Shopware-app installeren", outcome: "een geverifieerde installatie: Track ziet de eerste paginaweergave en bevestigt het eigendom via DNS, bestand of metatag" },
    { title: "Laat de assistent de setup voorstellen", text: "De assistent detecteert platform en toestemmingstool, stelt een eventplan voor jouw type bedrijf voor en vraagt naar de openbare ID's van de platformen die je gebruikt.", you: "een paar vragen beantwoorden, pixel-ID's in de chat invoeren en access tokens in de kluiskaart", outcome: "een conceptconfiguratie met gemapte events en een echt testevent dat door het platform is geaccepteerd" },
    { title: "Goedkeuren en publiceren", text: "Je ziet de diff, de ontvangers en de toestemmingsvereiste van elke destination. Eén goedkeuring publiceert een ondertekende, geversioneerde bundle.", you: "de diff lezen en op goedkeuren klikken", outcome: "een live configuratie met versienummer, rollback met één klik" },
    { title: "Volgen en verbeteren", text: "De debugger toont elk event met zijn beslissing, de healthscore meldt wat je moet oplossen en de assistent stelt de oplossing voor.", you: "de score controleren als die verandert; verbeteringen goedkeuren", outcome: "geverifieerde conversies op elk platform, met bewijs per event" },
  ],
  snippet: { title: "De snippet", code: SNIPPET, copy: "Snippet kopiëren", copied: "Gekopieerd", note: "Geleverd vanaf een first-party CDN-host; de configuratie die hij laadt is Ed25519-ondertekend en wordt geverifieerd voordat er iets draait." },
  published: {
    title: "Configuratie · versie 13",
    state: "live",
    facts: [
      { label: "Goedgekeurd door", value: "jou, gekoppeld aan de diff die je hebt gelezen" },
      { label: "Handtekening", value: "Ed25519, geverifieerd door de SDK" },
      { label: "Destinations", value: "Meta (browser + server), Google Ads (server)" },
      { label: "Rollback", value: "versie 12, één klik" },
    ],
  },
  flows: {
    title: "Waar je events vandaan komen",
    text: "Wissel tussen de afleveringsmodi. Elke destination kan alleen via de browser, alleen via de server of via beide draaien; de hybride modus is de standaard, omdat de twee routes elkaars gaten opvullen.",
    tabsLabel: "Afleveringsmodi",
    items: [
      {
        id: "browser",
        label: "Alleen browser",
        title: "Events vanuit de browser-SDK",
        text: "De snippet verzamelt paginaweergaven, productweergaven en winkelwagen-events in de browser van de bezoeker en verstuurt ze naar de ingest-host van Track. Platformtags laden pas na toestemming. Deze modus is snel te installeren, maar hangt af van de browser: geblokkeerde scripts en gesloten tabbladen verliezen events.",
        points: ["Installatie: één snippet", "Toestemming: gecontroleerd in de browser en nogmaals op de server", "Gat: geen event als het script wordt geblokkeerd of het tabblad te vroeg sluit"],
      },
      {
        id: "server",
        label: "Alleen server",
        title: "Events vanuit je server of shop",
        text: "Je shopplatform, backend of CRM verstuurt conversies met een source key naar de server-API. Aankopen, terugbetalingen en offline conversies komen betrouwbaar aan en worden in de browser nooit geblokkeerd. Matchdata is beperkt tot wat je server weet.",
        points: ["Installatie: shop-app of een ondertekend verzoek vanuit je backend", "Betrouwbaar voor aankopen, terugbetalingen en leads uit je CRM", "Gat: minder browsersignalen voor matching"],
      },
      {
        id: "hybrid",
        label: "Browser + server",
        title: "Beide routes, één event-ID",
        text: "Browser en server versturen dezelfde conversie met dezelfde event-ID. Track normaliseert beide, past de toestemmingsbeslissing per destination toe en stuurt ze door; de platformen dedupliceren op de event-ID of de order-ID. Je krijgt het bereik van de serverroute met de matchkwaliteit van de browserroute.",
        points: ["Standaardmodus voor elke destination die beide ondersteunt", "Deduplicatie: event-ID (Meta, TikTok, Pinterest, Snapchat, Microsoft, LinkedIn …), order-ID (Google Ads)", "Toestemming: één beslissing per event en destination voor beide routes"],
      },
    ],
  },
  checks: {
    title: "Wat Track onderweg controleert",
    summary: "Toon de technische controles achter de vier mijlpalen",
    intro: "Deze controles draaien in de begeleide sessie en later in de worker. Ze zijn de reden dat de vier mijlpalen volstaan – je hoeft ze niet met de hand na te lopen.",
    groups: [
      { title: "Site en installatie", items: ["Domeinformaat en bereikbaarheid", "Eigendom via DNS-record, verificatiebestand of metatag", "Snippet aanwezig en configuratiehandtekening in de browser geverifieerd", "Eerste paginaweergave ontvangen op de ingest-host"] },
      { title: "Platform, toestemmingstool en eventplan", items: ["Shop- of CMS-platform gedetecteerd met een betrouwbaarheidsniveau", "Toestemmingstool gedetecteerd (TCF 2.2, GPP, Cookiebot, OneTrust, Usercentrics of toestemmings-API)", "Eventplansjabloon gekozen voor het type bedrijf (webshop, leadgeneratie, SaaS, publisher)", "Verplichte parameters per standaardevent, naamregels voor custom events, PII geblokkeerd in properties"] },
      { title: "Destinations en credentials", items: ["Openbare ID's gevalideerd tegen het formaat van het platform", "Access tokens via kaart of OAuth in de kluis opgeslagen; nooit in het transcript", "Toestemmingsdoel dat elke destination vereist vastgelegd", "Click-ID-matrix gecontroleerd: elke ID alleen doorgestuurd naar het eigen platform"] },
      { title: "Testen, reviewen en publiceren", items: ["Testevent verstuurd via de echte queue en worker; oordeel van het platform vastgelegd", "Diff, ontvangerslijst en goedkeurder gekoppeld aan één goedkeuringstoken", "Bundle ondertekend met Ed25519, geversioneerd en onveranderlijk", "Auditvermelding voor elke tool-aanroep en elke goedkeuring"] },
      { title: "Na livegang", items: ["Healthscore: toestemmingsdekking, kritieke events, schemakwaliteit, duplicaten, aflevering, actualiteit", "Retries met backoff, circuit breaker en dead-letter queue per destination", "Problemen gegroepeerd op fingerprint, elk met de tool die het oplost", "Rollback naar elke eerdere versie"] },
    ],
  },
  architectureTitle: "Twee lagen, één ondertekende configuratie",
  architectureText: "Een control plane voor mensen en de assistent, een data plane voor events. Ze delen niets behalve de ondertekende configuratie – een technisch bewijs na de mijlpalen, geen voorwaarde om Track te gebruiken.",
  architectureColumns: { component: "Component", responsibility: "Verantwoordelijkheid" },
  architecture: [
    { title: "Browser-SDK", text: "Toestemmingsgebonden opslag, CMP-adapters, gebundeld transport, SPA-tracking, platformloaders met gedeelde dedup-ID's. Door een CI-budget onder 30 KB gzip gehouden." },
    { title: "Collector", text: "Origin-allowlist, rate limits, HMAC-ondertekende serververzoeken, kill switches, overdracht aan de duurzame queue voordat de 202 wordt teruggegeven." },
    { title: "Worker", text: "Normalisatie, PII-scan, toestemmingspolicy, event store, conversiededup, usage ledger, fan-out, aflevering met retries en DLQ." },
    { title: "Control plane", text: "Dashboard en assistent: getypeerde tools, goedkeuringen, auditlog, RBAC, facturering, privacycenter – gescheiden van de data plane." },
  ],
  faqTitle: "Vragen",
  faq: [
    { q: "Heb ik een tagmanager nodig?", a: "Nee. De tracker laadt platformtags zelf na toestemming. Bestaande GTM-setups kunnen tijdens de migratie naast elkaar blijven bestaan." },
    { q: "Waar wordt data verwerkt?", a: "In de EU. Platform-API's ontvangen alleen wat je hebt geconfigureerd, op basis van de gedocumenteerde doorgiftegrondslag die per destination wordt getoond." },
    { q: "Hoe is de configuratie beschermd?", a: "Bundles zijn onveranderlijk, geversioneerd en Ed25519-ondertekend; de SDK verifieert de handtekening voordat een configuratie wordt toegepast." },
    { q: "Wat als de AI-provider niet beschikbaar is?", a: "Dezelfde setupstatussen zijn beschikbaar als regelgebaseerde wizard. Niets in de pipeline hangt af van een model dat online is." },
  ],
  closing: { title: "Klaar wanneer jij het bent", text: "Maak je site aan, plak de snippet en laat de assistent de eerste destination configureren.", cta: "Gratis starten", secondary: "Lees de docs" },
};
