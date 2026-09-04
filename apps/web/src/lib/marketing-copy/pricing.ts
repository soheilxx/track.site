import type { FeatureGroup } from "@track-site/catalog";
import type { FaqItem, LocalizedCopy, PricingCopy } from "./types";

/**
 * Pricing page copy (supplement §5 layout: toggle, three main cards, Enterprise panel, plan finder,
 * cost calculator, comparison matrix, event definition, overage, trial, FAQ, tax note).
 *
 * Prices, limits, entitlements, packs and the trial never live here — they come from the typed
 * tariff catalogue (`@track-site/catalog`) through `@/server/pricing`; this module only holds the
 * wording around them. Strings that client components render use `{placeholder}` templates filled
 * with `fill()` from components/marketing/pricing/pricing-helpers.ts (functions cannot cross the
 * server/client boundary). The legacy function-valued keys of `PricingCopy` are kept so existing
 * imports keep type-checking; `PricingPageCopy` extends that shape until the type moves to types.ts.
 */
export interface PricingPageCopy extends PricingCopy {
  hero: { facts: string[] };
  interval: { legend: string; monthly: string; yearly: string; monthlyHint: string; yearlyHint: string; announceMonthly: string; announceYearly: string };
  plan: {
    perMonth: string;
    perYear: string;
    billedMonthly: string;
    /** `{total}` */
    billedYearly: string;
    /** `{monthly}` */
    equivalent: string;
    /** `{n}` */
    instalments: string;
    eventsLabel: string;
    sites: string;
    team: string;
    retention: string;
    unlimited: string;
    /** `{n}` */
    days: string;
    /** `{n}` */
    months: string;
    /** `{plan}` */
    choose: string;
    /** `{days}` */
    trialHint: string;
    /** `{price}`, `{events}` */
    overageHint: string;
    recommended: string;
    /** `{plan}` */
    listLabel: string;
  };
  tax: { title: string; text: string };
  enterprise: { lead: string; text: string; price: string; benefitsTitle: string; trustTitle: string; trust: string[]; cta: string; secondary: string; overage: string };
  includedSection: { title: string; text: string; note: string };
  /** section around the plan finder and the calculator */
  tools: { title: string; text: string };
  faqTitle: string;
  finder: {
    title: string;
    text: string;
    sites: string;
    events: string;
    team: string;
    retention: string;
    /** `{n}` */
    retentionDays: string;
    /** `{n}` */
    retentionMonths: string;
    /** `{n}` */
    retentionLonger: string;
    /** `{n}` */
    eventsMore: string;
    resultLabel: string;
    /** `{plan}` */
    result: string;
    resultEnterprise: string;
    resultEnterpriseText: string;
    checks: { sites: string; events: string; team: string; retention: string };
    /** `{wanted}`, `{limit}` */
    limitOf: string;
    /** `{wanted}` */
    noCap: string;
    /** `{plan}` */
    cta: string;
    ctaEnterprise: string;
    /** `{price}` */
    priceMonthly: string;
    /** `{price}` */
    priceYearly: string;
  };
  calculator: {
    title: string;
    text: string;
    plan: string;
    events: string;
    slider: string;
    eventsInput: string;
    base: string;
    included: string;
    above: string;
    packs: string;
    /** `{n}`, `{events}`, `{price}` */
    packsValue: string;
    packsNone: string;
    overageCost: string;
    total: string;
    perMonth: string;
    perYear: string;
    /** `{plan}`, `{total}`, `{savings}`, `{current}` */
    cheaper: string;
    /** `{plan}` */
    cheaperCta: string;
    noCheaper: string;
    beyondPro: string;
    /** `{thresholds}` */
    policyNote: string;
    /** `{plan}` */
    cta: string;
  };
  matrix: {
    title: string;
    text: string;
    feature: string;
    included: string;
    notIncluded: string;
    custom: string;
    contractual: string;
    planLabel: string;
    groups: Record<"limits" | FeatureGroup, string>;
    rows: { sites: string; events: string; team: string; retention: string; monthly: string; yearly: string; overage: string };
    unlimited: string;
    /** `{n}` */
    days: string;
    /** `{n}` */
    months: string;
    /** `{price}`, `{events}` */
    pack: string;
    perMonth: string;
    perYear: string;
    /** `{included}`, `{total}` */
    summaryCount: string;
  };
  events: { notCountedTitle: string; diagramTitle: string; diagramDescription: string; diagramCaption: string; nodes: { website: string; track: string; trackSub: string; destinations: string[]; fanOut: string } };
  overageSection: {
    packsTitle: string;
    packPlan: string;
    packSize: string;
    packPrice: string;
    packEnterprise: string;
    policyTitle: string;
    policyText: string;
    defaultTag: string;
    /** `{thresholds}` */
    thresholds: string;
    /** `{percent}` */
    grace: string;
    honest: string;
  };
  trial: {
    /** `{plan}`, `{days}` */
    title: string;
    /** `{plan}` */
    text: string;
    /** `{days}`, `{events}` */
    facts: string[];
    /** `{plan}` */
    cta: string;
  };
  plansLabel: string;
  faq: FaqItem[];
}

