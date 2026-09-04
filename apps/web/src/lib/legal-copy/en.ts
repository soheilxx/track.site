import type { LegalCopy } from "./index";

/**
 * English (source language) legal and trust documents (security, privacy, data processing, terms). Same shape as
 * every other locale file; see docs/14-localization.md. Operator facts (company, address, DPO) are not in
 * here — they come from the environment (`operatorFromEnv`).
 */

export const LEGAL_EN: LegalCopy = {
  security: {
    title: "Security",
    intro: "How Track protects customer data: architecture, controls and the guarantees you can verify in the product.",
    updated: "2026-09-03",
    sections: [
      { title: "Tenant isolation", paragraphs: ["Every tenant table carries the organization id and PostgreSQL row-level security is enforced for the application role. The worker role bypasses RLS only for the partitioned event store and audit trail, never for tenant configuration."] },
      { title: "Secrets", paragraphs: ["Vendor credentials are encrypted with envelope encryption (AES-256-GCM data keys wrapped by AWS KMS or a local master key). The assistant, the browser and the logs only ever see a reference and the last four characters."] },
      { title: "Signed configuration", paragraphs: ["Configuration bundles are immutable, versioned and Ed25519-signed. The browser SDK verifies the signature with WebCrypto before applying a configuration and rejects everything else (fail closed)."] },
      { title: "Data plane", paragraphs: ["The collector validates origins, applies rate limits and HMAC-signed server requests and hands events to a durable queue before answering. Workers process with retries, circuit breakers and a dead-letter queue. Kill switches stop collection and delivery per site or organization within seconds."], bullets: ["No fingerprinting, no cross-site identity", "PII scanner blocks personal data in event properties before storage", "IP addresses are truncated on ingest", "Append-only audit log and usage ledger (database triggers)"] },
      { title: "Access and operations", paragraphs: ["Role-based access control with six organization roles, MFA and passkeys, break-glass access with mandatory reason and audit entry, retention jobs per data kind, and a vulnerability disclosure contact published on this page."] },
    ],
  },
  privacy: {
    title: "Privacy policy",
    intro: "This policy explains how the operator of track.site processes personal data of website visitors, customers and their users.",
    updated: "2026-09-03",
    sections: [
      { title: "Controller", paragraphs: ["The controller for this website and the customer account data is the operator named in the imprint. For event data processed on behalf of customers, the customer is the controller and the operator acts as processor under the data processing agreement."] },
      { title: "Data we process as controller", paragraphs: ["Account data (name, e-mail, organization, role), billing data (handled by Stripe; we store customer and subscription ids), support requests, security logs (truncated IP, user agent family) and cookies strictly required for authentication and language preference."] },
      { title: "Data we process as processor", paragraphs: ["Events sent by customers' websites and systems: event name and parameters, consent state, pseudonymous identifiers, hashed matching data, truncated IP and page context, plus the delivery records to the destinations the customer configured. Processing follows the customer's consent policy; without the required purpose no data is stored or transmitted."] },
      { title: "Purposes and legal basis", paragraphs: ["Contract performance (Art. 6(1)(b) GDPR) for accounts, billing and support; legitimate interest (Art. 6(1)(f)) for security and abuse prevention; consent (Art. 6(1)(a)) where a customer's visitor agreed to analytics or marketing purposes; legal obligations (Art. 6(1)(c)) for accounting records."] },
      { title: "Recipients and transfers", paragraphs: ["Subprocessors are listed on the subprocessors page. Transfers outside the EU rely on standard contractual clauses or the EU-US Data Privacy Framework. Advertising vendors receive data only for destinations the customer configured, and the wizard shows the recipient and transfer basis for each."] },
      { title: "Retention", paragraphs: ["Events 13 months, click ids 90 days, consent snapshots 3 years, delivery attempts 90 days, audit log 2 years, chat transcripts 30 days, DSAR records 3 years — configurable per organization within these maxima. Account data is deleted 30 days after account closure."] },
      { title: "Your rights", paragraphs: ["Access, rectification, erasure, restriction, portability and objection. Customers process visitor requests through the privacy center; visitors can contact the operator directly. You may lodge a complaint with a supervisory authority."] },
      { title: "AI assistant", paragraphs: ["The setup assistant uses the OpenAI Responses API with zero data retention. Secrets and personal data are redacted before a message reaches the model; the model can only act through typed tools that are validated and audited server-side."] },
    ],
  },
  "data-processing": {
    title: "Data processing agreement",
    intro: "Summary of the processor terms that apply to customer event data. The full agreement is provided during onboarding and on request.",
    updated: "2026-09-03",
    sections: [
      { title: "Subject matter", paragraphs: ["Collection, normalization, consent evaluation, storage and delivery of website and server events to destinations configured by the customer, plus dashboards, diagnostics and the setup assistant."] },
      { title: "Instructions", paragraphs: ["The customer instructs the operator through the product configuration: sites, destinations, mappings, consent policy and retention. Configuration versions are signed and auditable, so instructions are documented."] },
      { title: "Technical and organizational measures", paragraphs: ["See the security page: tenant isolation with row-level security, envelope encryption, signed configuration, kill switches, PII scanning, truncated IPs, RBAC with MFA, audit trail, EU hosting."] },
      { title: "Subprocessors", paragraphs: ["Listed on the subprocessors page; customers are informed about changes 30 days in advance and may object."] },
      { title: "Data subject requests and deletion", paragraphs: ["The privacy center processes export and deletion requests against pseudonymous identifiers across all sites of the organization and records the outcome. Retention runs delete data at the end of the configured windows."] },
      { title: "Audit and termination", paragraphs: ["Audit logs, integration matrices and version histories are available in the product. At termination the customer can export data; residual copies are deleted within 30 days."] },
    ],
  },
  terms: {
    title: "Terms of service",
    intro: "The terms under which the operator provides Track to business customers.",
    updated: "2026-09-03",
    sections: [
      { title: "Service", paragraphs: ["Track is a tag manager, consent-aware server-side event router and analytics layer offered as a subscription. Features and limits are described on the pricing page and in the plan the customer selected."] },
      { title: "Customer obligations", paragraphs: ["Customers are responsible for a lawful consent implementation on their properties, for the accuracy of destination configuration and for keeping vendor credentials current. Customers must not send special categories of personal data or use the service for fingerprinting or consent circumvention."] },
      { title: "Fees", paragraphs: ["Fees are billed by Stripe per plan and interval. Usage above the plan limit triggers warnings and a grace period before hard limits apply. Prices are shown on the pricing page as configured in Stripe."] },
      { title: "Availability and support", paragraphs: ["The operator targets high availability of the data plane and publishes incidents on the status page. Support is provided by e-mail; enterprise plans include an SLA."] },
      { title: "Liability", paragraphs: ["Liability is limited to the amount paid in the twelve months before the event, except for intent, gross negligence, injury to life or health and mandatory statutory liability."] },
      { title: "Term and termination", paragraphs: ["Subscriptions renew per interval and can be cancelled to the end of the period. The operator may suspend accounts that violate these terms after notice, except where immediate action is required to protect the platform."] },
      { title: "Governing law", paragraphs: ["The law of the operator's registered seat applies; mandatory consumer protections remain unaffected."] },
    ],
  },
};
