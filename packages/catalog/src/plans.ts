import type { FeatureKey } from "./features.ts";
import { CURRENCY, type BillingInterval, type Currency, type Label, type PaidPlanId, type PlanId } from "./types.ts";

/** List price per plan: integers in cents, EUR. Yearly = ten monthly instalments (owner supplement §5). */
export interface PlanPrice {
  currency: Currency;
  monthlyCents: number;
  yearlyCents: number;
}

/**
 * Hard entitlements. `null` means "no fixed cap in this plan": unlimited within fair use (Pro team
 * members) or agreed per contract (Enterprise). The retention is communicated in months for Growth
 * and Pro; `retentionDays` is derived from that promise (see `retentionDaysForMonths`).
 */
export interface PlanLimits {
  sites: number | null;
  eventsPerMonth: number | null;
  teamMembers: number | null;
  retentionDays: number | null;
  retentionMonths: number | null;
}

export interface Plan {
  id: PlanId;
  /** product name shown in every language */
  name: string;
  sortOrder: number;
  /** visually highlighted as "Recommended" (never "most popular" without real usage data) */
  recommended: boolean;
  contactSales: boolean;
  /** the plan whose entitlements this plan includes ("Everything in X, plus …") */
  inherits: PlanId | null;
  audience: Label;
  price: PlanPrice | null;
  limits: PlanLimits;
  /** cumulative feature gates */
  features: readonly FeatureKey[];
  /** at most six purchase-deciding bullets for the first view; the full matrix comes from `features` */
  highlights: readonly Label[];
  /** env variable names holding the Stripe price ids (values are secrets of the deployment, never in code) */
  stripePriceEnv: { monthly: string; yearly: string } | null;
}

/** Days that honour a retention promise given in months, averaged over leap years and rounded up. */
export function retentionDaysForMonths(months: number): number {
  return Math.ceil((months * 365.25) / 12);
}

export function stripePriceEnvName(planId: PaidPlanId, interval: BillingInterval): string {
  return `STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`;
}

const STARTER_FEATURES: readonly FeatureKey[] = [
  "server_side_tracking",
  "all_standard_destinations",
  "ai_assistant",
  "consent_engine",
  "event_debugger",
  "tracking_health",
  "config_versioning",
  "standard_ecommerce_events",
  "email_support",
];

const GROWTH_FEATURES: readonly FeatureKey[] = [
  ...STARTER_FEATURES,
  "advanced_ecommerce_events",
  "cross_domain_tracking",
  "offline_conversions",
  "enhanced_matching",
  "data_quality_inbox",
  "funnel_revenue_reconciliation",
  "anomaly_detection",
  "scheduled_ai_audits",
  "priority_support",
];

const PRO_FEATURES: readonly FeatureKey[] = [
  ...GROWTH_FEATURES,
  "multi_store_agency",
  "fine_grained_roles",
  "approval_workflows",
  "four_eyes_principle",
  "full_audit_log",
  "event_replay",
  "advanced_attribution",
  "warehouse_exports",
  "streaming_exports",
  "scheduled_exports",
  "advanced_alerts",
  "priority_onboarding",
];

const ENTERPRISE_FEATURES: readonly FeatureKey[] = [
  ...PRO_FEATURES,
  "custom_volume",
  "saml_sso",
  "scim",
  "custom_roles",
  "data_residency",
  "sla",
  "security_review",
  "audit_export",
  "contractual_support",
  "custom_migrations",
  "dedicated_contact",
  "invoice_po_billing",
];

