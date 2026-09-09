import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { createdAt, id, timestamps, tz } from "./_helpers.ts";

/**
 * Support desk (migration 0015, docs/18-support-desk.md). Tickets, their messages, attachments, macros, saved
 * views, presence, the event timeline, the inbound-webhook ledger, SLA policies and the singleton settings.
 *
 * Tenant visibility (RLS for `tracksite_app`, enforced by the migration):
 * - `support_tickets`: SELECT / INSERT / UPDATE limited to `organization_id = app_organization_id()`; tickets
 *   without an organisation (unknown senders) are invisible to every tenant. Agent-only columns (assignee,
 *   SLA internals, breach flags) are filtered by the customer loaders (`SUPPORT_TICKET_CUSTOMER_COLUMNS`).
 * - `support_messages`: tenants SELECT only rows with `direction <> 'note'` of their own tickets and INSERT
 *   only customer `inbound` messages; internal notes never leave the console.
 * - `support_attachments`: like messages (note attachments excluded).
 * - `support_events`: tenants read only the customer-relevant kinds (`SUPPORT_EVENT_CUSTOMER_KINDS`).
 * - macros, views, presence, inbound events, settings: operators only (`tracksite_ops`); every privilege is
 *   revoked from `tracksite_app`. SLA policies are readable (targets are not secret) but never writable.
 */

