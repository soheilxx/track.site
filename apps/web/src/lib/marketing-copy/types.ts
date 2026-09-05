import type { BillingInterval, FeatureGroup } from "@track-site/catalog";
import type { AppLocale } from "@/i18n/routing";
import type { ContactFormCopy } from "@/components/marketing/contact-form";
import type { DemoConsent, DemoCurrency, DemoDedup, DemoHealthPart, DemoHealthTone, DemoOrigin, DemoOutcome, DemoReason, DemoViewId } from "@/components/marketing/demo/model";
import type { ConsentPurposeId, CredentialKindId, IntegrationAccess, IntegrationCategory, IntegrationKind, IntegrationMode, IntegrationVerification } from "@/lib/integrations-catalog";
import type { AuthorKey, ContentType, Level, RecencyId, TopicId } from "@/lib/knowledge";
import type { FacetKey } from "@/lib/knowledge-search";

/**
 * Locale model of the typed copy (marketing, legal, mail, knowledge labels).
 *
 * Every copy constant carries one entry per programme locale (`ALL_LOCALES` in i18n/routing.ts):
 * the translated object, or `null` while the translation does not exist yet. `pick()` resolves it —
 * strictly for active locales (a `null` throws instead of rendering English on a localized page),
 * with an English fallback only for inactive locales.
 *
 * `COPY_LOCALES` are the locales whose entry is *required by the type system* (`T`, not `T | null`).
 * They must stay a superset of `ACTIVE_LOCALES` (checked in pick.test.ts). Rolling a locale out
 * therefore means: translators fill `<area>/<locale>.ts` and replace `<locale>: null` in every
 * `<area>/index.ts`; the enable stage adds the locale here and to `ACTIVE_LOCALES`, after which a
 * remaining `null` is a compile error. Since the enable stage of 2026-09-04 all six programme
 * locales are copy locales: every copy constant must carry a translated object for each of them.
 * See docs/14-localization.md.
 */
export const COPY_LOCALES = ["en", "de", "fr", "es", "it", "nl"] as const satisfies readonly AppLocale[];
export type CopyLocale = (typeof COPY_LOCALES)[number];

/** Name kept for existing imports (`import type { Locale } from "@/lib/marketing-copy"`). */
export type Locale = CopyLocale;

/**
 * One entry per programme locale: the object for `COPY_LOCALES`, the object or `null` for the rest.
 * Structurally assignable to `Record<AppLocale, T | null>`; `pick()` is the only reader that should
 * decide between strict and fallback behaviour.
 */
export type LocalizedCopy<T> = { [L in AppLocale]: L extends CopyLocale ? T : T | null };

export type { ContactFormCopy };

/*
 * Every copy shape lives in this file (one interface per area, no legacy base/extension pairs).
 * The texts live next to their area in ./<area>.ts; index.ts re-exports everything. Strings that
 * client components render use `{placeholder}` templates instead of functions, because a copy object
 * that crosses the server → client boundary must be serialisable.
 */

export interface FaqItem {
  q: string;
  a: string;
}

export interface TitledText {
  title: string;
  text: string;
}

export interface PluralText {
  one: string;
  other: string;
}

/* ------------------------------------------------------------------ shared: shell */

export interface NavLink {
  /** Locale-neutral path; may carry a hash for in-page anchors (`/docs#install`). */
  href: string;
  label: string;
  /** One line of customer benefit under the label in mega panels (omit in dense lists). */
  description?: string;
}

export interface NavColumn {
  /** Stable id for markup ids and variants (footer: product | integrations | knowledge | company | legal). */
  key?: string;
  title: string;
  links: NavLink[];
  /** Spans two of the three panel columns and lays its links out in two sub-columns. */
  wide?: boolean;
}

export interface NavGroup {
  key: "product" | "integrations" | "resources";
  label: string;
  columns: NavColumn[];
  /** Panel-wide closing link ("All integrations →"). */
  more?: NavLink;
}

