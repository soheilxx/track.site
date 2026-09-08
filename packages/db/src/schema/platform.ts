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

export const BREAK_GLASS_MODES = ["read_only"] as const;
export type BreakGlassMode = (typeof BREAK_GLASS_MODES)[number];

/**
 * Time-boxed, justified, approved access of one platform operator to one organization's data (docs/03
 * §B8, docs/17). A grant is active only when `approved_at` is set, `revoked_at` is null and now lies in
 * [`starts_at`, `ends_at`); `mode` is `read_only` — the only mode there is. Four-eyes: `approved_by` is a
 * second platform admin when one exists, otherwise the requester (self-approved, ticket + reason mandatory).
 * Revoked from `tracksite_app` (migration 0001): tenants never read this table directly.
 */
export const breakGlassAccess = pgTable(
  "break_glass_access",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    reason: text("reason").notNull(),
    ticketRef: text("ticket_ref"),
    approvedBy: uuid("approved_by"),
    approvedAt: tz("approved_at"),
    mode: text("mode").$type<BreakGlassMode>().notNull().default("read_only"),
    startsAt: tz("starts_at").notNull(),
    endsAt: tz("ends_at").notNull(),
    revokedAt: tz("revoked_at"),
    customerNotifiedAt: tz("customer_notified_at"),
    createdAt: createdAt(),
  },
  (t) => [index("break_glass_org_idx").on(t.organizationId, t.endsAt), index("break_glass_user_org_idx").on(t.platformUserId, t.organizationId, t.endsAt)],
);

export const contactKindEnum = pgEnum("contact_kind", ["contact", "demo", "support"]);

/** Inbox workflow of a contact request (migration 0014 turned the former enum into text; `handled` became `done`). */
export const CONTACT_REQUEST_STATUSES = ["new", "in_progress", "done", "spam"] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

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
    status: text("status").$type<ContactRequestStatus>().notNull().default("new"),
    organizationId: uuid("organization_id"),
    userId: uuid("user_id"),
    /** platform user working on the request (Track Operations → Inbox) */
    assigneeUserId: uuid("assignee_user_id"),
    /** support ticket the request was converted into (migration 0015; FK `support_tickets.id`, set null on delete) */
    ticketId: uuid("ticket_id"),
    ipHash: text("ip_hash"),
    uaFamily: text("ua_family"),
    deliveredAt: tz("delivered_at"),
    deliveryError: text("delivery_error"),
    handledAt: tz("handled_at"),
    createdAt: createdAt(),
  },
  (t) => [index("contact_requests_status_idx").on(t.status, t.createdAt), index("contact_requests_assignee_idx").on(t.assigneeUserId)],
);