export const SUPPORT_TICKET_STATUSES = ["new", "open", "pending", "on_hold", "solved", "closed", "spam"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

/**
 * Channels a ticket can arrive on: the customer channels (`email`, `form`, `dashboard`, `api`) and `agent` — a
 * ticket an operator opened on the customer's behalf from the console (migration 0017, docs/18 §"Agent-created
 * tickets and teams"). The list is the CHECK of `support_tickets.channel`; the reports (`REPORT_CHANNELS`) and
 * the queue constants (`TICKET_CHANNELS`) mirror it under drift-guarding tests.
 */
export const SUPPORT_TICKET_CHANNELS = ["email", "form", "dashboard", "api", "agent"] as const;
export type SupportTicketChannel = (typeof SUPPORT_TICKET_CHANNELS)[number];

/** The channel of an agent-created ticket; `SUPPORT_TICKET_ALL_CHANNELS` stays as an alias of the full list. */
export const SUPPORT_TICKET_AGENT_CHANNEL = "agent" as const satisfies SupportTicketChannel;
export const SUPPORT_TICKET_ALL_CHANNELS = SUPPORT_TICKET_CHANNELS;
export type SupportTicketAnyChannel = SupportTicketChannel;

/** Who opened the ticket (`support_tickets.opened_by`, 0017): the requester, an operator, or the desk itself. */
export const SUPPORT_TICKET_OPENED_BY = ["customer", "agent", "system"] as const;
export type SupportTicketOpenedBy = (typeof SUPPORT_TICKET_OPENED_BY)[number];

/** Membership roles inside a support team (`support_team_members.role`, 0017). */
export const SUPPORT_TEAM_ROLES = ["member", "lead"] as const;
export type SupportTeamRole = (typeof SUPPORT_TEAM_ROLES)[number];

/** Fixed ids of the teams migration 0017 seeds (`ON CONFLICT DO NOTHING`; renames survive re-runs). */
export const SUPPORT_SEEDED_TEAM_IDS = {
  support: "00000000-0000-4000-8000-000000000171",
  sales: "00000000-0000-4000-8000-000000000172",
} as const;

export const SUPPORT_MESSAGE_DIRECTIONS = ["inbound", "outbound", "note"] as const;
export type SupportMessageDirection = (typeof SUPPORT_MESSAGE_DIRECTIONS)[number];

export const SUPPORT_AUTHOR_KINDS = ["customer", "agent", "system"] as const;
export type SupportAuthorKind = (typeof SUPPORT_AUTHOR_KINDS)[number];

/** `sending` is the transient claim of the console's send path (migration 0018): a row is mailed at most once. */
export const SUPPORT_DELIVERY_STATUSES = ["queued", "sending", "sent", "delivered", "bounced", "complained", "failed", "na"] as const;
export type SupportDeliveryStatus = (typeof SUPPORT_DELIVERY_STATUSES)[number];

export const SUPPORT_MACRO_SCOPES = ["global", "personal"] as const;
export type SupportMacroScope = (typeof SUPPORT_MACRO_SCOPES)[number];

export const SUPPORT_PRESENCE_MODES = ["viewing", "typing"] as const;
export type SupportPresenceMode = (typeof SUPPORT_PRESENCE_MODES)[number];

export const SUPPORT_EVENT_KINDS = [
  "created",
  "status",
  "priority",
  "assignee",
  "tags",
  "merged",
  "sla_breach",
  "sla_warning",
  "reply",
  "note",
  "csat",
  "reopened",
] as const;
export type SupportEventKind = (typeof SUPPORT_EVENT_KINDS)[number];

/** Event kinds a customer may see on their own ticket (the tenant SELECT policy mirrors this list). */
export const SUPPORT_EVENT_CUSTOMER_KINDS: readonly SupportEventKind[] = ["created", "status", "priority", "merged", "reply", "csat", "reopened"];

export const SUPPORT_INBOUND_EVENT_STATUSES = ["received", "processed", "ignored", "failed"] as const;
export type SupportInboundEventStatus = (typeof SUPPORT_INBOUND_EVENT_STATUSES)[number];

export const SUPPORT_AUTO_ASSIGN_STRATEGIES = ["none", "round_robin"] as const;
export type SupportAutoAssignStrategy = (typeof SUPPORT_AUTO_ASSIGN_STRATEGIES)[number];

/** Attachment limits (docs/18 §"Attachments"): enforced in the application and by a CHECK on `size_bytes`. */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_PER_MESSAGE = 5;

/** `{ priority: { first_response_minutes, resolution_minutes } }` — minutes of business time per priority. */
export type SlaPriorityTargets = Partial<Record<SupportTicketPriority, { first_response_minutes: number; resolution_minutes: number }>>;

/** `{ timezone, days: { mon: [[540, 1080]], … } }` — minutes since midnight, several windows per day allowed. */
export interface SupportBusinessHours {
  timezone: string;
  days: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", Array<[number, number]>>>;
}

/** Escalation rule of an SLA policy; `warning_percent` = share of the target after which an `sla_warning` event fires. */
export interface SlaEscalation {
  warning_percent?: number;
  notify_user_ids?: string[];
}

/** Optional actions a macro applies next to its text. */
export interface SupportMacroActions {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  tags_add?: string[];
  tags_remove?: string[];
  assign_to_self?: boolean;
}

/** Customer satisfaction answer stored on the ticket (`csat` event carries the same without the comment). */
export interface SupportSatisfaction {
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string | null;
  answered_at: string;
}

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * SLA policy: targets per priority in business minutes, business hours and escalation. `plan_ids` null marks
 * the default policy for every plan; exactly one row may carry `is_default` (partial unique index).
 */
export const supportSlaPolicies = pgTable(
  "support_sla_policies",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** catalogue plan ids the policy applies to; null = default for every plan */
    planIds: text("plan_ids").array(),
    priorities: jsonb("priorities").$type<SlaPriorityTargets>().notNull().default({}),
    businessHours: jsonb("business_hours").$type<SupportBusinessHours>().notNull().default({ timezone: "Europe/Berlin", days: {} }),
    escalation: jsonb("escalation").$type<SlaEscalation>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("support_sla_policies_default_uq").on(t.isDefault).where(sql`${t.isDefault}`)],
);

/**
 * Support team (migration 0017, docs/18 §"Agent-created tickets and teams"): a named queue operators belong
 * to. Exactly one team carries `is_default` (partial unique index); an archived team (`archived_at`) keeps
 * its tickets and members but is offered nowhere. Operator-only table (every privilege revoked from
 * `tracksite_app`); `tracksite_worker` reads it for the team-aware round robin of the inbound store.
 */