export interface HeaderCopy {
  /** Accessible name of the brand link. */
  brandHome: string;
  /** Accessible name of the main navigation landmark. */
  mainNav: string;
  skipToContent: string;
  groups: NavGroup[];
  pricing: NavLink;
  login: NavLink;
  start: NavLink;
  /** Accessible name of the language switcher. */
  language: string;
  openMenu: string;
  closeMenu: string;
  /** Title of the mobile drawer. */
  menuTitle: string;
}

export interface FooterCopy {
  tagline: string;
  /** Verifiable operating fact, no address (there is none to publish here). */
  region: string;
  rights: string;
  legalNote: string;
  language: string;
  columns: NavColumn[];
}

export interface ConsentCategoryCopy {
  label: string;
  text: string;
}

export interface ConsentCopy {
  title: string;
  description: string;
  categories: { necessary: ConsentCategoryCopy; analytics: ConsentCategoryCopy; marketing: ConsentCategoryCopy };
  acceptAll: string;
  declineOptional: string;
  save: string;
  close: string;
  privacy: NavLink;
}

/* ---------------------------------------------------------------- features */

export interface ComparisonRow {
  aspect: string;
  before: string;
  after: string;
}

export interface Comparison {
  title: string;
  text: string;
  beforeLabel: string;
  afterLabel: string;
  rows: ComparisonRow[];
}

/** One feature (/features/[slug]): overview row, detail hero, narrative, before/after and FAQ. */
export interface FeatureCopy {
  slug: string;
  title: string;
  short: string;
  intro: string;
  sections: TitledText[];
  bullets: string[];
  faq: FaqItem[];
  /** Customer benefit in one sentence (overview rows, detail hero). */
  benefit: string;
  /** Narrative next to the feature's data-flow diagram; the diagram carries the same information. */
  flow: { title: string; text: string; caption: string };
  /** What the example product view shows. */
  viewCaption: string;
  comparison: Comparison;
}

export interface FeatureScenario {
  id: "granted" | "withdrawn" | "outage";
  label: string;
  title: string;
  text: string;
  points: string[];
}

export interface FeaturesPageCopy {
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  ctaSecondary: string;
  stage: { title: string; description: string; caption: string };
  scenarios: { title: string; text: string; tabsLabel: string; items: FeatureScenario[] };
  index: { title: string; text: string; more: string };
  comparison: Comparison;
  trust: { title: string; items: TitledText[] };
  closing: { title: string; text: string; cta: string; secondary: string };
}

export interface FeatureDetailLabels {
  features: string;
  breadcrumb: string;
  howBuilt: string;
  howBuiltText: string;
  proof: string;
  proofText: string;
  faq: string;
  more: string;
  moreText: string;
  cta: string;
  ctaText: string;
  start: string;
  pricing: string;
}

export interface StreamRow {
  event: string;
  origin: string;
  consent: string;
  consentTone: "ok" | "warn" | "bad";
  decision: string;
  decisionTone: "ok" | "warn" | "bad";
  destination: string;
}

