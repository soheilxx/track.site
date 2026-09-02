import { z } from "zod";

/**
 * Canonical event model. Three layers:
 *  - IncomingBrowserEvent: what tracker.js sends (already scrubbed client-side)
 *  - IncomingServerEvent: what the server API / shop integrations send (may contain raw user data that is hashed on ingest)
 *  - CanonicalEvent: the normalized, stored representation with lineage and data classes
 */

export const SCHEMA_VERSION = "1.0.0";

export const EVENT_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{1,63}$/;
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const CURRENCY_REGEX = /^[A-Z]{3}$/;

export const consentPurposeSchema = z.enum(["necessary", "analytics", "marketing", "personalization"]);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

export const consentSourceSchema = z.enum([
  "default",
  "api",
  "tcf",
  "gpp",
  "gpc",
  "cmp:usercentrics",
  "cmp:cookiebot",
  "cmp:onetrust",
  "server",
]);
export type ConsentSource = z.infer<typeof consentSourceSchema>;

/** Consent snapshot carried by every event (what was granted at capture time). */
export const consentStateSchema = z.object({
  granted: z.array(consentPurposeSchema).max(4),
  source: consentSourceSchema,
  policy_version: z.string().max(64).nullable(),
  ts: z.number().int().nonnegative().nullable(),
  region: z.string().max(8).nullable(),
  gpc: z.boolean().nullable(),
});
export type ConsentState = z.infer<typeof consentStateSchema>;

const safeString = (max: number) => z.string().max(max);
const propValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null(), z.array(propValue).max(100), z.record(z.string().max(64), propValue)]),
);
export const propertiesSchema = z.record(z.string().max(64), propValue).superRefine((v, ctx) => {
  if (JSON.stringify(v).length > 16_384) ctx.addIssue({ code: "custom", message: "properties exceed 16 KB" });
});

export const commerceItemSchema = z.object({
  item_id: safeString(128),
  item_name: safeString(256).nullable().optional(),
  price: z.number().finite().nonnegative().nullable().optional(),
  quantity: z.number().int().positive().nullable().optional(),
  currency: z.string().regex(CURRENCY_REGEX).nullable().optional(),
  brand: safeString(128).nullable().optional(),
  category: safeString(256).nullable().optional(),
  variant: safeString(128).nullable().optional(),
  sku: safeString(128).nullable().optional(),
});
export type CommerceItem = z.infer<typeof commerceItemSchema>;

export const commerceSchema = z.object({
  currency: z.string().regex(CURRENCY_REGEX).nullable().optional(),
  value: z.number().finite().nonnegative().nullable().optional(),
  order_id: safeString(128).nullable().optional(),
  transaction_id: safeString(128).nullable().optional(),
  items: z.array(commerceItemSchema).max(200).nullable().optional(),
  quantity: z.number().int().nonnegative().nullable().optional(),
  tax: z.number().finite().nullable().optional(),
  shipping: z.number().finite().nullable().optional(),
  coupon: safeString(64).nullable().optional(),
  discount: z.number().finite().nullable().optional(),
});
export type Commerce = z.infer<typeof commerceSchema>;

/** Click ids keyed by their query parameter name (allow-listed in @track-site/core CLICK_ID_PARAMS). */
export const clickIdsSchema = z.record(z.string().regex(/^[a-z_]{2,32}$/), safeString(256)).refine((v) => Object.keys(v).length <= 12, "too many click ids");
export type ClickIds = z.infer<typeof clickIdsSchema>;

/** Vendor first-party cookies the SDK may read only after marketing consent (fbp, fbc, ttp, _uetsid, _scid, ...). */
export const vendorClientIdsSchema = z.record(z.string().regex(/^[a-z_]{2,32}$/), safeString(256)).refine((v) => Object.keys(v).length <= 12, "too many vendor ids");

export const pageContextSchema = z.object({
  url: z.string().url().max(2048),
  referrer: z.string().max(2048).nullable().optional(),
  title: safeString(512).nullable().optional(),
});

export const sdkContextSchema = z.object({
  name: z.enum(["browser", "server", "shopify", "woocommerce", "shopware", "webhook"]),
  version: safeString(32),
  config_version: z.number().int().nonnegative().nullable(),
  schema_version: safeString(16),
});

export const identitySchema = z.object({
  anonymous_id: safeString(64).nullable().optional(),
  session_id: safeString(64).nullable().optional(),
  user_id: safeString(128).nullable().optional(),
});

/** Raw user data accepted only on the server path; hashed before persistence. */
export const rawUserDataSchema = z.object({
  email: safeString(320).nullable().optional(),
  phone: safeString(32).nullable().optional(),
  first_name: safeString(128).nullable().optional(),
  last_name: safeString(128).nullable().optional(),
  city: safeString(128).nullable().optional(),
  zip: safeString(16).nullable().optional(),
  country: safeString(2).nullable().optional(),
  external_id: safeString(128).nullable().optional(),
});

export const incomingBrowserEventSchema = z.object({
  id: z.string().regex(ULID_REGEX),
  name: z.string().regex(EVENT_NAME_REGEX),
  ts: z.number().int().positive(),
  seq: z.number().int().nonnegative().optional(),
  props: propertiesSchema.optional(),
  commerce: commerceSchema.optional(),
  page: pageContextSchema,
  ids: identitySchema,
  consent: consentStateSchema,
  sdk: sdkContextSchema,
  click_ids: clickIdsSchema.optional(),
  vendor_ids: vendorClientIdsSchema.optional(),
  locale: safeString(16).optional(),
  tz: safeString(64).optional(),
  screen: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }).optional(),
});
export type IncomingBrowserEvent = z.infer<typeof incomingBrowserEventSchema>;

