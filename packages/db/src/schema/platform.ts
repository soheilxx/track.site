import { index, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, tz } from "./_helpers.ts";

/** Append-only audit log (UPDATE/DELETE are blocked by a trigger in the RLS migration). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: uuid("organization_id"),
    actor: jsonb("actor").$type<Record<string, unknown>>().notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    /** redacted diff / details */
    diff: jsonb("diff").$type<Record<string, unknown> | null>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text("ip_hash"),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_org_time_idx").on(t.organizationId, t.createdAt), index("audit_log_target_idx").on(t.targetType, t.targetId)],
);

export const breakGlassAccess = pgTable(
  "break_glass_access",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    reason: text("reason").notNull(),
    ticketRef: text("ticket_ref"),
    approvedBy: uuid("approved_by"),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    revokedAt: tz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("break_glass_org_idx").on(t.organizationId, t.endsAt)],
);

export const contactKindEnum = pgEnum("contact_kind", ["contact", "demo", "support"]);
export const contactStatusEnum = pgEnum("contact_status", ["new", "handled", "spam"]);

/** Persisted inbox for public forms (contact, demo, support); email delivery is additional. */
export const contactRequests = pgTable(
  "contact_requests",
  {
    id: id(),
    kind: contactKindEnum("kind").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    message: text("message").notNull(),
    locale: text("locale").notNull().default("en"),
    status: contactStatusEnum("status").notNull().default("new"),
    organizationId: uuid("organization_id"),
    userId: uuid("user_id"),
    ipHash: text("ip_hash"),
    uaFamily: text("ua_family"),
    deliveredAt: tz("delivered_at"),
    deliveryError: text("delivery_error"),
    handledAt: tz("handled_at"),
    createdAt: createdAt(),
  },
  (t) => [index("contact_requests_status_idx").on(t.status, t.createdAt)],
);