/** Labels and example fixtures of the static product views (every value is a marked example state). */
export interface FeatureUiCopy {
  example: string;
  exampleHint: string;
  diagram: {
    website: string;
    browser: string;
    server: string;
    track: string;
    gate: string;
    gateGranted: string;
    gateDenied: string;
    gatePending: string;
    dedup: string;
    notUsed: string;
    delivered: string;
    blocked: string;
    retrying: string;
    paused: string;
    destinations: { meta: string; googleAds: string; ga4: string; tiktok: string; linkedin: string };
    /** Prose version of the diagram for assistive technology. */
    describe: (paths: "browser" | "server" | "hybrid", gate: "granted" | "denied" | "pending") => string;
    /** Node labels of the feature-specific chain diagrams (setup, health score, click ids). */
    chains: {
      setup: { ai: string; aiSub: string; tools: string; toolsSub: string; approval: string; approvalSub: string; config: string; configSub: string; website: string; websiteSub: string; describe: string };
      health: { events: string; eventsSub: string; checks: string; checksSub: string; score: string; scoreSub: string; issues: string; issuesSub: string; describe: string };
      attribution: { landing: string; landingSub: string; consent: string; consentSub: string; store: string; storeSub: string; purchase: string; purchaseSub: string; google: string; googleSub: string; meta: string; metaSub: string; describe: string };
    };
  };
  stream: {
    title: string;
    caption: string;
    columns: { event: string; origin: string; consent: string; decision: string; destination: string };
    rows: StreamRow[];
  };
  lineage: {
    title: string;
    caption: string;
    facts: Array<{ label: string; value: string }>;
    attempts: { title: string; columns: { destination: string; status: string; result: string }; rows: Array<{ destination: string; status: string; tone: "ok" | "warn" | "bad"; result: string }> };
    payload: { title: string; copy: string; copied: string; code: string };
  };
  health: {
    title: string;
    caption: string;
    scoreLabel: string;
    score: number;
    componentsLabel: string;
    weight: (percent: number) => string;
    components: Array<{ key: string; label: string; score: number; weight: number; detail: string }>;
    issuesLabel: string;
    issues: Array<{ title: string; detail: string; fix: string; tone: "warn" | "bad" }>;
  };
  consent: {
    title: string;
    caption: string;
    purposesLabel: string;
    purposes: Array<{ label: string; granted: boolean }>;
    granted: string;
    denied: string;
    flagsLabel: string;
    flags: Array<{ key: string; value: "granted" | "denied" }>;
    reasonsLabel: string;
    reasons: Array<{ code: string; text: string }>;
  };
  attribution: {
    title: string;
    caption: string;
    columns: { id: string; captured: string; forwarded: string; retention: string };
    rows: Array<{ id: string; captured: string; forwarded: string; retention: string }>;
    note: string;
  };
  setup: {
    title: string;
    caption: string;
    assistant: string;
    you: string;
    messages: Array<{ from: "assistant" | "you"; text: string }>;
    vault: { title: string; text: string; state: string };
    test: { title: string; text: string; state: string };
    approval: { title: string; text: string; diff: string[]; state: string; action: string };
  };
  destinations: {
    title: string;
    caption: string;
    columns: { destination: string; mode: string; health: string; last: string; queue: string };
    rows: Array<{ destination: string; mode: string; health: string; tone: "ok" | "warn" | "bad" | "neutral"; last: string; queue: string }>;
  };
}

/* ------------------------------------------------------------ how it works */

export interface Milestone extends TitledText {
  /** What the customer does. */
  you: string;
  /** What the customer gets at the end of the milestone. */
  outcome: string;
}

export interface FlowTab {
  id: "browser" | "server" | "hybrid";
  label: string;
  title: string;
  text: string;
  points: string[];
}

export interface CheckGroup {
  title: string;
  items: string[];
}

