import { z } from "zod";
import { CONNECTOR_TYPES } from "@track-site/policy";

/**
 * Declarative, versioned configuration bundle. This is the only thing the SDK executes:
 * no custom HTML, no custom JavaScript, transformations are JSONLogic with an allow-list.
 */
export const BUNDLE_SCHEMA_VERSION = "1";

export const jsonLogicSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonLogicSchema), z.record(z.string(), jsonLogicSchema)]),
);

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page"), path_pattern: z.string().max(256).nullable() }),
  z.object({ type: z.literal("selector"), selector: z.string().max(256), dom_event: z.enum(["click", "submit"]) }),
  z.object({ type: z.literal("data_layer"), key: z.string().max(64) }),
  z.object({ type: z.literal("api") }),
  z.object({ type: z.literal("shop_integration"), platform: z.enum(["shopify", "woocommerce", "shopware"]) }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export const eventConfigSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  enabled: z.boolean(),
  critical: z.boolean(),
  trigger: triggerSchema,
  /** JSONLogic producing the properties object from the trigger context */
  props_map: jsonLogicSchema.nullable(),
  /** authoritative server source configured (purchase/refund) */
  authoritative_source: z.enum(["none", "shop_integration", "server_api"]),
});
export type EventConfig = z.infer<typeof eventConfigSchema>;

export const connectorTypeSchema = z.enum(CONNECTOR_TYPES);

export const mappingSchema = z.object({
  event: z.string().max(64),
  vendor_event: z.string().max(64),
  enabled: z.boolean(),
  field_map: jsonLogicSchema.nullable(),
});

export const destinationSchema = z.object({
  id: z.string().uuid(),
  type: connectorTypeSchema,
  name: z.string().max(128),
  enabled: z.boolean(),
  /** stricter purpose than the connector default is allowed, weaker is not (lint) */
  purpose: z.enum(["necessary", "analytics", "marketing", "personalization"]),
  mode: z.enum(["browser", "server", "hybrid"]),
  /** public identifiers only; secrets never enter a bundle */
  browser: z.record(z.string().regex(/^[a-z_]{2,40}$/), z.string().max(128).nullable()).nullable(),
  test_mode: z.boolean(),
  mappings: z.array(mappingSchema).max(100),
});
export type DestinationConfig = z.infer<typeof destinationSchema>;

export const consentConfigSchema = z.object({
  policy_version: z.string().max(64),
  purposes: z.array(z.enum(["necessary", "analytics", "marketing", "personalization"])),
  default_region_mode: z.enum(["strict_opt_in", "opt_out", "notice_only"]),
  cmp: z.object({
    provider: z.enum(["none", "api", "usercentrics", "cookiebot", "onetrust", "tcf", "gpp"]),
    settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }),
  consent_mode: z.object({
    enabled: z.boolean(),
    mode: z.enum(["basic", "advanced"]),
  }),
  click_ids: z.object({ capture: z.boolean(), ttl_days: z.number().int().min(1).max(180) }),
  respect_gpc: z.boolean(),
});

export const settingsSchema = z.object({
  auto_page_view: z.boolean(),
  spa_tracking: z.boolean(),
  cookie_domain: z.string().max(253).nullable(),
  session_timeout_min: z.number().int().min(1).max(1440),
  kill_switch: z.boolean(),
  allowed_hosts: z.array(z.string().max(253)).max(50),
  url_allow_params: z.array(z.string().max(64)).max(50),
  url_block_params: z.array(z.string().max(64)).max(50),
  batch: z.object({ max_events: z.number().int().min(1).max(50), flush_ms: z.number().int().min(100).max(10_000) }),
  debug: z.boolean(),
});

export const configBundleSchema = z
  .object({
    schema_version: z.literal(BUNDLE_SCHEMA_VERSION),
    site: z.object({
      tracking_id: z.string().regex(/^[A-Z0-9]{6}$/),
      environment: z.enum(["production", "staging", "development"]),
    }),
    version: z.number().int().nonnegative(),
    created_at: z.string().datetime(),
    settings: settingsSchema,
    consent: consentConfigSchema,
    events: z.array(eventConfigSchema).max(200),
    destinations: z.array(destinationSchema).max(50),
  })
  .strict();
export type ConfigBundle = z.infer<typeof configBundleSchema>;

export function defaultBundle(trackingId: string, environment: ConfigBundle["site"]["environment"], primaryHost: string | null): ConfigBundle {
  return {
    schema_version: BUNDLE_SCHEMA_VERSION,
    site: { tracking_id: trackingId, environment },
    version: 0,
    created_at: new Date().toISOString(),
    settings: {
      auto_page_view: true,
      spa_tracking: true,
      cookie_domain: null,
      session_timeout_min: 30,
      kill_switch: false,
      allowed_hosts: primaryHost ? [primaryHost, `*.${primaryHost.replace(/^www\./, "")}`] : [],
      url_allow_params: [],
      url_block_params: [],
      batch: { max_events: 20, flush_ms: 1000 },
      debug: false,
    },
    consent: {
      policy_version: "default-v1",
      purposes: ["necessary", "analytics", "marketing", "personalization"],
      default_region_mode: "strict_opt_in",
      cmp: { provider: "api", settings: {} },
      consent_mode: { enabled: true, mode: "basic" },
      click_ids: { capture: true, ttl_days: 90 },
      respect_gpc: true,
    },
    events: [
      { name: "page_view", enabled: true, critical: false, trigger: { type: "page", path_pattern: null }, props_map: null, authoritative_source: "none" },
    ],
    destinations: [],
  };
}