export const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: "Starter",
    sortOrder: 1,
    recommended: false,
    contactSales: false,
    inherits: null,
    audience: { en: "A single website, a small shop or the first professional tracking setup", de: "Einzelne Website, kleiner Shop oder erstes professionelles Tracking-Setup" },
    price: { currency: CURRENCY, monthlyCents: 1_900, yearlyCents: 19_000 },
    limits: { sites: 1, eventsPerMonth: 500_000, teamMembers: 2, retentionDays: 90, retentionMonths: null },
    features: STARTER_FEATURES,
    highlights: [
      { en: "Browser and server-side tracking incl. supported conversion APIs", de: "Browser- und Server-Side-Tracking einschließlich unterstützter Conversion APIs" },
      { en: "All standard destinations without a connector paywall", de: "Alle Standard-Destinations ohne künstliche Connector-Sperre" },
      { en: "AI-guided setup and product-related chat", de: "AI-geführtes Setup und normale produktbezogene Chatnutzung" },
      { en: "Consent engine, live event debugger, tracking health and configuration versioning", de: "Consent Engine, Live Event Debugger, Tracking Health und Config-Versionierung" },
      { en: "Standard e-commerce events and e-mail support", de: "Standard-E-Commerce-Events und E-Mail-Support" },
    ],
    stripePriceEnv: { monthly: stripePriceEnvName("starter", "monthly"), yearly: stripePriceEnvName("starter", "yearly") },
  },
  {
    id: "growth",
    name: "Growth",
    sortOrder: 2,
    recommended: true,
    contactSales: false,
    inherits: "starter",
    audience: { en: "Growing shops and marketing teams with several sites", de: "Wachsende Shops und Marketingteams mit mehreren Sites" },
    price: { currency: CURRENCY, monthlyCents: 9_000, yearlyCents: 90_000 },
    limits: { sites: 5, eventsPerMonth: 5_000_000, teamMembers: 10, retentionDays: retentionDaysForMonths(13), retentionMonths: 13 },
    features: GROWTH_FEATURES,
    highlights: [
      { en: "Advanced e-commerce events, subscriptions, refunds and returns", de: "Erweiterte E-Commerce-Events, Subscriptions, Refunds und Returns" },
      { en: "Cross-domain tracking and offline conversions", de: "Cross-Domain-Tracking und Offline Conversions" },
      { en: "Enhanced matching / enhanced conversions where consent-compliant and supported by the destination", de: "Enhanced Matching/Enhanced Conversions, soweit consent-konform und vom Ziel unterstützt" },
      { en: "Data quality inbox, funnel/revenue reconciliation and automatic anomaly detection", de: "Data Quality Inbox, Funnel-/Revenue-Abgleich und automatische Anomalieerkennung" },
      { en: "Scheduled AI tracking audits and priority support", de: "Geplante AI-Tracking-Audits und priorisierter Support" },
    ],
    stripePriceEnv: { monthly: stripePriceEnvName("growth", "monthly"), yearly: stripePriceEnvName("growth", "yearly") },
  },
  {
    id: "pro",
    name: "Pro",
    sortOrder: 3,
    recommended: false,
    contactSales: false,
    inherits: "growth",
    audience: { en: "Agencies, larger shops, several brands and high volumes", de: "Agenturen, größere Shops, mehrere Marken und hohe Volumina" },
    price: { currency: CURRENCY, monthlyCents: 18_000, yearlyCents: 180_000 },
    limits: { sites: 25, eventsPerMonth: 20_000_000, teamMembers: null, retentionDays: retentionDaysForMonths(25), retentionMonths: 25 },
    features: PRO_FEATURES,
    highlights: [
      { en: "Multi-store, multi-domain and agency structures", de: "Multi-Store-, Multi-Domain- und Agenturstrukturen" },
      { en: "Fine-grained roles, approval workflows, four-eyes principle and full audit log", de: "Feinere Rollen, Freigabeprozesse, Vier-Augen-Prinzip und vollständiges Audit Log" },
      { en: "Event replay, advanced attribution and root-cause analysis", de: "Event Replay, erweiterte Attribution und Root-Cause-Analysen" },
      { en: "Data warehouse, streaming and scheduled exports", de: "Data-Warehouse-, Streaming- und geplante Exporte" },
      { en: "Advanced alerts, priority onboarding and priority support", de: "Erweiterte Alerts, priorisiertes Onboarding und priorisierter Support" },
    ],
    stripePriceEnv: { monthly: stripePriceEnvName("pro", "monthly"), yearly: stripePriceEnvName("pro", "yearly") },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    sortOrder: 4,
    recommended: false,
    contactSales: true,
    inherits: "pro",
    audience: { en: "Custom volumes, infrastructure, governance and SLA", de: "Individuelle Volumina, Infrastruktur, Governance und SLA" },
    price: null,
    limits: { sites: null, eventsPerMonth: null, teamMembers: null, retentionDays: null, retentionMonths: null },
    features: ENTERPRISE_FEATURES,
    highlights: [
      { en: "Custom event, site, retention and data volume", de: "Individuelles Event-, Site-, Retention- und Datenvolumen" },
      { en: "SAML SSO, SCIM and custom role models", de: "SAML SSO, SCIM und individuelle Rollenmodelle" },
      { en: "Custom data residency, single-tenant, private cloud or BYOC where technically offered", de: "Individuelle Datenresidenz, Single-Tenant, Private Cloud oder BYOC, sofern technisch angeboten" },
      { en: "SLA, security review, audit export and contractual support hours", de: "SLA, Security Review, Audit-Export und vertragliche Supportzeiten" },
      { en: "Custom migrations, connectors and implementation support", de: "Individuelle Migrationen, Connectoren und Implementierungsunterstützung" },
      { en: "Dedicated technical contact plus invoice and purchase-order handling", de: "Dedizierter technischer Ansprechpartner sowie Rechnungs-/PO-Abwicklung" },
    ],
    stripePriceEnv: null,
  },
];