export interface HowItWorksCopy {
  title: string;
  intro: string;
  eyebrow: string;
  cta: string;
  ctaSecondary: string;
  stage: { title: string; description: string; caption: string };
  milestonesTitle: string;
  milestonesText: string;
  youLabel: string;
  outcomeLabel: string;
  /** Three to four customer milestones (never a step count). */
  steps: Milestone[];
  snippet: { title: string; code: string; copy: string; copied: string; note: string };
  /** Example state of a published configuration (milestone 3). */
  published: { title: string; state: string; facts: Array<{ label: string; value: string }> };
  flows: { title: string; text: string; tabsLabel: string; items: FlowTab[] };
  checks: { title: string; summary: string; intro: string; groups: CheckGroup[] };
  architectureTitle: string;
  architectureText: string;
  architectureColumns: { component: string; responsibility: string };
  architecture: TitledText[];
  faqTitle: string;
  faq: FaqItem[];
  closing: { title: string; text: string; cta: string; secondary: string };
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

/**
 * Localized text of one entry of `@/lib/integrations-catalog` (`INTEGRATION_CATALOG_TEXT`, area
 * `integration-catalog/`): the one-sentence summary, the vendor-side prerequisite note (`null` when
 * the catalogue has none — identical in every language) and the display label of every public id,
 * keyed by the config key (`pixel_id`, `shop_domain`, …). The catalogue itself carries the technical
 * facts plus the English/German source text; the copy area adds the other programme locales.
 */
export interface IntegrationText {
  summary: string;
  accessNote: string | null;
  publicIds: Record<string, string>;
}

/** `IntegrationText` per catalogue `slug`, in catalogue order. */
export type IntegrationCatalogText = Record<string, IntegrationText>;

/**
 * Integrations area (overview with search + filters, detail pages). Every fact rendered next to this
 * copy comes from `@/lib/integrations-catalog` — the copy only labels it.
 */
export interface IntegrationsCopy {
  eyebrow: string;
  title: string;
  text: string;
  cta: string;
  ctaText: string;
  start: string;
  how: string;
  breadcrumbs: { home: string; label: string; nav: string };
  /** Verifiable counts computed from the catalogue at render time. */
  stats: { destinations: (n: number) => string; presets: (n: number) => string; shops: (n: number) => string };
  diagram: {
    title: string;
    description: string;
    caption: string;
    nodes: { website: string; websiteSub: string; server: string; serverSub: string; track: string; trackSub: string; consent: string; ads: string; analytics: string; own: string };
  };
  /** Rendered by a client component: plain strings only (templates with `{shown}`, `{total}`, `{n}`), no functions across the RSC boundary. */
  explorer: {
    heading: string;
    searchLabel: string;
    searchPlaceholder: string;
    clear: string;
    resultsAll: string;
    resultsSome: string;
    categoryFilter: string;
    modeFilter: string;
    allCategories: string;
    allModes: string;
    reset: string;
    emptyTitle: string;
    emptyText: string;
    resultsHeading: string;
    details: string;
    presets: string;
  };
  categories: Record<IntegrationCategory, string>;
  categoryText: Record<IntegrationCategory, string>;
  kinds: Record<IntegrationKind, string>;
  modes: Record<IntegrationMode, string>;
  modeText: Record<IntegrationMode, string>;
  modesSection: { title: string; text: string; hybridTitle: string; hybridText: string };
  verification: Record<IntegrationVerification, string>;
  /** Compact status for list rows. */
  verificationShort: Record<IntegrationVerification, string>;
  verifiedOn: (date: string) => string;
  access: Record<IntegrationAccess, string>;
  purposes: Record<ConsentPurposeId, string>;
  credentialKinds: Record<CredentialKindId, string>;
  oauthProviders: Record<string, string>;
  optional: string;
  detail: {
    eyebrow: Record<IntegrationKind, string>;
    flow: {
      title: (name: string) => string;
      text: Record<IntegrationKind, string>;
      diagramTitle: (name: string) => string;
      caption: Record<IntegrationKind, string>;
      nodes: { website: string; websiteSub: string; server: string; serverSub: string; offline: string; offlineSub: string; shop: string; shopSub: string; track: string; trackSub: string; trackPairing: string; consent: string; destinations: string };
      edges: Record<IntegrationMode, string> & { shop: string };
    };
    modeDetail: Record<IntegrationMode, string>;
    sourceModes: { browser: string; server: string };
    hybrid: (field: string) => string;
    hybridNoField: string;
    sends: {
      title: string;
      intro: string;
      event: string;
      eventId: (field: string) => string;
      eventIdNoField: string;
      clickIds: (ids: string) => string;
      noClickIds: string;
      order: string;
      hashed: string;
      noHashed: string;
      consent: string;
      neverTitle: string;
      never: string[];
    };
    receives: { title: string; intro: string; items: string[]; neverTitle: string; never: string[] };
    facts: { title: string; dedup: string; pairing: string; clickIds: string; purpose: string; apiVersion: string; verified: string; status: string; docs: string; docsLink: (name: string) => string; ownDocs: string; none: string; presets: string };
    ids: { title: string; intro: string; publicIds: string; credentials: string; vault: string; noCredentials: string; key: string; label: string };
    prerequisites: string;
    consent: { title: string; text: Record<ConsentPurposeId, string>; source: string };
    setup: { title: string; intro: string; destination: TitledText[]; source: TitledText[] };
    knowledge: { title: string; text: string; all: string; none: string; minutes: (n: number) => string };
    faq: { title: string; destination: FaqItem[]; source: FaqItem[] };
    cta: { title: (name: string) => string; text: string; start: string; all: string };
  };
}

/* ----------------------------------------------------------------- pricing */

/**
 * Pricing page (supplement §5 layout). Prices, limits, entitlements, packs and the trial never live
 * here — they come from the tariff catalogue through `@/server/pricing`; this is the wording around
 * them, with `{placeholder}` templates filled by `fill()` from components/marketing/pricing.
 */
export interface PricingCopy {
  eyebrow: string;
  title: string;
  text: string;
  hero: { facts: string[] };
  interval: { legend: string; monthly: string; yearly: string; monthlyHint: string; yearlyHint: string; announceMonthly: string; announceYearly: string };
  recommended: string;
  contactSales: string;
  start: string;
  plansLabel: string;
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
  whatCounts: string;
  whatCountsText: string;
  events: { notCountedTitle: string; diagramTitle: string; diagramDescription: string; diagramCaption: string; nodes: { website: string; track: string; trackSub: string; destinations: string[]; fanOut: string } };
  overageTitle: string;
  overageText: string;
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
  faqTitle: string;
  faq: FaqItem[];
  cta: string;
  ctaText: string;
}

/* -------------------------------------------------------------------- auth */

export interface AuthSignal {
  icon: "passkey" | "eu" | "consent";
  title: string;
  text: string;
}

/**
 * Auth shell copy: the chrome around the forms, the setup steps, the signals and the static preview.
 * Form labels, errors and flow-specific strings stay in messages/{locale}/auth.json (the forms are
 * client components that read the catalog through next-intl).
 */
export interface AuthCopy {
  shell: {
    /** Accessible name of the brand link (leads to the start page). */
    brandHome: string;
    /** Landmark label of the compact legal footer. */
    legalLabel: string;
    legal: { privacy: string; terms: string; imprint: string; security: string };
    /** Region statement under the legal links (same fact as the marketing footer). */
    region: string;
    /** Label of the setup-step list shown above signup and e-mail verification. */
    stepsLabel: string;
  };
  /** Three setup steps: account → e-mail → website. Signup is step 1, verification step 2. */
  steps: [string, string, string];
  signals: AuthSignal[];
  preview: {
    eyebrow: string;
    title: string;
    text: string;
    /** Honesty note under the diagram: example values, not live data. */
    caption: string;
    diagram: {
      /** Accessible name of the SVG. */
      title: string;
      website: string;
      websiteSub: string;
      track: string;
      trackSub: string;
      consent: string;
      consentState: string;
      destinations: [string, string, string];
      delivered: string;
    };
  };
  /** Plan hand-over from the pricing page, shown above the signup form: `{plan}`, `{interval}`. */
  plan: { selected: string; intervals: Record<BillingInterval, string> };
}

/* --------------------------------------------------------------- secondary */

export interface DocsGuide {
  id: string;
  title: string;
  text: string;
  code?: string;
  /** Language label of the code sample (html, js, bash). */
  language?: string;
  /** Title of the code block (file name, endpoint, tool). */
  codeTitle?: string;
  bullets?: string[];
}

export interface SecondaryLinkItem {
  title: string;
  text: string;
  /** Locale-neutral path; next-intl's Link adds the prefix. */
  href: string;
}

export interface QuickstartStep extends TitledText {
  /** What the customer can verify in the product after the step. */
  outcome: string;
}

export interface ReferenceRow {
  endpoint: string;
  purpose: string;
  notes: string;
}

export interface ControlRow {
  control: string;
  scope: string;
  mechanism: string;
}

/**
 * Secondary public pages: docs, support, contact, demo, status, security and the frame of the legal
 * pages. The legal texts themselves stay in lib/legal-copy/<locale>.ts; this is only the chrome around them.
 */
export interface SecondaryCopy {
  common: {
    onThisPage: string;
    breadcrumb: string;
    home: string;
    updated: string;
    copy: string;
    copied: string;
    utc: string;
    related: string;
  };
  docs: {
    title: string;
    intro: string;
    toc: string;
    eyebrow: string;
    links: { integrations: string; support: string; knowledge: string };
    quickstart: { title: string; text: string; outcomeLabel: string; steps: QuickstartStep[] };
    flow: {
      title: string;
      text: string;
      caption: string;
      nodes: { website: string; websiteSub: string; track: string; trackSub: string; consent: string; destinations: string };
      labels: { granted: string; held: string };
    };
    guidesTitle: string;
    guides: DocsGuide[];
    reference: { title: string; text: string; columns: { endpoint: string; purpose: string; notes: string }; rows: ReferenceRow[] };
  };
  support: {
    title: string;
    intro: string;
    placeholder: string;
    eyebrow: string;
    formTitle: string;
    before: { title: string; items: SecondaryLinkItem[] };
    include: { title: string; items: string[] };
    reply: string;
  };
  contact: {
    title: string;
    intro: string;
    enterprise: string;
    eyebrow: string;
    formTitle: string;
    topics: { title: string; items: TitledText[] };
    other: { title: string; items: SecondaryLinkItem[] };
  };
  demo: {
    title: string;
    intro: string;
    agenda: string[];
    placeholder: string;
    eyebrow: string;
    formTitle: string;
    agendaTitle: string;
    duration: string;
    prepare: { title: string; items: string[] };
    honest: string;
  };
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
    eyebrow: string;
    componentsTitle: string;
    detail: string;
    /** "{n} pending" */
    pending: string;
    checkedAt: string;
    /** Short node labels of the status diagram (the table carries the long names). */
    flow: { title: string; caption: string; collector: string; queue: string; worker: string; database: string; destinations: string };
    incidentsText: string;
  };
  security: {
    title: string;
    intro: string;
    eyebrow: string;
    flow: {
      title: string;
      text: string;
      caption: string;
      nodes: { website: string; config: string; configSub: string; collector: string; collectorSub: string; queue: string; queueSub: string; policy: string; worker: string; workerSub: string; destination: string; vault: string; vaultSub: string; kill: string };
    };
    controls: { title: string; text: string; columns: { control: string; scope: string; mechanism: string }; rows: ControlRow[] };
    report: { title: string; text: string; missing: string; ack: string };
  };
  legal: {
    eyebrow: string;
    operator: { title: string; company: string; address: string; representatives: string; email: string; phone: string; register: string; vatId: string; dpo: string; missing: string };
    related: { privacy: string; terms: string; dpa: string; subprocessors: string; imprint: string; security: string };
  };
  subprocessors: {
    title: string;
    intro: string;
    processorsTitle: string;
    columns: { name: string; purpose: string; region: string; basis: string };
    vendors: string;
    vendorsText: string;
    updated: string;
  };
  imprint: { title: string; intro: string; dispute: string; liability: string };
}

