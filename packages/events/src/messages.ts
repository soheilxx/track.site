import { z } from "zod";
import { incomingBrowserEventSchema, incomingServerEventSchema } from "./schema.ts";

/** Queue message written by the collector and consumed by the worker ingest stage. */
export const siteContextSchema = z.object({
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  tracking_id: z.string().regex(/^[A-Z0-9]{6}$/),
  environment_id: z.string().uuid(),
  partition_key: z.string(),
});
export type SiteContext = z.infer<typeof siteContextSchema>;

export const ingestMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("browser_batch"),
    message_id: z.string(),
    received_at: z.string().datetime(),
    site: siteContextSchema,
    ip_truncated: z.string().nullable(),
    ua_family: z.string().nullable(),
    is_bot_hint: z.boolean(),
    origin_host: z.string().nullable(),
    events: z.array(incomingBrowserEventSchema).min(1).max(50),
  }),
  z.object({
    kind: z.literal("server_batch"),
    message_id: z.string(),
    received_at: z.string().datetime(),
    site: siteContextSchema,
    source_key_id: z.string().uuid().nullable(),
    ip_truncated: z.string().nullable(),
    ua_family: z.string().nullable(),
    events: z.array(incomingServerEventSchema).min(1).max(100),
  }),
]);
export type IngestMessage = z.infer<typeof ingestMessageSchema>;

/** Queue message for a destination worker: one canonical event to deliver to one integration. */
export const deliveryMessageSchema = z.object({
  kind: z.literal("deliver"),
  message_id: z.string(),
  organization_id: z.string().uuid(),
  site_id: z.string().uuid(),
  event_id: z.string(),
  integration_id: z.string().uuid(),
  connector_type: z.string(),
  config_version: z.number().int().nonnegative(),
  attempt: z.number().int().nonnegative(),
  enqueued_at: z.string().datetime(),
});
export type DeliveryMessage = z.infer<typeof deliveryMessageSchema>;
