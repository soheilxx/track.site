import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_helpers.ts";
import { credentials } from "./config.ts";
import { orgRef, sites } from "./tenancy.ts";

export const shopPlatformEnum = pgEnum("shop_platform", ["shopify", "woocommerce", "shopware"]);
export const shopConnectionStatusEnum = pgEnum("shop_connection_status", ["pending", "connected", "paused"]);

export interface ShopConnectionSettings {
  /** currency assumed when the platform payload carries no ISO code (Shopware app webhooks) */
  default_currency?: string;
  /** webhook topics observed so far */
  topics?: string[];
}

/**
 * Verified server-side order sources: one connection per site and shop platform. The webhook URL carries
 * an unguessable path token; the signing secret lives envelope-encrypted in `credentials`, never here.
 */
export const shopConnections = pgTable(
  "shop_connections",
  {
    id: id(),
    organizationId: orgRef(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    platform: shopPlatformEnum("platform").notNull(),
    shopDomain: text("shop_domain").notNull(),
    status: shopConnectionStatusEnum("status").notNull().default("pending"),
    pathToken: text("path_token").notNull(),
    credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
    settings: jsonb("settings").$type<ShopConnectionSettings>().notNull().default({}),
    lastEventAt: tz("last_event_at"),
    lastError: text("last_error"),
    createdBy: uuid("created_by"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("shop_connections_site_platform_uq").on(t.siteId, t.platform), uniqueIndex("shop_connections_path_token_uq").on(t.pathToken), index("shop_connections_org_idx").on(t.organizationId)],
);