/* ------------------------------------------------------ tracking knowledge */

/**
 * Tracking Knowledge hub (supplement §6). The product name stays "Tracking Knowledge" in every
 * language; everything around it is localized. Placeholders (`{n}`, `{total}`, `{q}`) are filled by
 * `components/marketing/knowledge/hub/text.ts` because the object crosses the server → client
 * boundary as a prop. No popularity numbers, badges or success rates: every count shown on the page
 * is a real count from the loader.
 */
export interface KnowledgeHubCopy {
  meta: {
    description: string;
    /** Document title of a search view: "{q}" is the query. */
    searchTitle: string;
  };
  breadcrumbs: { label: string; home: string };
  hero: {
    eyebrow: string;
    lead: string;
    articles: PluralText;
    topics: PluralText;
    browse: string;
    rss: string;
  };
  search: {
    label: string;
    placeholder: string;
    clear: string;
    submit: string;
    hint: string;
    /** "{total}" = corpus size. */
    resultsAll: string;
    /** "{n}" hits of "{total}". */
    resultsSome: string;
    /** "{n}" hits of "{total}" for "{q}". */
    resultsQuery: string;
  };
  featured: { eyebrow: string; read: string };
  topics: { eyebrow: string; title: string; text: string; articles: PluralText; descriptions: Record<TopicId, string> };
  paths: { eyebrow: string; title: string; text: string; steps: PluralText; minutes: string; step: string };
  guides: { eyebrow: string; title: string; text: string; platforms: string; shopSystems: string; articles: PluralText };
  fresh: { eyebrow: string; newTitle: string; newText: string; updatedTitle: string; updatedText: string; updatedEmpty: string };
  directory: {
    eyebrow: string;
    title: string;
    text: string;
    filtersTitle: string;
    facets: Record<FacetKey, string>;
    all: string;
    reset: string;
    listLabel: string;
    emptyTitle: string;
    emptyText: string;
    emptyAction: string;
    searching: string;
  };
  card: { minutes: string; published: string; updated: string };
  cta: { eyebrow: string; title: string; text: string; primary: string; secondary: string };
}