export const incomingBrowserBatchSchema = z.object({
  site_id: z.string().regex(/^[A-Za-z0-9]{6}$/),
  sent_at: z.number().int().positive(),
  events: z.array(incomingBrowserEventSchema).min(1).max(50),
});
export type IncomingBrowserBatch = z.infer<typeof incomingBrowserBatchSchema>;

export const incomingServerEventSchema = z.object({
  id: z.string().regex(ULID_REGEX).optional(),
  name: z.string().regex(EVENT_NAME_REGEX),
  ts: z.number().int().positive().optional(),
  props: propertiesSchema.optional(),
  commerce: commerceSchema.optional(),
  page: pageContextSchema.partial({ url: true }).optional(),
  ids: identitySchema.optional(),
  consent: consentStateSchema.partial().optional(),
  user_data: rawUserDataSchema.optional(),
  click_ids: clickIdsSchema.optional(),
  vendor_ids: vendorClientIdsSchema.optional(),
  client_ip: z.string().max(45).nullable().optional(),
  client_user_agent: safeString(512).nullable().optional(),
  source: z.enum(["server", "shopify", "woocommerce", "shopware", "webhook"]).default("server"),
  source_verified: z.boolean().default(false),
});
export type IncomingServerEvent = z.infer<typeof incomingServerEventSchema>;

export const incomingServerBatchSchema = z.object({
  events: z.array(incomingServerEventSchema).min(1).max(100),
});

export const dataClassSchema = z.enum(["OBSERVED", "DERIVED", "INFERRED"]);
export type DataClass = z.infer<typeof dataClassSchema>;

export const provenanceEntrySchema = z.object({
  data_class: dataClassSchema,
  source: safeString(64),
  at: z.string().datetime(),
  algorithm: safeString(64).nullable(),
  algorithm_version: safeString(32).nullable(),
  inputs: z.array(safeString(64)).nullable(),
  model: safeString(64).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  expires_at: z.string().datetime().nullable(),
  human_confirmed_at: z.string().datetime().nullable(),
});
export type ProvenanceEntry = z.infer<typeof provenanceEntrySchema>;

export const processingStateSchema = z.enum([
  "captured",
  "accepted",
  "normalized",
  "policy_passed",
  "policy_blocked",
  "deduplicated",
  "routed",
  "delivered",
  "rejected",
  "imported",
]);
export type ProcessingState = z.infer<typeof processingStateSchema>;

export const hashedUserDataSchema = z.object({
  em: z.string().length(64).nullable(),
  ph: z.string().length(64).nullable(),
  fn: z.string().length(64).nullable(),
  ln: z.string().length(64).nullable(),
  ct: z.string().length(64).nullable(),
  zp: z.string().length(64).nullable(),
  country: z.string().length(2).nullable(),
  external_id: z.string().length(64).nullable(),
});
export type HashedUserData = z.infer<typeof hashedUserDataSchema>;

export const canonicalEventSchema = z.object({
  event_id: z.string().regex(ULID_REGEX),
  source_event_id: z.string().max(64),
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  site_tracking_id: z.string().regex(/^[A-Z0-9]{6}$/),
  environment_id: z.string().uuid(),
  name: z.string().regex(EVENT_NAME_REGEX),
  is_standard: z.boolean(),
  category: z.string().max(32),
  client_ts: z.string().datetime().nullable(),
  server_ts: z.string().datetime(),
  anonymous_id: z.string().max(64).nullable(),
  session_id: z.string().max(64).nullable(),
  user_id: z.string().max(128).nullable(),
  url: z.string().max(2048).nullable(),
  host: z.string().max(253).nullable(),
  path: z.string().max(2048).nullable(),
  referrer: z.string().max(2048).nullable(),
  title: z.string().max(512).nullable(),
  utm: z.record(z.string(), z.string()).nullable(),
  click_ids: z.record(z.string(), z.object({ value: z.string(), source: z.string(), captured_at: z.string().datetime(), expires_at: z.string().datetime() })).nullable(),
  vendor_ids: vendorClientIdsSchema.nullable(),
  consent: consentStateSchema,
  consent_snapshot_id: z.string().uuid().nullable(),
  props: propertiesSchema.nullable(),
  commerce: commerceSchema.nullable(),
  user_data: hashedUserDataSchema.nullable(),
  ip_truncated: z.string().max(45).nullable(),
  ua_family: z.string().max(64).nullable(),
  locale: z.string().max(16).nullable(),
  source: z.enum(["browser", "server", "shopify", "woocommerce", "shopware", "webhook", "legacy-import"]),
  source_verified: z.boolean(),
  sdk_version: z.string().max(32),
  config_version: z.number().int().nonnegative().nullable(),
  schema_version: z.string().max(16),
  provenance: z.record(z.string(), provenanceEntrySchema),
  processing_state: processingStateSchema,
  drop_reason: z.string().max(128).nullable(),
  is_billable: z.boolean(),
  is_bot: z.boolean(),
});
export type CanonicalEvent = z.infer<typeof canonicalEventSchema>;