export const supportTeams = pgTable(
  "support_teams",
  {
    id: id(),
    /** lower-case, `[a-z0-9-]`, unique — the URL and filter key of the team */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: tz("archived_at"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("support_teams_slug_uq").on(t.slug), uniqueIndex("support_teams_default_uq").on(t.isDefault).where(sql`${t.isDefault}`), index("support_teams_archived_idx").on(t.archivedAt)],
);

/** Membership of a platform operator in a team (`member` or `lead`); an operator may belong to several teams. */
export const supportTeamMembers = pgTable(
  "support_team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => supportTeams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<SupportTeamRole>().notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("support_team_members_user_idx").on(t.userId)],
);

/**
 * One support ticket. `number` is the human-facing id (`support_ticket_number_seq`, used in subjects and
 * reply-to addresses); `organization_id` is null for senders that are no customer (or not yet matched).
 * SLA timestamps are computed from real message times only — never invented; `paused_at` / `pause_total_ms`
 * stop the clock while the ticket waits for the customer (`pending`).
 *
 * Migration 0017 adds `team_id` (the queue the ticket sits in, null = no team), `opened_by` (`customer` for
 * every inbound path, `agent` for a ticket an operator opened on the customer's behalf, `system`) and
 * `sla_pending_first_customer_reply`: an agent-created ticket has no first-response target and a paused
 * resolution clock — both due times stay null — until the first customer reply starts the clocks through
 * the engine (`applyFirstCustomerReply`, apps/web/src/server/support/agent-tickets.ts).
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    number: bigint("number", { mode: "number" })
      .notNull()
      .default(sql`nextval('support_ticket_number_seq')`),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    requesterUserId: uuid("requester_user_id"),
    requesterEmail: text("requester_email").notNull(),
    requesterName: text("requester_name"),
    subject: text("subject").notNull(),
    status: text("status").$type<SupportTicketStatus>().notNull().default("new"),
    priority: text("priority").$type<SupportTicketPriority>().notNull().default("normal"),
    channel: text("channel").$type<SupportTicketChannel>().notNull(),
    category: text("category"),
    tags: text("tags").array().notNull().default([]),
    /** platform user working on the ticket (agent-only field) */
    assigneeUserId: uuid("assignee_user_id"),
    slaPolicyId: uuid("sla_policy_id").references(() => supportSlaPolicies.id, { onDelete: "set null" }),
    firstResponseDueAt: tz("first_response_due_at"),
    resolutionDueAt: tz("resolution_due_at"),
    firstRespondedAt: tz("first_responded_at"),
    resolvedAt: tz("resolved_at"),
    closedAt: tz("closed_at"),
    lastCustomerMessageAt: tz("last_customer_message_at"),
    lastAgentMessageAt: tz("last_agent_message_at"),
    breachedFirstResponse: boolean("breached_first_response").notNull().default(false),
    breachedResolution: boolean("breached_resolution").notNull().default(false),
    /** set while the SLA clock is paused (status `pending`) */
    pausedAt: tz("paused_at"),
    pauseTotalMs: bigint("pause_total_ms", { mode: "number" }).notNull().default(0),
    /**
     * When the current SLA clock run started (migration 0018): the creation, or the last reopening. Priority
     * changes measure a clock without a due date from here, and the worker scopes its warnings to this run.
     */
    slaClockStartedAt: tz("sla_clock_started_at"),
    /** the targets the running clocks were booked against, in milliseconds of business time (null = no target) */
    firstResponseTargetMs: bigint("first_response_target_ms", { mode: "number" }),
    resolutionTargetMs: bigint("resolution_target_ms", { mode: "number" }),
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => supportTickets.id, { onDelete: "set null" }),
    locale: text("locale").notNull().default("en"),
    satisfaction: jsonb("satisfaction").$type<SupportSatisfaction | null>(),
    reopenCount: integer("reopen_count").notNull().default(0),
    /** the team (queue) the ticket sits in; null = no team (migration 0017) */
    teamId: uuid("team_id").references(() => supportTeams.id, { onDelete: "set null" }),
    /** who opened the ticket: `customer` (every inbound path), `agent` (console "New ticket"), `system` (0017) */
    openedBy: text("opened_by").$type<SupportTicketOpenedBy>().notNull().default("customer"),
    /** agent-created ticket whose SLA clocks wait for the first customer reply (both due times null until then, 0017) */
    slaPendingFirstCustomerReply: boolean("sla_pending_first_customer_reply").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("support_tickets_number_uq").on(t.number),
    index("support_tickets_team_idx").on(t.teamId, t.status),
    index("support_tickets_status_updated_idx").on(t.status, t.updatedAt),
    index("support_tickets_assignee_idx").on(t.assigneeUserId, t.status),
    index("support_tickets_org_idx").on(t.organizationId, t.updatedAt),
    index("support_tickets_updated_idx").on(t.updatedAt),
    index("support_tickets_requester_idx").on(t.requesterEmail),
  ],
);