export type KnowledgeCtaKey = "ai-setup" | "integrations" | "server-side" | "ecommerce" | "consent" | "attribution" | "data-quality" | "debugger" | "product";

export interface KnowledgeCtaItem {
  title: string;
  text: string;
  label: string;
}

/**
 * Tracking Knowledge article template (supplement §6 "Neues Artikeltemplate"): breadcrumbs, meta
 * labels, table of contents, callout titles, sources, the contextual Track CTA, related articles and
 * the feedback question. CTA texts only repeat what the linked feature pages state.
 */
export interface KnowledgeArticleCopy {
  breadcrumbs: { label: string; home: string };
  meta: { by: string; published: string; updated: string; reviewed: string; readingTime: string; minutes: string };
  /** Accessible name of the reading-progress bar. */
  progress: string;
  toc: string;
  takeaways: string;
  callouts: { note: string; warning: string; privacy: string; practice: string };
  code: { copy: string; copied: string };
  steps: string;
  /** Accessible name of the horizontal scroll region around a table that is wider than the text column. */
  table: string;
  /** Visually hidden state of a GFM task-list item (`- [ ]` / `- [x]`), read before the item text. */
  checklist: { open: string; done: string };
  sources: { heading: string; text: string };
  legal: string;
  editor: string;
  cta: { eyebrow: string; items: Record<KnowledgeCtaKey, KnowledgeCtaItem> };
  related: string;
  feedback: { heading: string; yes: string; no: string; sending: string; thanks: string; error: string };
}

