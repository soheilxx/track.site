import type { AppLocale } from "@/i18n/routing";
import type { ContactFormCopy } from "@/components/marketing/contact-form";
import type { DemoConsent, DemoCurrency, DemoDedup, DemoHealthPart, DemoHealthTone, DemoOrigin, DemoOutcome, DemoReason, DemoViewId } from "@/components/marketing/demo/model";

/**
 * Locale model of the marketing copy.
 *
 * `COPY_LOCALES` are the locales that have typed marketing copy today. They are a subset of the
 * programme's `ALL_LOCALES` (checked by `satisfies`) and must stay a superset of `ACTIVE_LOCALES`
 * (checked in pick.test.ts), so an active public locale is never served English copy. fr/es/it/nl
 * are added here in the localization phase together with their texts.
 */
export const COPY_LOCALES = ["en", "de"] as const satisfies readonly AppLocale[];
export type CopyLocale = (typeof COPY_LOCALES)[number];

/** Name kept for existing imports (`import type { Locale } from "@/lib/marketing-copy"`). */
export type Locale = CopyLocale;

/** One object per copy locale, all of the same shape. */
export type LocalizedCopy<T> = Record<CopyLocale, T>;

export type { ContactFormCopy };

export interface FaqItem {
  q: string;
  a: string;
}

export interface TitledText {
  title: string;
  text: string;
}

/* ---------------------------------------------------------------- features */

export interface FeatureCopy {
  slug: string;
  title: string;
  short: string;
  intro: string;
  sections: TitledText[];
  bullets: string[];
  faq: FaqItem[];
}

/* ------------------------------------------------------------ how it works */

export interface HowItWorksCopy {
  title: string;
  intro: string;
  steps: TitledText[];
  architecture: TitledText[];
  faq: FaqItem[];
}

/* ------------------------------------------------------------------ shared */

export interface SharedCopy {
  nav: {
    brandHome: string;
    features: string;
    integrations: string;
    howItWorks: string;
    pricing: string;
    docs: string;
    trackingKnowledge: string;
    login: string;
    signup: string;
    openMenu: string;
    closeMenu: string;
    language: string;
    skipToContent: string;
  };
  footer: {
    tagline: string;
    region: string;
    rights: string;
    legalNote: string;
    columns: { product: string; integrations: string; trust: string; company: string };
    links: Record<
      "features" | "howItWorks" | "integrations" | "pricing" | "docs" | "meta" | "ga4" | "googleAds" | "shopify" | "woocommerce" | "shopware" | "security" | "privacy" | "dataProcessing" | "subprocessors" | "terms" | "imprint" | "trackingKnowledge" | "contact" | "demo" | "support" | "status",
      string
    >;
  };
  /** Verifiable product facts shown as a trust strip (never invented social proof). */
  trust: { eu: string; consent: string; signed: string; noCode: string };
  cta: {
    /** Primary call to action (domain entry / signup). */
    primary: string;
    secondary: string;
    /** Closing section of a page. */
    final: { title: string; text: string; cta: string };
  };
}

/* -------------------------------------------------------------------- home */

/**
 * Labels of the interactive hero demo (docs/12 §5). Function-free on purpose: the object crosses the
 * server → client boundary as a prop, so counts are inserted through `{placeholders}` (see
 * `components/marketing/demo/text.ts`). Keys mirror the demo vocabulary in
 * `components/marketing/demo/model.ts`.
 */
export interface DemoCopy {
  /** Visible labelling of the demo as sample data (`sampleShort` on narrow viewports). */
  label: string;
  sample: string;
  sampleShort: string;
  region: string;
  /** "Config v{version} live" */
  configLive: string;
  controls: { reset: string; pause: string; play: string; next: string; paused: string; reducedMotion: string; offscreen: string; complete: string };
  viewsLabel: string;
  views: Record<DemoViewId, string>;
  metrics: Record<"accepted" | "delivered" | "duplicates" | "blocked" | "held", string>;
  health: { title: string; outOf: string; explain: string; parts: Record<DemoHealthPart, { label: string; detail: string }> };
  events: {
    title: string;
    latest: string;
    origin: Record<DemoOrigin, string>;
    dedup: Record<DemoDedup, string>;
    consent: Record<DemoConsent, string>;
    outcome: Record<DemoOutcome, string>;
    reasons: Record<DemoReason, string>;
    /** "{n} destination" / "{n} destinations" */
    routedTo: { one: string; other: string };
    none: string;
    columns: { event: string; origin: string; consent: string; outcome: string; time: string };
    detail: { eventId: string; value: string; currency: string; missing: string; order: string; destinations: string; route: string; expand: string; collapse: string; consentLabel: string; dedupLabel: string };
  };
  flow: { website: string; track: string; consent: string; destinations: string; caption: string };
  destinations: {
    title: string;
    pick: string;
    health: Record<DemoHealthTone, string>;
    lastDelivery: string;
    none: string;
    modes: string;
    browserServer: string;
    dedupKey: string;
    clickParam: string;
    counts: { delivered: string; held: string; blocked: string };
    /** "{n} Purchase held until a currency is set" */
    heldHint: { one: string; other: string };
    openAi: string;
  };
  ai: {
    title: string;
    from: string;
    /** "{n} Purchase events …" (one/other) */
    found: { one: string; other: string };
    foundNone: string;
    evidence: string;
    evidenceRow: string;
    question: string;
    options: Record<DemoCurrency, string>;
    confirm: string;
    /** "Config v{version} … {released} …" (one/other by released) */
    result: { one: string; other: string; zero: string };
    note: string;
    overviewHint: { one: string; other: string };
    overviewDone: string;
    open: string;
    stepLabel: string;
  };
  attribution: {
    title: string;
    intro: string;
    columns: { platform: string; clickId: string; captured: string; consent: string; forwarded: string };
    captured: Record<"yes" | "no", string>;
    forwarded: Record<"yes" | "no" | "na", string>;
    consentNa: string;
    note: string;
  };
  /** Live-region sentences: "{name}", "{origin}", "{outcome}" */
  announce: { event: string; setupDone: string; reset: string };
  mobileHint: string;
}