export const PRICING_COPY: LocalizedCopy<PricingPageCopy> = {
  en: {
    eyebrow: "Pricing",
    title: "Clear plans that grow with your event volume",
    text: "Every plan includes browser and server-side tracking, all standard destinations, the AI assistant, the consent engine and the live event debugger. Pick a plan by websites, monthly events, team size and retention. Prices are net in EUR; billing runs through Stripe.",
    hero: { facts: ["Monthly billing by default, cancel at the end of the period", "Net prices in EUR, VAT added where applicable", "{trialDays}-day {trialPlan} trial without a credit card"] },
    interval: {
      legend: "Billing interval",
      monthly: "Monthly",
      yearly: "Yearly",
      monthlyHint: "Billed every month. Cancel at the end of the current period.",
      yearlyHint: "Paid once per year in advance. The yearly price equals ten monthly instalments.",
      announceMonthly: "Showing monthly prices.",
      announceYearly: "Showing yearly prices.",
    },
    perMonth: "per month",
    perYear: "per year",
    yearlyNote: (yearly, monthly) => `${yearly} per year when paid annually, i.e. ${monthly} per month.`,
    custom: "Custom",
    customText: "Custom volume, contract and SLA.",
    recommended: "Recommended",
    overage: (price, events) => `Optional overage: ${price} per ${events} additional events, never activated without your choice.`,
    overageContractual: "Overage is agreed in the contract.",
    contactSales: "Talk to sales",
    start: "Get started",
    plansLabel: "Plans",
    plan: {
      perMonth: "per month",
      perYear: "per year",
      billedMonthly: "Billed monthly. Cancel at the end of the period.",
      billedYearly: "{total} charged once per year",
      equivalent: "≈ {monthly} per month",
      instalments: "equals {n} monthly instalments",
      eventsLabel: "accepted events per month",
      sites: "Websites",
      team: "Team",
      retention: "Retention",
      unlimited: "Unlimited (fair use)",
      days: "{n} days",
      months: "{n} months",
      choose: "Choose {plan}",
      trialHint: "Includes a {days}-day trial, no credit card required",
      overageHint: "Optional overage: {price} per {events} additional events, only with your explicit choice.",
      recommended: "Recommended",
      listLabel: "What {plan} adds",
    },
    tax: {
      title: "Taxes and invoices",
      text: "All prices are net in EUR and exclude VAT. VAT is added where applicable based on your billing country. Businesses can enter their VAT ID during checkout; invoices for every payment are available in the billing portal.",
    },
    enterprise: {
      lead: "Custom volume, governance and infrastructure",
      text: "For organisations that need individual event and site volumes, their own role model, contractual support hours and a security review. We scope the setup together with you; pricing, overage and retention are agreed in the contract.",
      price: "Custom",
      benefitsTitle: "What Enterprise adds",
      trustTitle: "The same foundation as every plan",
      trust: ["EU data region by default", "Processor under Art. 28 GDPR, DPA included", "Row-level tenant isolation in the database", "Envelope-encrypted credentials; secrets never reach chat, logs or the model", "Signed, versioned configurations with rollback"],
      cta: "Talk to sales",
      secondary: "Book a demo",
      overage: "Overage, retention and volumes are agreed in the contract.",
    },
    included: "Included in every plan",
    includedItems: ["Privacy and consent functions", "Security functions", "Data export and deletion", "AI assistant in every paid plan"],
    includedSection: {
      title: "Included in every plan",
      text: "The basics are never paywalled: privacy, consent, security, export and deletion functions work in every plan, and the AI assistant is part of every paid plan. Upgrades add volume, team size, retention and advanced modules.",
      note: "From the tariff catalogue: every paid plan includes",
    },
    tools: {
      title: "Find your plan and estimate your cost",
      text: "Both tools use the same tariff catalogue as checkout and billing: the same limits, the same prices, the same event packs. Nothing is bought here.",
    },
    faqTitle: "Frequently asked questions",
    finder: {
      title: "Which plan fits?",
      text: "Answer four questions. The recommendation is computed deterministically from the tariff catalogue: the smallest plan whose limits cover all your answers.",
      sites: "Production websites",
      events: "Accepted events per month",
      team: "Team members",
      retention: "Event retention you need",
      retentionDays: "{n} days",
      retentionMonths: "{n} months",
      retentionLonger: "Longer than {n} months",
      eventsMore: "More than {n}",
      resultLabel: "Recommendation",
      result: "{plan} covers your setup",
      resultEnterprise: "Your setup needs an Enterprise agreement",
      resultEnterpriseText: "At least one answer is above the Pro limits. Custom volumes, retention and team size are agreed in the contract.",
      checks: { sites: "Websites", events: "Events per month", team: "Team members", retention: "Retention" },
      limitOf: "{wanted} of {limit}",
      noCap: "{wanted}, no fixed cap",
      cta: "Continue with {plan}",
      ctaEnterprise: "Talk to sales",
      priceMonthly: "{price} per month",
      priceYearly: "{price} per year, paid in advance",
    },
    calculator: {
      title: "Estimate your cost",
      text: "Move the slider or type your expected accepted events per month. The estimate shows the plan price, the event packs you would need and whether a higher plan is cheaper, before you buy anything.",
      plan: "Plan",
      events: "Expected accepted events per month",
      slider: "Events per month",
      eventsInput: "Exact number of events",
      base: "Plan price",
      included: "Included events",
      above: "Events above the limit",
      packs: "Event packs needed",
      packsValue: "{n} × {events} events at {price} each",
      packsNone: "None",
      overageCost: "Overage",
      total: "Estimated total",
      perMonth: "per month",
      perYear: "per year",
      cheaper: "{plan} would cost {total} for this volume, {savings} less than {current} with event packs.",
      cheaperCta: "Estimate with {plan}",
      noCheaper: "No higher plan is cheaper for this volume.",
      beyondPro: "Volumes beyond the Pro limit can also be agreed individually in an Enterprise contract.",
      policyNote: "Event packs are only billed if you explicitly allow overage. By default processing pauses at the limit after the grace window, and you are warned at {thresholds} of your limit.",
      cta: "Continue with {plan}",
    },
    matrix: {
      title: "Compare all plans",
      text: "Everything each plan includes, grouped by area: limits and prices first, then the modules.",
      feature: "Feature",
      included: "Included",
      notIncluded: "Not included",
      custom: "Custom",
      contractual: "Contractual",
      planLabel: "Choose a plan to view",
      groups: {
        limits: "Limits and prices",
        tracking: "Tracking and destinations",
        commerce: "E-commerce events",
        ai: "AI assistant",
        quality: "Data quality and monitoring",
        governance: "Governance and consent",
        data: "Data, attribution and exports",
        support: "Support and onboarding",
        enterprise: "Enterprise",
      },
      rows: { sites: "Production websites", events: "Accepted events per month", team: "Team members", retention: "Event retention", monthly: "Monthly price", yearly: "Yearly price, paid in advance", overage: "Optional event pack" },
      unlimited: "Unlimited within fair use",
      days: "{n} days",
      months: "{n} months",
      pack: "{price} per {events} events",
      perMonth: "per month",
      perYear: "per year",
      summaryCount: "{included} of {total} included",
    },
    whatCounts: "What counts as an event?",
    whatCountsText: "An event is counted exactly once when the Track ingestion accepts it. Forwarding the same event to several destinations does not increase usage.",
    events: {
      notCountedTitle: "Never billed",
      diagramTitle: "How an event is counted",
      diagramDescription: "A website sends an event to Track. Track accepts it once and counts it once. Track then forwards the same event to Meta, Google Ads and TikTok; the forwarding does not increase usage.",
      diagramCaption: "One accepted event is billed once, no matter how many destinations receive it.",
      nodes: { website: "Website", track: "Track", trackSub: "accepted · counted once", destinations: ["Meta", "Google Ads", "TikTok"], fanOut: "forwarding does not count" },
    },
    overageTitle: "Overage and cost control",
    overageText: "When you approach your monthly event limit you are warned early, see a usage forecast and decide yourself how additional events are handled. Nothing is bought or switched silently.",
    overageSection: {
      packsTitle: "Event packs per plan",
      packPlan: "Plan",
      packSize: "Pack size",
      packPrice: "Price per pack",
      packEnterprise: "Agreed in the contract",
      policyTitle: "You choose how overage is handled",
      policyText: "Overage is never activated without your decision. In the billing settings you pick one of three policies:",
      defaultTag: "Default",
      thresholds: "You are warned at {thresholds} of your monthly limit and see a usage forecast.",
      grace: "With the pause policy, processing continues up to {percent} % above the limit before it pauses; the grace window is shown in the dashboard.",
      honest: "The dashboard tells you honestly whether an event pack or the next plan is cheaper. There is no silent plan change, no unrequested purchase and no deletion of configurations on a downgrade.",
    },
    trial: {
      title: "Try {plan} for {days} days",
      text: "The trial runs on the {plan} plan with its full feature set and never turns into a paid subscription on its own.",
      facts: ["No credit card required", "Up to {events} accepted trial events", "No automatic conversion into a paid plan", "After the trial your workspace stays readable and exportable; nothing is deleted by surprise"],
      cta: "Start the {plan} trial",
    },
    faq: [
      { q: "What counts as a billable event?", a: "An event that the ingestion accepted, counted once. Invalid or rejected events, detected duplicates, technical retries, test and debug events, internal system events and events dropped for missing consent are never billed. Forwarding one event to several destinations does not increase usage." },
      { q: "What happens when I reach the limit?", a: "You are warned at {thresholds} of your monthly limit. Nothing is bought or switched silently: you choose in advance whether to allow event packs, set a monthly cost limit, or pause processing at the limit after the communicated grace window. Upgrades are possible at any time." },
      { q: "How does the {trialDays}-day trial work?", a: "The trial runs on {trialPlan} for {trialDays} days without a credit card and covers up to {trialEvents} accepted events. It never converts into a paid subscription on its own. Afterwards your workspace stays readable and exportable until you pick a plan." },
      { q: "Do I pay per destination?", a: "No. All standard destinations are included in every plan, and one accepted event counts once regardless of how many destinations receive it." },
      { q: "Do staging and preview subdomains count as websites?", a: "No. Staging and preview subdomains of a production website do not count towards the website limit." },
      { q: "Which taxes apply?", a: "Prices are net in EUR. VAT is added where applicable based on your billing country. Businesses can enter their VAT ID during checkout." },
      { q: "Can I switch plans or cancel?", a: "Upgrades take effect immediately. Monthly plans end at the end of the current period; yearly plans run until the end of the prepaid year. You cancel and change plans in the Stripe billing portal. A downgrade never silently deletes configurations, and your data stays available for the configured retention window and can be exported." },
      { q: "Is the AI assistant limited?", a: "The AI assistant is included in every paid plan. Normal answers, follow-up questions and validations are not metered, and you never see model tokens." },
      { q: "How does Enterprise billing work?", a: "Enterprise plans are priced individually and billed by invoice or purchase order with contractual volumes, retention, SLA and support hours. Contact sales to scope the setup." },
    ],
    cta: "Start with Track",
    ctaText: "Create your site without a credit card, configure the first destination and pick a plan when you are ready.",
  },
  de: {
    eyebrow: "Preise",
    title: "Klare Tarife, die mit deinem Eventvolumen wachsen",
    text: "Jeder Tarif enthält Browser- und Server-Side-Tracking, alle Standard-Destinations, den AI-Assistenten, die Consent Engine und den Live Event Debugger. Wähle nach Websites, monatlichen Events, Teamgröße und Aufbewahrung. Preise netto in EUR; abgerechnet wird über Stripe.",
    hero: { facts: ["Monatliche Abrechnung als Standard, Kündigung zum Periodenende", "Nettopreise in EUR, zzgl. USt., sofern anwendbar", "{trialDays} Tage {trialPlan} testen, ohne Kreditkarte"] },
    interval: {
      legend: "Abrechnungszeitraum",
      monthly: "Monatlich",
      yearly: "Jährlich",
      monthlyHint: "Abrechnung jeden Monat. Kündigung zum Ende der laufenden Periode.",
      yearlyHint: "Einmal pro Jahr im Voraus. Der Jahrespreis entspricht zehn Monatsraten.",
      announceMonthly: "Monatspreise werden angezeigt.",
      announceYearly: "Jahrespreise werden angezeigt.",
    },
    perMonth: "pro Monat",
    perYear: "pro Jahr",
    yearlyNote: (yearly, monthly) => `${yearly} pro Jahr bei jährlicher Vorauszahlung, rechnerisch ${monthly} pro Monat.`,
    custom: "Custom",
    customText: "Individuelles Volumen, Vertrag und SLA.",
    recommended: "Empfohlen",
    overage: (price, events) => `Optionaler Mehrverbrauch: ${price} je ${events} weitere Events, niemals ungefragt aktiviert.`,
    overageContractual: "Mehrverbrauch wird vertraglich vereinbart.",
    contactSales: "Mit dem Vertrieb sprechen",
    start: "Jetzt starten",
    plansLabel: "Tarife",
    plan: {
      perMonth: "pro Monat",
      perYear: "pro Jahr",
      billedMonthly: "Monatliche Abrechnung. Kündigung zum Periodenende.",
      billedYearly: "{total} einmal pro Jahr belastet",
      equivalent: "≈ {monthly} pro Monat",
      instalments: "entspricht {n} Monatsraten",
      eventsLabel: "akzeptierte Events pro Monat",
      sites: "Websites",
      team: "Team",
      retention: "Aufbewahrung",
      unlimited: "Unbegrenzt (Fair Use)",
      days: "{n} Tage",
      months: "{n} Monate",
      choose: "{plan} wählen",
      trialHint: "Inklusive {days} Tage Testphase, keine Kreditkarte nötig",
      overageHint: "Optionaler Mehrverbrauch: {price} je {events} weitere Events, nur mit deiner ausdrücklichen Entscheidung.",
      recommended: "Empfohlen",
      listLabel: "Das bringt {plan} zusätzlich",
    },
    tax: {
      title: "Steuern und Rechnungen",
      text: "Alle Preise verstehen sich netto in EUR ohne Umsatzsteuer. Die Umsatzsteuer kommt hinzu, sofern sie nach deinem Rechnungsland anfällt. Unternehmen geben ihre USt-IdNr. im Checkout an; Rechnungen zu jeder Zahlung findest du im Billing-Portal.",
    },
    enterprise: {
      lead: "Individuelles Volumen, Governance und Infrastruktur",
      text: "Für Organisationen, die individuelle Event- und Site-Volumina, ein eigenes Rollenmodell, vertragliche Supportzeiten und einen Security Review brauchen. Wir planen das Setup gemeinsam mit dir; Preis, Mehrverbrauch und Aufbewahrung werden vertraglich vereinbart.",
      price: "Custom",
      benefitsTitle: "Das bringt Enterprise zusätzlich",
      trustTitle: "Dieselbe Grundlage wie jeder Tarif",
      trust: ["EU-Datenregion als Standard", "Auftragsverarbeiter nach Art. 28 DSGVO, AVV inklusive", "Row-Level-Mandantentrennung in der Datenbank", "Envelope-verschlüsselte Zugangsdaten; Secrets erreichen nie Chat, Logs oder das Modell", "Signierte, versionierte Konfigurationen mit Rollback"],
      cta: "Mit dem Vertrieb sprechen",
      secondary: "Demo buchen",
      overage: "Mehrverbrauch, Aufbewahrung und Volumen werden vertraglich vereinbart.",
    },
    included: "In jedem Tarif enthalten",
    includedItems: ["Datenschutz- und Consent-Funktionen", "Sicherheitsfunktionen", "Datenexport und Löschung", "AI-Assistent in jedem bezahlten Tarif"],
    includedSection: {
      title: "In jedem Tarif enthalten",
      text: "Die Grundfunktionen sind nie hinter einer Paywall: Datenschutz-, Consent-, Sicherheits-, Export- und Löschfunktionen funktionieren in jedem Tarif, und der AI-Assistent gehört zu jedem bezahlten Tarif. Upgrades bringen Volumen, Teamgröße, Aufbewahrung und erweiterte Module.",
      note: "Aus dem Tarifkatalog: jeder bezahlte Tarif enthält",
    },
    tools: {
      title: "Tarif finden und Kosten abschätzen",
      text: "Beide Werkzeuge nutzen denselben Tarifkatalog wie Checkout und Abrechnung: dieselben Limits, dieselben Preise, dieselben Eventpakete. Hier wird nichts gekauft.",
    },
    faqTitle: "Häufige Fragen",
    finder: {
      title: "Welcher Tarif passt?",
      text: "Beantworte vier Fragen. Die Empfehlung entsteht deterministisch aus dem Tarifkatalog: der kleinste Tarif, dessen Limits alle deine Antworten abdecken.",
      sites: "Produktive Websites",
      events: "Akzeptierte Events pro Monat",
      team: "Teammitglieder",
      retention: "Benötigte Eventaufbewahrung",
      retentionDays: "{n} Tage",
      retentionMonths: "{n} Monate",
      retentionLonger: "Länger als {n} Monate",
      eventsMore: "Mehr als {n}",
      resultLabel: "Empfehlung",
      result: "{plan} deckt dein Setup ab",
      resultEnterprise: "Dein Setup braucht eine Enterprise-Vereinbarung",
      resultEnterpriseText: "Mindestens eine Antwort liegt über den Pro-Limits. Individuelle Volumina, Aufbewahrung und Teamgröße werden vertraglich vereinbart.",
      checks: { sites: "Websites", events: "Events pro Monat", team: "Teammitglieder", retention: "Aufbewahrung" },
      limitOf: "{wanted} von {limit}",
      noCap: "{wanted}, kein festes Limit",
      cta: "Mit {plan} fortfahren",
      ctaEnterprise: "Mit dem Vertrieb sprechen",
      priceMonthly: "{price} pro Monat",
      priceYearly: "{price} pro Jahr, im Voraus",
    },
    calculator: {
      title: "Kosten abschätzen",
      text: "Bewege den Regler oder gib deine erwarteten akzeptierten Events pro Monat ein. Die Schätzung zeigt Tarifpreis, benötigte Eventpakete und ob ein höherer Tarif günstiger ist, bevor du etwas kaufst.",
      plan: "Tarif",
      events: "Erwartete akzeptierte Events pro Monat",
      slider: "Events pro Monat",
      eventsInput: "Genaue Anzahl Events",
      base: "Tarifpreis",
      included: "Enthaltene Events",
      above: "Events über dem Limit",
      packs: "Benötigte Eventpakete",
      packsValue: "{n} × {events} Events zu je {price}",
      packsNone: "Keine",
      overageCost: "Mehrverbrauch",
      total: "Geschätzte Gesamtkosten",
      perMonth: "pro Monat",
      perYear: "pro Jahr",
      cheaper: "{plan} würde für dieses Volumen {total} kosten, {savings} weniger als {current} mit Eventpaketen.",
      cheaperCta: "Mit {plan} rechnen",
      noCheaper: "Kein höherer Tarif ist für dieses Volumen günstiger.",
      beyondPro: "Volumen über dem Pro-Limit lassen sich auch individuell in einem Enterprise-Vertrag vereinbaren.",
      policyNote: "Eventpakete werden nur berechnet, wenn du Mehrverbrauch ausdrücklich erlaubst. Standardmäßig pausiert die Verarbeitung beim Limit nach der Grace Period, und du wirst bei {thresholds} deines Limits gewarnt.",
      cta: "Mit {plan} fortfahren",
    },
    matrix: {
      title: "Alle Tarife vergleichen",
      text: "Alles, was jeder Tarif enthält, nach Bereichen gruppiert: zuerst Limits und Preise, dann die Module.",
      feature: "Leistung",
      included: "Enthalten",
      notIncluded: "Nicht enthalten",
      custom: "Individuell",
      contractual: "Vertraglich",
      planLabel: "Tarif zum Anzeigen wählen",
      groups: {
        limits: "Limits und Preise",
        tracking: "Tracking und Destinations",
        commerce: "E-Commerce-Events",
        ai: "AI-Assistent",
        quality: "Datenqualität und Monitoring",
        governance: "Governance und Consent",
        data: "Daten, Attribution und Exporte",
        support: "Support und Onboarding",
        enterprise: "Enterprise",
      },
      rows: { sites: "Produktive Websites", events: "Akzeptierte Events pro Monat", team: "Teammitglieder", retention: "Eventaufbewahrung", monthly: "Monatspreis", yearly: "Jahrespreis, im Voraus", overage: "Optionales Eventpaket" },
      unlimited: "Unbegrenzt innerhalb der Fair-Use-Grenzen",
      days: "{n} Tage",
      months: "{n} Monate",
      pack: "{price} je {events} Events",
      perMonth: "pro Monat",
      perYear: "pro Jahr",
      summaryCount: "{included} von {total} enthalten",
    },
    whatCounts: "Was zählt als Event?",
    whatCountsText: "Ein Event wird genau einmal gezählt, wenn es von der Track-Ingestion erfolgreich angenommen wurde. Die Weiterleitung desselben Events an mehrere Destinations erhöht den Verbrauch nicht.",
    events: {
      notCountedTitle: "Nie berechnet",
      diagramTitle: "So wird ein Event gezählt",
      diagramDescription: "Eine Website sendet ein Event an Track. Track nimmt es einmal an und zählt es einmal. Anschließend leitet Track dasselbe Event an Meta, Google Ads und TikTok weiter; die Weiterleitung erhöht den Verbrauch nicht.",
      diagramCaption: "Ein akzeptiertes Event wird einmal berechnet, egal wie viele Destinations es erhalten.",
      nodes: { website: "Website", track: "Track", trackSub: "angenommen · einmal gezählt", destinations: ["Meta", "Google Ads", "TikTok"], fanOut: "Weiterleitung zählt nicht" },
    },
    overageTitle: "Mehrverbrauch und Kostenkontrolle",
    overageText: "Wenn du dich deinem monatlichen Eventlimit näherst, wirst du früh gewarnt, siehst eine Verbrauchsprognose und entscheidest selbst, wie zusätzliche Events behandelt werden. Nichts wird still gekauft oder umgestellt.",
    overageSection: {
      packsTitle: "Eventpakete je Tarif",
      packPlan: "Tarif",
      packSize: "Paketgröße",
      packPrice: "Preis je Paket",
      packEnterprise: "Vertraglich vereinbart",
      policyTitle: "Du entscheidest, wie Mehrverbrauch behandelt wird",
      policyText: "Mehrverbrauch wird niemals ohne deine Entscheidung aktiviert. In den Billing-Einstellungen wählst du eine von drei Regeln:",
      defaultTag: "Standard",
      thresholds: "Bei {thresholds} deines monatlichen Limits wirst du gewarnt und siehst eine Verbrauchsprognose.",
      grace: "Bei der Pausieren-Regel läuft die Verarbeitung bis zu {percent} % über dem Limit weiter, bevor sie pausiert; die Grace Period wird im Dashboard angezeigt.",
      honest: "Das Dashboard sagt dir ehrlich, ob ein Eventpaket oder der nächsthöhere Tarif günstiger ist. Es gibt keinen stillen Tarifwechsel, keinen ungefragten Kauf und kein Löschen von Konfigurationen bei einem Downgrade.",
    },
    trial: {
      title: "{plan} {days} Tage testen",
      text: "Die Testphase läuft im Tarif {plan} mit vollem Funktionsumfang und wird nie von selbst zu einem kostenpflichtigen Abonnement.",
      facts: ["Keine Kreditkarte erforderlich", "Bis zu {events} akzeptierte Testevents", "Keine automatische Umwandlung in einen bezahlten Tarif", "Nach der Testphase bleibt dein Workspace lesbar und exportierbar; nichts wird überraschend gelöscht"],
      cta: "{plan}-Testphase starten",
    },
    faq: [
      { q: "Was zählt als abrechenbares Event?", a: "Ein Event, das die Ingestion angenommen hat, genau einmal gezählt. Ungültige oder abgelehnte Events, erkannte Duplikate, technische Retries, Test- und Debug-Events, interne Systemereignisse und wegen fehlender Einwilligung verworfene Events werden nie berechnet. Die Weiterleitung eines Events an mehrere Destinations erhöht den Verbrauch nicht." },
      { q: "Was passiert beim Erreichen des Limits?", a: "Du wirst bei {thresholds} deines monatlichen Limits gewarnt. Nichts wird still gekauft oder umgestellt: Du entscheidest vorab, ob Eventpakete erlaubt sind, ein monatliches Kostenlimit gilt oder die Verarbeitung beim Limit nach der kommunizierten Grace Period pausiert. Ein Upgrade ist jederzeit möglich." },
      { q: "Wie funktioniert die {trialDays}-tägige Testphase?", a: "Die Testphase läuft {trialDays} Tage im Tarif {trialPlan} ohne Kreditkarte und umfasst bis zu {trialEvents} akzeptierte Events. Sie wird nie von selbst zu einem kostenpflichtigen Abonnement. Danach bleibt dein Workspace lesbar und exportierbar, bis du einen Tarif wählst." },
      { q: "Zahle ich pro Destination?", a: "Nein. Alle Standard-Destinations sind in jedem Tarif enthalten, und ein akzeptiertes Event zählt einmal, unabhängig davon, wie viele Destinations es erhalten." },
      { q: "Zählen Staging- und Preview-Subdomains als Websites?", a: "Nein. Staging- und Preview-Subdomains einer produktiven Website zählen nicht zum Website-Limit." },
      { q: "Welche Steuern fallen an?", a: "Die Preise sind netto in EUR. Die Umsatzsteuer kommt hinzu, sofern sie nach deinem Rechnungsland anfällt. Unternehmen geben ihre USt-IdNr. im Checkout an." },
      { q: "Kann ich den Tarif wechseln oder kündigen?", a: "Upgrades gelten sofort. Monatstarife enden zum Ende der laufenden Periode, Jahrestarife laufen bis zum Ende des vorausbezahlten Jahres. Kündigung und Tarifwechsel erledigst du im Stripe-Billing-Portal. Ein Downgrade löscht nie still Konfigurationen, und deine Daten bleiben für die konfigurierte Aufbewahrungsfrist erhalten und können exportiert werden." },
      { q: "Ist der AI-Assistent begrenzt?", a: "Der AI-Assistent ist in jedem bezahlten Tarif enthalten. Normale Antworten, Rückfragen und Validierungen werden nicht gezählt, und du siehst nie Modell-Tokens." },
      { q: "Wie funktioniert die Enterprise-Abrechnung?", a: "Enterprise-Tarife werden individuell bepreist und per Rechnung oder Bestellung (PO) abgerechnet, mit vertraglichen Volumina, Aufbewahrung, SLA und Supportzeiten. Sprich mit dem Vertrieb, um das Setup zu planen." },
    ],
    cta: "Mit Track starten",
    ctaText: "Lege deine Site ohne Kreditkarte an, konfiguriere die erste Destination und wähle einen Tarif, wenn du bereit bist.",
  },
};
