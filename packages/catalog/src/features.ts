import type { Label, OptionalCatalogLocale } from "./types.ts";

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

const f = (key: FeatureKey, group: FeatureGroup, en: string, de: string, more: Partial<Record<OptionalCatalogLocale, string>> = {}): FeatureDefinition => ({ key, group, label: { en, de, ...more } });

export const FEATURES: Readonly<Record<FeatureKey, FeatureDefinition>> = {
  server_side_tracking: f("server_side_tracking", "tracking", "Browser and server-side tracking incl. supported conversion APIs", "Browser- und Server-Side-Tracking einschließlich unterstützter Conversion APIs", { es: "Tracking en el navegador y server-side, incluidas las APIs de conversiones compatibles", fr: "Tracking navigateur et côté serveur, y compris les API de conversion prises en charge", it: "Tracking browser e server-side, incluse le Conversions API supportate", nl: "Browser- en server-side tracking incl. ondersteunde conversie-API's" }),
  all_standard_destinations: f("all_standard_destinations", "tracking", "All standard destinations without a connector paywall", "Alle Standard-Destinations ohne künstliche Connector-Sperre", { es: "Todos los destinos estándar, sin conectores de pago", fr: "Toutes les destinations standard, sans connecteur payant", it: "Tutte le destinazioni standard, senza connettori a pagamento", nl: "Alle standaard-destinations zonder betaalmuur voor connectoren" }),
  ai_assistant: f("ai_assistant", "ai", "AI-guided setup and product-related chat", "AI-geführtes Setup und normale produktbezogene Chatnutzung", { es: "Configuración guiada por IA y chat relacionado con el producto", fr: "Configuration guidée par l’IA et chat lié au produit", it: "Configurazione guidata dall’AI e chat relativa al prodotto", nl: "AI-begeleide setup en productgerelateerde chat" }),
  consent_engine: f("consent_engine", "governance", "Consent engine", "Consent Engine", { es: "Consent Engine", fr: "Consent Engine", it: "Consent Engine", nl: "Consent Engine" }),
  event_debugger: f("event_debugger", "quality", "Live event debugger", "Live Event Debugger", { es: "Live Event Debugger", fr: "Live Event Debugger", it: "Live Event Debugger", nl: "Live Event Debugger" }),
  tracking_health: f("tracking_health", "quality", "Tracking health", "Tracking Health", { es: "Tracking Health", fr: "Tracking Health", it: "Tracking Health", nl: "Tracking Health" }),
  config_versioning: f("config_versioning", "governance", "Configuration versioning", "Config-Versionierung", { es: "Versionado de configuraciones", fr: "Versionnage des configurations", it: "Versionamento delle configurazioni", nl: "Configuratieversiebeheer" }),
  standard_ecommerce_events: f("standard_ecommerce_events", "commerce", "Standard e-commerce events", "Standard-E-Commerce-Events", { es: "Eventos de e-commerce estándar", fr: "Événements e-commerce standard", it: "Eventi e-commerce standard", nl: "Standaard e-commerce-events" }),
  email_support: f("email_support", "support", "E-mail support", "E-Mail-Support", { es: "Soporte por correo electrónico", fr: "Support par e-mail", it: "Supporto via e-mail", nl: "Support per e-mail" }),
  advanced_ecommerce_events: f("advanced_ecommerce_events", "commerce", "Advanced e-commerce events, subscriptions, refunds and returns", "Erweiterte E-Commerce-Events, Subscriptions, Refunds und Returns", { es: "Eventos de e-commerce avanzados, suscripciones, reembolsos y devoluciones", fr: "Événements e-commerce avancés, abonnements, remboursements et retours", it: "Eventi e-commerce avanzati, abbonamenti, rimborsi e resi", nl: "Geavanceerde e-commerce-events, abonnementen, terugbetalingen en retouren" }),
  cross_domain_tracking: f("cross_domain_tracking", "tracking", "Cross-domain tracking", "Cross-Domain-Tracking", { es: "Tracking cross-domain", fr: "Tracking cross-domain", it: "Tracking cross-domain", nl: "Cross-domain tracking" }),
  offline_conversions: f("offline_conversions", "tracking", "Offline conversions", "Offline Conversions", { es: "Conversiones offline", fr: "Conversions hors ligne", it: "Conversioni offline", nl: "Offline conversies" }),
  enhanced_matching: f("enhanced_matching", "tracking", "Enhanced matching / enhanced conversions where consent-compliant and supported by the destination", "Enhanced Matching/Enhanced Conversions, soweit consent-konform und vom Ziel unterstützt", { es: "Enhanced Matching / Enhanced Conversions cuando el consentimiento lo permite y el destino lo admite", fr: "Enhanced Matching / Enhanced Conversions lorsque le consentement le permet et que la destination les prend en charge", it: "Enhanced Matching / Enhanced Conversions dove conforme al consenso e supportato dalla destinazione", nl: "Enhanced Matching / Enhanced Conversions waar dat in lijn met de toestemming is en door de destination wordt ondersteund" }),
  data_quality_inbox: f("data_quality_inbox", "quality", "Data quality inbox", "Data Quality Inbox", { es: "Data Quality Inbox", fr: "Data Quality Inbox", it: "Data Quality Inbox", nl: "Data Quality Inbox" }),
  funnel_revenue_reconciliation: f("funnel_revenue_reconciliation", "quality", "Funnel and revenue reconciliation", "Funnel-/Revenue-Abgleich", { es: "Conciliación de embudo e ingresos", fr: "Rapprochement funnel / chiffre d’affaires", it: "Riconciliazione di funnel e ricavi", nl: "Funnel- en omzetreconciliatie" }),
  anomaly_detection: f("anomaly_detection", "quality", "Automatic anomaly detection", "Automatische Anomalieerkennung", { es: "Detección automática de anomalías", fr: "Détection automatique des anomalies", it: "Rilevamento automatico delle anomalie", nl: "Automatische anomaliedetectie" }),
  scheduled_ai_audits: f("scheduled_ai_audits", "ai", "Scheduled AI tracking audits", "Geplante AI-Tracking-Audits", { es: "Auditorías de tracking con IA programadas", fr: "Audits de tracking IA planifiés", it: "Audit AI del tracking pianificati", nl: "Geplande AI-trackingaudits" }),
  priority_support: f("priority_support", "support", "Priority support", "Priorisierter Support", { es: "Soporte prioritario", fr: "Support prioritaire", it: "Supporto prioritario", nl: "Support met prioriteit" }),
  multi_store_agency: f("multi_store_agency", "governance", "Multi-store, multi-domain and agency structures", "Multi-Store-, Multi-Domain- und Agenturstrukturen", { es: "Estructuras multitienda, multidominio y de agencia", fr: "Structures multi-boutiques, multi-domaines et agences", it: "Strutture multi-store, multi-dominio e per agenzie", nl: "Multi-store-, multi-domein- en bureaustructuren" }),
  fine_grained_roles: f("fine_grained_roles", "governance", "Fine-grained roles", "Feinere Rollen", { es: "Roles granulares", fr: "Rôles granulaires", it: "Ruoli granulari", nl: "Fijnmazige rollen" }),
  approval_workflows: f("approval_workflows", "governance", "Approval workflows", "Freigabeprozesse", { es: "Flujos de aprobación", fr: "Workflows d’approbation", it: "Flussi di approvazione", nl: "Goedkeuringsworkflows" }),
  four_eyes_principle: f("four_eyes_principle", "governance", "Four-eyes principle", "Vier-Augen-Prinzip", { es: "Principio de los cuatro ojos", fr: "Principe des quatre yeux", it: "Principio dei quattro occhi", nl: "Vier-ogenprincipe" }),
  full_audit_log: f("full_audit_log", "governance", "Full audit log", "Vollständiges Audit Log", { es: "Log de auditoría completo", fr: "Journal d’audit complet", it: "Log di audit completo", nl: "Volledig auditlog" }),
  event_replay: f("event_replay", "data", "Event replay", "Event Replay", { es: "Event Replay", fr: "Event Replay", it: "Event Replay", nl: "Event Replay" }),
  advanced_attribution: f("advanced_attribution", "data", "Advanced attribution and root-cause analysis", "Erweiterte Attribution und Root-Cause-Analysen", { es: "Atribución avanzada y análisis de causa raíz", fr: "Attribution avancée et analyse des causes racines", it: "Attribuzione avanzata e analisi delle cause", nl: "Geavanceerde attributie en root-cause-analyse" }),
  warehouse_exports: f("warehouse_exports", "data", "Data warehouse exports", "Data-Warehouse-Exporte", { es: "Exportaciones a data warehouse", fr: "Exports vers l’entrepôt de données", it: "Esportazioni verso data warehouse", nl: "Exports naar datawarehouse" }),
  streaming_exports: f("streaming_exports", "data", "Streaming exports", "Streaming-Exporte", { es: "Exportaciones en streaming", fr: "Exports en streaming", it: "Esportazioni in streaming", nl: "Streaming-exports" }),
  scheduled_exports: f("scheduled_exports", "data", "Scheduled exports", "Geplante Exporte", { es: "Exportaciones programadas", fr: "Exports planifiés", it: "Esportazioni pianificate", nl: "Geplande exports" }),
  advanced_alerts: f("advanced_alerts", "quality", "Advanced alerts", "Erweiterte Alerts", { es: "Alertas avanzadas", fr: "Alertes avancées", it: "Avvisi avanzati", nl: "Geavanceerde alerts" }),
  priority_onboarding: f("priority_onboarding", "support", "Priority onboarding", "Priorisiertes Onboarding", { es: "Onboarding prioritario", fr: "Onboarding prioritaire", it: "Onboarding prioritario", nl: "Onboarding met prioriteit" }),
  custom_volume: f("custom_volume", "enterprise", "Custom event, site, retention and data volume", "Individuelles Event-, Site-, Retention- und Datenvolumen", { es: "Volumen de eventos, sitios, retención y datos a medida", fr: "Volumes d’événements, de sites, de conservation et de données sur mesure", it: "Volumi di eventi, siti, conservazione e dati su misura", nl: "Event-, site-, bewaar- en datavolume op maat" }),
  saml_sso: f("saml_sso", "enterprise", "SAML SSO", "SAML SSO", { es: "SAML SSO", fr: "SAML SSO", it: "SAML SSO", nl: "SAML SSO" }),
  scim: f("scim", "enterprise", "SCIM provisioning", "SCIM", { es: "Aprovisionamiento SCIM", fr: "Provisionnement SCIM", it: "Provisioning SCIM", nl: "SCIM-provisioning" }),
  custom_roles: f("custom_roles", "enterprise", "Custom role models", "Individuelle Rollenmodelle", { es: "Modelos de roles a medida", fr: "Modèles de rôles sur mesure", it: "Modelli di ruoli su misura", nl: "Rollenmodellen op maat" }),
  data_residency: f("data_residency", "enterprise", "Custom data residency, single-tenant, private cloud or BYOC where technically offered", "Individuelle Datenresidenz, Single-Tenant, Private Cloud oder BYOC, sofern technisch angeboten", { es: "Residencia de datos a medida, single-tenant, nube privada o BYOC cuando se ofrezca técnicamente", fr: "Résidence des données sur mesure, single-tenant, cloud privé ou BYOC lorsque techniquement proposé", it: "Residenza dei dati su misura, single-tenant, private cloud o BYOC dove tecnicamente offerto", nl: "Dataresidentie op maat, single-tenant, private cloud of BYOC waar technisch aangeboden" }),
  sla: f("sla", "enterprise", "SLA", "SLA", { es: "SLA", fr: "SLA", it: "SLA", nl: "SLA" }),
  security_review: f("security_review", "enterprise", "Security review", "Security Review", { es: "Revisión de seguridad", fr: "Revue de sécurité", it: "Security review", nl: "Security review" }),
  audit_export: f("audit_export", "enterprise", "Audit export", "Audit-Export", { es: "Exportación de auditoría", fr: "Export d’audit", it: "Esportazione dell’audit", nl: "Audit-export" }),
  contractual_support: f("contractual_support", "enterprise", "Contractual support hours", "Vertragliche Supportzeiten", { es: "Horas de soporte contractuales", fr: "Heures de support contractuelles", it: "Ore di supporto contrattuali", nl: "Contractuele supporturen" }),
  custom_migrations: f("custom_migrations", "enterprise", "Custom migrations, connectors and implementation support", "Individuelle Migrationen, Connectoren und Implementierungsunterstützung", { es: "Migraciones, conectores y apoyo a la implementación a medida", fr: "Migrations, connecteurs et accompagnement à l’implémentation sur mesure", it: "Migrazioni, connettori e supporto all’implementazione su misura", nl: "Migraties, connectoren en implementatieondersteuning op maat" }),
  dedicated_contact: f("dedicated_contact", "enterprise", "Dedicated technical contact", "Dedizierter technischer Ansprechpartner", { es: "Contacto técnico dedicado", fr: "Interlocuteur technique dédié", it: "Referente tecnico dedicato", nl: "Dedicated technisch aanspreekpunt" }),
  invoice_po_billing: f("invoice_po_billing", "enterprise", "Invoice and purchase-order billing", "Rechnungs-/PO-Abwicklung", { es: "Facturación por factura y orden de compra", fr: "Facturation sur facture et bon de commande", it: "Fatturazione tramite fattura e ordine di acquisto", nl: "Facturatie per factuur en inkooporder" }),
};

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FEATURES, value);
}
