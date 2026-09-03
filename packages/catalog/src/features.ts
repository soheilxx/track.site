import type { Label } from "./types.ts";

/** Feature gates. Plans list them cumulatively (Growth includes Starter, Pro includes Growth). */
export const FEATURE_KEYS = [
  // included in every paid plan (owner supplement §5: privacy, consent, security, export and deletion basics are never paywalled)
  "server_side_tracking",
  "all_standard_destinations",
  "ai_assistant",
  "consent_engine",
  "event_debugger",
  "tracking_health",
  "config_versioning",
  "standard_ecommerce_events",
  "email_support",
  // Growth
  "advanced_ecommerce_events",
  "cross_domain_tracking",
  "offline_conversions",
  "enhanced_matching",
  "data_quality_inbox",
  "funnel_revenue_reconciliation",
  "anomaly_detection",
  "scheduled_ai_audits",
  "priority_support",
  // Pro
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
  // Enterprise
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
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureGroup = "tracking" | "ai" | "quality" | "commerce" | "governance" | "data" | "support" | "enterprise";

export interface FeatureDefinition {
  key: FeatureKey;
  group: FeatureGroup;
  label: Label;
}

const f = (key: FeatureKey, group: FeatureGroup, en: string, de: string): FeatureDefinition => ({ key, group, label: { en, de } });

export const FEATURES: Readonly<Record<FeatureKey, FeatureDefinition>> = {
  server_side_tracking: f("server_side_tracking", "tracking", "Browser and server-side tracking incl. supported conversion APIs", "Browser- und Server-Side-Tracking einschließlich unterstützter Conversion APIs"),
  all_standard_destinations: f("all_standard_destinations", "tracking", "All standard destinations without a connector paywall", "Alle Standard-Destinations ohne künstliche Connector-Sperre"),
  ai_assistant: f("ai_assistant", "ai", "AI-guided setup and product-related chat", "AI-geführtes Setup und normale produktbezogene Chatnutzung"),
  consent_engine: f("consent_engine", "governance", "Consent engine", "Consent Engine"),
  event_debugger: f("event_debugger", "quality", "Live event debugger", "Live Event Debugger"),
  tracking_health: f("tracking_health", "quality", "Tracking health", "Tracking Health"),
  config_versioning: f("config_versioning", "governance", "Configuration versioning", "Config-Versionierung"),
  standard_ecommerce_events: f("standard_ecommerce_events", "commerce", "Standard e-commerce events", "Standard-E-Commerce-Events"),
  email_support: f("email_support", "support", "E-mail support", "E-Mail-Support"),
  advanced_ecommerce_events: f("advanced_ecommerce_events", "commerce", "Advanced e-commerce events, subscriptions, refunds and returns", "Erweiterte E-Commerce-Events, Subscriptions, Refunds und Returns"),
  cross_domain_tracking: f("cross_domain_tracking", "tracking", "Cross-domain tracking", "Cross-Domain-Tracking"),
  offline_conversions: f("offline_conversions", "tracking", "Offline conversions", "Offline Conversions"),
  enhanced_matching: f("enhanced_matching", "tracking", "Enhanced matching / enhanced conversions where consent-compliant and supported by the destination", "Enhanced Matching/Enhanced Conversions, soweit consent-konform und vom Ziel unterstützt"),
  data_quality_inbox: f("data_quality_inbox", "quality", "Data quality inbox", "Data Quality Inbox"),
  funnel_revenue_reconciliation: f("funnel_revenue_reconciliation", "quality", "Funnel and revenue reconciliation", "Funnel-/Revenue-Abgleich"),
  anomaly_detection: f("anomaly_detection", "quality", "Automatic anomaly detection", "Automatische Anomalieerkennung"),
  scheduled_ai_audits: f("scheduled_ai_audits", "ai", "Scheduled AI tracking audits", "Geplante AI-Tracking-Audits"),
  priority_support: f("priority_support", "support", "Priority support", "Priorisierter Support"),
  multi_store_agency: f("multi_store_agency", "governance", "Multi-store, multi-domain and agency structures", "Multi-Store-, Multi-Domain- und Agenturstrukturen"),
  fine_grained_roles: f("fine_grained_roles", "governance", "Fine-grained roles", "Feinere Rollen"),
  approval_workflows: f("approval_workflows", "governance", "Approval workflows", "Freigabeprozesse"),
  four_eyes_principle: f("four_eyes_principle", "governance", "Four-eyes principle", "Vier-Augen-Prinzip"),
  full_audit_log: f("full_audit_log", "governance", "Full audit log", "Vollständiges Audit Log"),
  event_replay: f("event_replay", "data", "Event replay", "Event Replay"),
  advanced_attribution: f("advanced_attribution", "data", "Advanced attribution and root-cause analysis", "Erweiterte Attribution und Root-Cause-Analysen"),
  warehouse_exports: f("warehouse_exports", "data", "Data warehouse exports", "Data-Warehouse-Exporte"),
  streaming_exports: f("streaming_exports", "data", "Streaming exports", "Streaming-Exporte"),
  scheduled_exports: f("scheduled_exports", "data", "Scheduled exports", "Geplante Exporte"),
  advanced_alerts: f("advanced_alerts", "quality", "Advanced alerts", "Erweiterte Alerts"),
  priority_onboarding: f("priority_onboarding", "support", "Priority onboarding", "Priorisiertes Onboarding"),
  custom_volume: f("custom_volume", "enterprise", "Custom event, site, retention and data volume", "Individuelles Event-, Site-, Retention- und Datenvolumen"),
  saml_sso: f("saml_sso", "enterprise", "SAML SSO", "SAML SSO"),
  scim: f("scim", "enterprise", "SCIM provisioning", "SCIM"),
  custom_roles: f("custom_roles", "enterprise", "Custom role models", "Individuelle Rollenmodelle"),
  data_residency: f("data_residency", "enterprise", "Custom data residency, single-tenant, private cloud or BYOC where technically offered", "Individuelle Datenresidenz, Single-Tenant, Private Cloud oder BYOC, sofern technisch angeboten"),
  sla: f("sla", "enterprise", "SLA", "SLA"),
  security_review: f("security_review", "enterprise", "Security review", "Security Review"),
  audit_export: f("audit_export", "enterprise", "Audit export", "Audit-Export"),
  contractual_support: f("contractual_support", "enterprise", "Contractual support hours", "Vertragliche Supportzeiten"),
  custom_migrations: f("custom_migrations", "enterprise", "Custom migrations, connectors and implementation support", "Individuelle Migrationen, Connectoren und Implementierungsunterstützung"),
  dedicated_contact: f("dedicated_contact", "enterprise", "Dedicated technical contact", "Dedizierter technischer Ansprechpartner"),
  invoice_po_billing: f("invoice_po_billing", "enterprise", "Invoice and purchase-order billing", "Rechnungs-/PO-Abwicklung"),
};

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FEATURES, value);
}