/**
 * Columns of `support_tickets` a customer may see on their own ticket. Loaders of `/app/support` select
 * exactly these; assignee, SLA policy, breach flags, pause state and tags stay in the console.
 */
export const SUPPORT_TICKET_CUSTOMER_COLUMNS = [
  "id",
  "number",
  "organizationId",
  "requesterUserId",
  "requesterEmail",
  "requesterName",
  "subject",
  "status",
  "priority",
  "channel",
  "category",
  "firstRespondedAt",
  "resolvedAt",
  "closedAt",
  "lastCustomerMessageAt",
  "lastAgentMessageAt",
  "mergedIntoId",
  "locale",
  "satisfaction",
  "reopenCount",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof typeof supportTickets.$inferSelect)[];

/**
 * Reusable canned answer. `global` macros (owner null) are managed by admins and usable by every operator;
 * `personal` macros belong to one operator (`owner_user_id`). `actions` are applied next to the text.
 */
export const supportMacros = pgTable(
  "support_macros",
  {
    id: id(),
    name: text("name").notNull(),
    category: text("category"),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    actions: jsonb("actions").$type<SupportMacroActions>().notNull().default({}),
    scope: text("scope").$type<SupportMacroScope>().notNull().default("personal"),
    ownerUserId: uuid("owner_user_id"),
    usageCount: integer("usage_count").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("support_macros_scope_owner_idx").on(t.scope, t.ownerUserId)],
);

/**
 * One message of a ticket: an inbound customer mail / dashboard reply, an outbound agent reply or an internal
 * `note`. `organization_id` is denormalised from the ticket for RLS. `html_body` is stored **sanitised**
 * (apps/web/src/server/support/inbound.ts `sanitizeHtml`) — raw provider HTML is never persisted.
 * `message_id` / `in_reply_to` / `references` are RFC 5322 ids without angle brackets; `provider_message_id`
 * is the transport's own id (Resend email id, SMTP message id) for delivery events and thread matching.
 */