const BY_ID: ReadonlyMap<PlanId, Plan> = new Map(PLANS.map((p) => [p.id, p]));

export function planById(id: PlanId): Plan {
  const plan = BY_ID.get(id);
  if (!plan) throw new Error(`unknown plan ${id}`);
  return plan;
}

export function findPlan(id: unknown): Plan | null {
  return typeof id === "string" ? (BY_ID.get(id as PlanId) ?? null) : null;
}

/** Plans in display order (Starter → Enterprise). */
export function publicPlanOrder(): readonly Plan[] {
  return [...PLANS].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** List price in cents for the interval, or `null` for custom-priced plans. */
export function listPriceCents(planId: PlanId, interval: BillingInterval): number | null {
  const price = planById(planId).price;
  if (!price) return null;
  return interval === "monthly" ? price.monthlyCents : price.yearlyCents;
}

/** Yearly price spread over twelve months, in cents (may be fractional; format at the edge, never round here). */
export function yearlyMonthlyEquivalentCents(planId: PlanId): number | null {
  const price = planById(planId).price;
  return price ? price.yearlyCents / 12 : null;
}

export function planHasFeature(planId: PlanId, feature: FeatureKey): boolean {
  return planById(planId).features.includes(feature);
}

/** "Everything in <plan>, plus" — the lead-in shown above the highlights of a plan that inherits. */
export function inheritsLabel(plan: Plan): Label | null {
  if (!plan.inherits) return null;
  const parent = planById(plan.inherits).name;
  return { en: `Everything in ${parent}, plus`, de: `Alles aus ${parent}, zusätzlich` };
}

const nf = (locale: "en" | "de", n: number) => new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-IE").format(n);

/** Localised bullets for the hard limits (sites, events, team, retention); numbers formatted per language. */
export function limitBullets(plan: Plan): Label[] {
  const l = plan.limits;
  const out: Label[] = [];
  if (l.sites == null) out.push({ en: "Custom number of production websites", de: "Individuelle Anzahl produktiver Websites" });
  else if (l.sites === 1) out.push({ en: "1 production website; staging and preview subdomains do not count extra", de: "1 produktive Website; Staging-/Preview-Subdomains zählen nicht zusätzlich" });
  else out.push({ en: `${nf("en", l.sites)} production websites`, de: `${nf("de", l.sites)} produktive Websites` });
  if (l.eventsPerMonth == null) out.push({ en: "Custom event volume", de: "Individuelles Eventvolumen" });
  else out.push({ en: `${nf("en", l.eventsPerMonth)} accepted events per month`, de: `${nf("de", l.eventsPerMonth)} akzeptierte Events pro Monat` });
  if (l.teamMembers == null) out.push(plan.contactSales ? { en: "Custom team size", de: "Individuelle Teamgröße" } : { en: "Unlimited team members within fair-use limits", de: "Unbegrenzte Teammitglieder innerhalb der Fair-Use-Grenzen" });
  else out.push({ en: `${nf("en", l.teamMembers)} team members`, de: `${nf("de", l.teamMembers)} Teammitglieder` });
  if (l.retentionMonths != null) out.push({ en: `${nf("en", l.retentionMonths)} months event retention`, de: `${nf("de", l.retentionMonths)} Monate Eventaufbewahrung` });
  else if (l.retentionDays != null) out.push({ en: `${nf("en", l.retentionDays)} days event retention`, de: `${nf("de", l.retentionDays)} Tage Eventaufbewahrung` });
  else out.push({ en: "Custom event retention", de: "Individuelle Eventaufbewahrung" });
  return out;
}