export interface HomeCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  ctaSecondary: string;
  domainPlaceholder: string;
  domainLabel: string;
  domainHelp: string;
  /** Honest validation message: only a format check ran, no site analysis. */
  domainInvalid: string;
  trust: { eu: string; consent: string; signed: string; noCode: string };
  /** Accessible heading of the demo region in the hero. */
  demoHeading: string;
  platforms: { title: string; text: string; all: string; groups: { ads: string; analytics: string; commerce: string }; modes: { browser: string; server: string; offline: string } };
  outcomes: { eyebrow: string; title: string; text: string; items: Array<{ title: string; text: string; proof: string }> };
  flow: { eyebrow: string; title: string; text: string; steps: TitledText[]; snippetTitle: string; copy: string; copied: string; caption: string; nodes: { website: string; track: string; consent: string; destination: string }; more: string };
  aiSetup: {
    eyebrow: string;
    title: string;
    text: string;
    bullets: string[];
    transcriptLabel: string;
    transcript: Array<{ role: "assistant" | "you"; text: string }>;
    approval: { title: string; diff: string[]; confirm: string; cancel: string };
    note: string;
    more: string;
  };
  useCases: { eyebrow: string; title: string; text: string; items: Array<{ title: string; text: string; points: string[] }> };
  trustSection: { eyebrow: string; title: string; text: string; groups: Array<{ title: string; items: string[] }>; links: { security: string; privacy: string; dpa: string; subprocessors: string } };
  knowledge: { eyebrow: string; title: string; text: string; all: string; minutes: string };
  pricing: { eyebrow: string; title: string; text: string; perMonth: string; events: string; sites: { one: string; other: string }; custom: string; customText: string; trial: string; all: string; taxNote: string; recommended: string; enterprise: string; enterpriseText: string; contact: string };
  finalCta: { title: string; text: string; cta: string; secondary: string };
  demo: DemoCopy;
}

/* ------------------------------------------------------------ integrations */

export interface IntegrationsCopy {
  eyebrow: string;
  title: string;
  text: string;
  groups: { 1: string; 2: string; 3: string; commerce: string };
  browser: string;
  server: string;
  offline: string;
  cta: string;
  ctaText: string;
  start: string;
  how: string;
}

/* ----------------------------------------------------------------- pricing */

export interface PricingCopy {
  eyebrow: string;
  title: string;
  text: string;
  perMonth: string;
  perYear: string;
  yearlyNote: (yearly: string, monthly: string) => string;
  custom: string;
  customText: string;
  recommended: string;
  overage: (price: string, events: string) => string;
  overageContractual: string;
  contactSales: string;
  start: string;
  included: string;
  includedItems: string[];
  whatCounts: string;
  whatCountsText: string;
  overageTitle: string;
  overageText: string;
  faq: FaqItem[];
  cta: string;
  ctaText: string;
}

/* -------------------------------------------------------------------- auth */

/** Auth shell copy (titles and signals). Form labels and errors stay in messages/{locale}/auth.json. */
export interface AuthCopy {
  login: { title: string; subtitle: string };
  signup: { title: string; subtitle: string; terms: string };
}

/* --------------------------------------------------------------- secondary */

export interface SecondaryCopy {
  docs: { title: string; intro: string; toc: string };
  support: { title: string; intro: string; docs: string; status: string; placeholder: string };
  contact: { title: string; intro: string; enterprise: string };
  demo: { title: string; intro: string; agenda: string[]; placeholder: string };
  status: {
    title: string;
    intro: string;
    component: string;
    state: string;
    checked: string;
    ok: string;
    degraded: string;
    down: string;
    db: string;
    queue: string;
    worker: string;
    collector: string;
    none: string;
    incidents: string;
    noIncidents: string;
    note: string;
  };
  security: { title: string; intro: string };
}