export const supportMessages = pgTable(
  "support_messages",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id"),
    direction: text("direction").$type<SupportMessageDirection>().notNull(),
    authorKind: text("author_kind").$type<SupportAuthorKind>().notNull(),
    authorUserId: uuid("author_user_id"),
    fromEmail: text("from_email"),
    toEmails: text("to_emails").array().notNull().default([]),
    ccEmails: text("cc_emails").array().notNull().default([]),
    subject: text("subject"),
    textBody: text("text_body").notNull().default(""),
    htmlBody: text("html_body"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references").array().notNull().default([]),
    providerMessageId: text("provider_message_id"),
    deliveryStatus: text("delivery_status").$type<SupportDeliveryStatus>().notNull().default("na"),
    deliveryError: text("delivery_error"),
    /** when the console's send path claimed the row (`delivery_status = 'sending'`, migration 0018); a stale claim is re-claimable */
    deliveryClaimedAt: tz("delivery_claimed_at"),
    macroId: uuid("macro_id").references(() => supportMacros.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_messages_ticket_idx").on(t.ticketId, t.createdAt),
    index("support_messages_org_idx").on(t.organizationId),
    index("support_messages_message_id_idx").on(t.messageId),
    index("support_messages_provider_id_idx").on(t.providerMessageId),
    // one stored inbound row per received mail (migration 0018): the structural replay guard of docs/18 §4 step 2
    uniqueIndex("support_messages_inbound_provider_uq")
      .on(t.providerMessageId)
      .where(sql`${t.direction} = 'inbound' AND ${t.providerMessageId} IS NOT NULL`),
  ],
);

/**
 * Attachment stored in the database (bytea; ≤ 5 MB each, ≤ 5 per message, allow-listed content types).
 * `sha256` is the hex digest of `content` — deduplication, integrity and the hook for a virus scanner
 * (docs/18 §"Attachments": the scanner interface in `support/inbound.ts` is a placeholder until a scanner exists).
 */
export const supportAttachments = pgTable(
  "support_attachments",
  {
    id: id(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => supportMessages.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    content: bytea("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("support_attachments_message_idx").on(t.messageId), index("support_attachments_ticket_idx").on(t.ticketId)],
);

/** Saved ticket list of an operator (`owner_user_id`) or shared with everyone (null). */
export const supportViews = pgTable(
  "support_views",
  {
    id: id(),
    ownerUserId: uuid("owner_user_id"),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    sort: text("sort").notNull().default("updated_desc"),
    position: integer("position").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("support_views_owner_idx").on(t.ownerUserId, t.position)],
);

/** Who is looking at / typing in a ticket right now (collision avoidance between agents). */
export const supportPresence = pgTable(
  "support_presence",
  {
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    mode: text("mode").$type<SupportPresenceMode>().notNull().default("viewing"),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.userId] }), index("support_presence_seen_idx").on(t.lastSeenAt)],
);

/** Ticket timeline. `payload` carries ids and field changes only — never message bodies or e-mail contents. */
export const supportEvents = pgTable(
  "support_events",
  {
    id: id(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id"),
    actorKind: text("actor_kind").$type<SupportAuthorKind>().notNull(),
    actorUserId: uuid("actor_user_id"),
    kind: text("kind").$type<SupportEventKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("support_events_ticket_idx").on(t.ticketId, t.createdAt), index("support_events_org_idx").on(t.organizationId, t.createdAt)],
);

/** Ledger of inbound webhook deliveries (idempotency by `provider_event_id`; errors kept for the console). */
export const supportInboundEvents = pgTable(
  "support_inbound_events",
  {
    id: id(),
    provider: text("provider").notNull().default("resend"),
    providerEventId: text("provider_event_id").notNull(),
    receivedAt: tz("received_at").notNull().defaultNow(),
    processedAt: tz("processed_at"),
    status: text("status").$type<SupportInboundEventStatus>().notNull().default("received"),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    error: text("error"),
    /**
     * The parsed `email.received` event without bodies or attachment bytes (ids, addresses, subject, headers,
     * attachment names — migration 0018), so an admin can reprocess a failed delivery from the console; null
     * for delivery events and rows written before the column existed.
     */
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (t) => [uniqueIndex("support_inbound_events_provider_event_uq").on(t.providerEventId), index("support_inbound_events_status_idx").on(t.status, t.receivedAt)],
);

/** Singleton (`id = 1`) desk settings; environment variables provide defaults for the mail fields (docs/18 §"Environment"). */
export const supportSettings = pgTable("support_settings", {
  id: integer("id").primaryKey().default(1),
  /** domain that receives replies (`support+t<number>@<inbound_domain>`), e.g. `support.track.site` */
  inboundDomain: text("inbound_domain").notNull().default("support.track.site"),
  fromName: text("from_name").notNull().default("Track Support"),
  fromAddress: text("from_address").notNull().default("support@track.site"),
  signatureText: text("signature_text").notNull().default(""),
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
  autoAssignStrategy: text("auto_assign_strategy").$type<SupportAutoAssignStrategy>().notNull().default("none"),
  businessHours: jsonb("business_hours").$type<SupportBusinessHours>().notNull().default({ timezone: "Europe/Berlin", days: {} }),
  csatEnabled: boolean("csat_enabled").notNull().default(true),
  ...timestamps(),
});

// ---------------------------------------------------------------------------------------------------
// Agent notifications and presence (migration 0016, docs/18 §"Notifications")
// ---------------------------------------------------------------------------------------------------

export const SUPPORT_NOTIFICATION_KINDS = ["assignment", "customer_reply", "sla_warning", "sla_breach", "mention"] as const;
export type SupportNotificationKind = (typeof SUPPORT_NOTIFICATION_KINDS)[number];

/** Where a notification row came from: a `support_events` row or a `support_messages` note (mentions). */
export const SUPPORT_NOTIFICATION_SOURCES = ["event", "message"] as const;
export type SupportNotificationSource = (typeof SUPPORT_NOTIFICATION_SOURCES)[number];

export const SUPPORT_NOTIFICATION_MAIL_STATUSES = ["none", "pending", "sent", "failed", "skipped"] as const;
export type SupportNotificationMailStatus = (typeof SUPPORT_NOTIFICATION_MAIL_STATUSES)[number];

/**
 * One row per operator: `last_seen_at` is refreshed by every notification poll of the console (the "online"
 * signal next to `support_presence`, which only covers open ticket pages) and the e-mail preferences of the
 * agent. Operator-only (every privilege revoked from `tracksite_app`); a missing row means the defaults.
 */
export const supportAgentSettings = pgTable(
  "support_agent_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    emailOnAssignment: boolean("email_on_assignment").notNull().default(true),
    emailOnCustomerReply: boolean("email_on_customer_reply").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("support_agent_settings_seen_idx").on(t.lastSeenAt)],
);

/**
 * Per-recipient notification, materialised from the ticket timeline (`assignee` → `assignment`, customer
 * `reply` → `customer_reply`, `sla_warning` / `sla_breach`) and from `@name` mentions in internal notes
 * (`mention`, source = the note's message id). `payload` carries ids and field values only — never bodies.
 * `(user_id, kind, source_kind, source_id)` is unique so the fan-out is idempotent; `ticket_id` cascades.
 */
export const supportNotifications = pgTable(
  "support_notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SupportNotificationKind>().notNull(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").$type<SupportNotificationSource>().notNull(),
    sourceId: uuid("source_id").notNull(),
    /** who caused it (agent or customer user id); null for the system (SLA engine, inbound mail) */
    actorUserId: uuid("actor_user_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    readAt: tz("read_at"),
    /** `pending` for kinds the desk e-mails (assignment, customer reply), `none` for the others */
    mailStatus: text("mail_status").$type<SupportNotificationMailStatus>().notNull().default("none"),
    emailedAt: tz("emailed_at"),
    emailError: text("email_error"),
  },
  (t) => [
    uniqueIndex("support_notifications_source_uq").on(t.userId, t.kind, t.sourceKind, t.sourceId),
    index("support_notifications_user_idx").on(t.userId, t.createdAt),
    index("support_notifications_unread_idx").on(t.userId).where(sql`${t.readAt} IS NULL`),
    index("support_notifications_mail_idx").on(t.createdAt).where(sql`${t.mailStatus} = 'pending'`),
    index("support_notifications_created_idx").on(t.createdAt),
  ],
);

/** Singleton (`id = 1`) cursor of the notification fan-out: how far the timeline and the notes were scanned. */
export const supportNotificationSync = pgTable("support_notification_sync", {
  id: integer("id").primaryKey().default(1),
  eventsThrough: tz("events_through"),
  messagesThrough: tz("messages_through"),
  ranAt: tz("ran_at"),
});