/* ------------------------------------------------------- knowledge: surrounding copy + labels */

/**
 * Surrounding copy of the Tracking Knowledge area used by the index page, the feed and the social
 * cards (`app/[locale]/(marketing)/tracking-knowledge/copy.ts`). `name` is the fixed product name
 * "Tracking Knowledge" in every language (supplement §6).
 */
export interface KnowledgeCopy {
  name: string;
  intro: string;
  cardAlt: string;
  feedDescription: string;
  all: string;
  /** `{n}` = reading minutes. */
  minutes: string;
  rss: string;
  empty: string;
  emptyFiltered: string;
  filtered: string;
  reset: string;
  updated: string;
  published: string;
  reviewed: string;
  sources: string;
  related: string;
  by: string;
  topic: string;
  level: string;
  legal: string;
  breadcrumbHome: string;
}

export interface KnowledgeAuthorLabels {
  displayName: string;
  role: string;
  bio: string;
}

/**
 * Localized labels of the knowledge taxonomy (topic worlds, content types, levels, recency filter)
 * and of the editorial author records. The ids are fixed in `lib/knowledge.ts`; only the texts are
 * translated. Technical topic names ("Server-Side Tracking", "Attribution & Analytics") may stay
 * English where the language area uses the English term.
 */
export interface KnowledgeLabels {
  topics: Record<TopicId, string>;
  contentTypes: Record<ContentType, string>;
  levels: Record<Level, string>;
  recency: Record<RecencyId, string>;
  authors: Record<AuthorKey, KnowledgeAuthorLabels>;
  /** Alt text of the generated 1200×630 social card of an article; `{title}` = article title. */
  socialCardAlt: string;
}
