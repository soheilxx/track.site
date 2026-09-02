import type { AppLogger } from "@track-site/core";
import type { CanonicalEvent } from "@track-site/events";
import type { ConnectorType } from "@track-site/policy";

/**
 * Versioned connector interface. Every vendor adapter implements it; the worker, the AI tools
 * and the dashboard only talk to this contract. API versions are pinned in `versions.ts`.
 */
export type CredentialKind = "access_token" | "api_secret" | "oauth_refresh_token" | "oauth_access_token" | "webhook_secret" | "signing_secret";

export interface CredentialRequirement {
  kind: CredentialKind;
  label: string;
  help: string;
  /** captured only through the secure credential card or OAuth, never through chat */
  secret: true;
  oauth?: { provider: string; scopes: string[] } | null;
}

export interface PublicIdRequirement {
  key: string;
  label: string;
  /** may be entered in chat; validated with this pattern */
  pattern: string;
  example: string;
  help: string;
}

export interface ConnectorMeta {
  type: ConnectorType;
  displayName: string;
  apiVersion: string;
  /** date the endpoint/version was verified against official documentation */
  verifiedAt: string;
  sunsetWatch: string | null;
  docsUrl: string;
  requiredPublicIds: PublicIdRequirement[];
  requiredCredentials: CredentialRequirement[];
  supportsBrowser: boolean;
  supportsServer: boolean;
  /** vendor event names the browser + server paths share for deduplication */
  dedupField: string | null;
  transfer: { recipient: string; region: string; basis: string };
}

export interface ConnectorContext {
  organizationId: string;
  siteId: string;
  integrationId: string;
  publicConfig: Record<string, unknown>;
  settings: Record<string, unknown>;
  testMode: boolean;
  /** decrypts lazily; the value never leaves the worker process */
  getCredential(kind: CredentialKind): Promise<string | null>;
  fetch: typeof fetch;
  /** tests / local mocks only */
  baseUrlOverride?: string | null;
  allowPrivateNetwork?: boolean;
  logger: AppLogger;
  now: () => Date;
  /** short-lived OAuth access tokens minted by the platform from stored refresh tokens (never exposed to tenants) */
  oauth?: { accessToken(provider: string): Promise<string | null> } | null;
  /** platform-level (not tenant) secrets such as partner developer tokens */
  platform?: Record<string, string | null | undefined>;
}

export interface DispatchEvent {
  event: CanonicalEvent;
  /** click ids already filtered by the policy engine for this destination */
  clickIds: Record<string, string>;
  /** identifier shared with the browser path for vendor-side deduplication */
  dedupId: string;
}

export interface EventMapping {
  event: string;
  vendorEvent: string;
  enabled: boolean;
  fieldMap: Record<string, unknown> | null;
}

export interface VendorPayload {
  vendorEventName: string;
  dedupKey: string | null;
  endpoint: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  body: unknown;
  /** redacted copy for the debugger (no tokens, hashed identifiers shortened) */
  preview: Record<string, unknown>;
  eventId: string;
}

export type ErrorClass = "none" | "temporary" | "permanent" | "rate_limited" | "auth" | "credential_expired" | "invalid_payload" | "timeout" | "policy_blocked";

export interface DispatchResult {
  ok: boolean;
  httpStatus: number | null;
  errorClass: ErrorClass;
  errorCode: string | null;
  message: string | null;
  retryAfterMs: number | null;
  vendorEventId: string | null;
  responseExcerpt: string | null;
  durationMs: number;
  eventId: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface CredentialValidation {
  ok: boolean;
  status: "valid" | "invalid" | "expired" | "not_connected" | "unknown";
  detail: string;
  apiVersion: string;
  checkedAt: string;
}

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy" | "not_connected";
  detail: string;
  checkedAt: string;
  apiVersion: string;
  sunsetWatch: string | null;
}

export type BrowserTemplate =
  | "meta_pixel" | "tiktok_pixel" | "reddit_pixel" | "linkedin_insight" | "gtag" | "google_ads_tag" | "microsoft_uet" | "pinterest_tag" | "snap_pixel"
  | "x_pixel" | "taboola_pixel" | "outbrain_pixel" | "amazon_tag" | "spotify_pixel" | "quora_pixel" | "yahoo_dot" | "ttd_pixel" | "gmp_floodlight" | "adroll_pixel" | "criteo_onetag";

export interface BrowserTagConfig {
  /** built-in SDK loader template id (no custom JS) */
  template: BrowserTemplate;
  ids: Record<string, string>;
  consentPurpose: "analytics" | "marketing";
}

export interface DeleteSubjectResult {
  supported: boolean;
  submitted: boolean;
  reference: string | null;
  detail: string;
}

export interface Connector {
  readonly meta: ConnectorMeta;
  validateCredentials(ctx: ConnectorContext): Promise<CredentialValidation>;
  getBrowserConfig(publicConfig: Record<string, unknown>): BrowserTagConfig | null;
  mapEvent(input: DispatchEvent, mapping: EventMapping, ctx: ConnectorContext): VendorPayload | null;
  validatePayload(payload: VendorPayload): ValidationResult;
  sendTest(ctx: ConnectorContext, payload: VendorPayload): Promise<DispatchResult>;
  dispatchBatch(ctx: ConnectorContext, payloads: VendorPayload[]): Promise<DispatchResult[]>;
  classifyError(httpStatus: number | null, body: unknown, error?: unknown): ErrorClass;
  getHealth(ctx: ConnectorContext): Promise<HealthResult>;
  rotateOrRevokeSecret?(ctx: ConnectorContext, action: "rotate" | "revoke"): Promise<{ ok: boolean; detail: string }>;
  deleteSubjectData?(ctx: ConnectorContext, subject: { emailHash?: string; externalId?: string }): Promise<DeleteSubjectResult>;
}

export function isRetryable(errorClass: ErrorClass): boolean {
  return errorClass === "temporary" || errorClass === "rate_limited" || errorClass === "timeout";
}
