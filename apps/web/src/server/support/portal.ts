import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import type { Actor } from "@track-site/core";
import {
  SUPPORT_EVENT_CUSTOMER_KINDS,
  SUPPORT_TICKET_PRIORITIES,
  pgErrorCode,
  recordAudit,
  supportAttachments,
  supportEvents,
  supportMessages,
  subscriptions,
  supportSettings,
  supportSlaPolicies,
  supportTickets,
  user,
  type DbOrTx,
  type SlaPriorityTargets,
  type SupportAuthorKind,
  type SupportBusinessHours,
  type SupportEventKind,
  type SupportSatisfaction,
  type SupportTicketChannel,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import { PORTAL_LIMITS, PORTAL_VIEWS, SUPPORT_CATEGORIES, type PortalView, type SupportCategory } from "@/components/app/support/constants";
import { env } from "@/env";
import { isLocale, type AppLocale } from "@/i18n/routing";
import { searchKnowledge } from "@/lib/knowledge";
import { articlePath } from "@/lib/knowledge-routes";
import { pick } from "@/lib/marketing-copy/pick";
import type { LocalizedCopy } from "@/lib/marketing-copy/types";
import { db, logger } from "@/server/db";
import { withOrg, type OrgContext } from "@/server/session";
import { noopAttachmentScanner, sanitizeFileName, sanitizeHtml, screenAttachments, type AttachmentRejection, type AttachmentScanner } from "./inbound";
import { buildTicketMail, sendTicketMail, supportMailSettings, type SupportMailSettings, type TicketMailResult } from "./mail";
import { computeDueDates, statusTransition, type SlaDueDates } from "./sla";
import { loadSlaPolicy } from "./ticket";

/**
 * Customer support portal (`/app/support`, docs/18-support-desk.md §"Customer view") — the read side and the
 * pure rules of the customer-facing slice, shared by the pages, the server actions (`actions/support.ts`),
 * the public contact form (`actions/contact.ts`) and the unit tests.
 *
 * - Every tenant read and write runs inside `withOrg` (RLS as `tracksite_app`): a customer sees the tickets
 *   of their own organisation, messages that are not internal notes, attachments of such messages and the
 *   customer-relevant timeline kinds. The loaders additionally select only `SUPPORT_TICKET_CUSTOMER_COLUMNS`
 *   — assignee, SLA policy, breach flags, pause state and tags never leave the server.
 * - Platform users are shown by display name only (`user.name`); nothing else of an agent reaches the page.
 * - SLA due times come from the engine (`./sla`): `computeDueDates` from the creation time under the plan's
 *   or the default policy, `statusTransition` on a customer reply; a ticket without a policy keeps `null`
 *   — nothing is guessed.
 * - Ticket mails go through `support/mail.ts`; a transport failure never undoes a write.
 */

// ---------------------------------------------------------------------------------------------------
// Constants and pure rules
// ---------------------------------------------------------------------------------------------------

export { PORTAL_LIMITS, PORTAL_VIEWS, SUPPORT_CATEGORIES, type PortalView, type SupportCategory } from "@/components/app/support/constants";

/** Statuses a customer still considers "open" (the agent-side `on_hold` included: it is waiting on Track). */
export const CUSTOMER_OPEN_STATUSES: readonly SupportTicketStatus[] = ["new", "open", "pending", "on_hold"];
export const CUSTOMER_SOLVED_STATUSES: readonly SupportTicketStatus[] = ["solved", "closed"];
/** Statuses the portal never shows: a ticket flagged as spam by an operator disappears from the customer's list. */
export const CUSTOMER_HIDDEN_STATUSES: readonly SupportTicketStatus[] = ["spam"];

export function isPortalView(value: unknown): value is PortalView {
  return typeof value === "string" && (PORTAL_VIEWS as readonly string[]).includes(value);
}

export function isSupportCategory(value: unknown): value is SupportCategory {
  return typeof value === "string" && (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isSupportPriority(value: unknown): value is SupportTicketPriority {
  return typeof value === "string" && (SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(value);
}

/** `?view=` from the URL; anything unknown is the default ("open"), never an error page. */
export function parsePortalView(params: Record<string, string | string[] | undefined>): PortalView {
  const raw = params.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isPortalView(value) ? value : "open";
}

/** Whether the customer may add a message: never on spam and never on a ticket merged into another one. */
export function customerCanReply(ticket: { status: SupportTicketStatus; mergedIntoId: string | null }): boolean {
  return !CUSTOMER_HIDDEN_STATUSES.includes(ticket.status) && ticket.mergedIntoId === null;
}

/** "Mark as solved" is offered while the ticket is open from the customer's point of view. */
export function customerCanMarkSolved(ticket: { status: SupportTicketStatus; mergedIntoId: string | null }): boolean {
  return CUSTOMER_OPEN_STATUSES.includes(ticket.status) && ticket.mergedIntoId === null;
}

/** Satisfaction is asked once, after the ticket was solved or closed, when the desk has surveys switched on. */
export function customerCanRate(ticket: { status: SupportTicketStatus; satisfaction: SupportSatisfaction | null; mergedIntoId: string | null }, csatEnabled: boolean): boolean {
  return csatEnabled && CUSTOMER_SOLVED_STATUSES.includes(ticket.status) && ticket.satisfaction === null && ticket.mergedIntoId === null;
}

/**
 * Status after a customer message: an answer to a `pending` question opens the ticket again, a message on a
 * solved or closed ticket reopens it (`reopened` event, `reopen_count`), everything else keeps its state.
 */
export function statusAfterCustomerReply(status: SupportTicketStatus): { status: SupportTicketStatus; reopened: boolean } {
  if (status === "pending") return { status: "open", reopened: false };
  if (status === "solved" || status === "closed") return { status: "open", reopened: true };
  return { status, reopened: false };
}

const SUBJECT_MAX_FROM_MESSAGE = 80;

/**
 * Subject of a ticket created from the public contact form: the topic (integration page, plan …) when the
 * form carried one, otherwise the first line of the message cut at a word boundary.
 */
export function formTicketSubject(kind: "contact" | "demo" | "support", topic: string | null | undefined, message: string): string {
  const cleanTopic = (topic ?? "").replace(/\s+/g, " ").trim();
  if (cleanTopic) return cleanTopic.slice(0, PORTAL_LIMITS.subjectMax);
  const firstLine = message.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const prefix = kind === "demo" ? "Demo request" : kind === "support" ? "Support request" : "Contact request";
  if (!firstLine) return prefix;
  if (firstLine.length <= SUBJECT_MAX_FROM_MESSAGE) return firstLine;
  const cut = firstLine.slice(0, SUBJECT_MAX_FROM_MESSAGE);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 40 ? cut.slice(0, atWord) : cut).trim()}…`;
}

/** Fields a customer may see on an event of their own ticket (mirrors the tenant SELECT policy). */
export interface PortalEventPayload {
  from?: string;
  to?: string;
  score?: number;
  channel?: string;
  intoNumber?: number;
}

/** Keeps only the whitelisted, scalar payload fields — never bodies, notes, tags or assignees. */
export function customerEventPayload(payload: unknown): PortalEventPayload {
  const out: PortalEventPayload = {};
  if (!payload || typeof payload !== "object") return out;
  const p = payload as Record<string, unknown>;
  if (typeof p.from === "string") out.from = p.from;
  if (typeof p.to === "string") out.to = p.to;
  if (typeof p.score === "number" && Number.isFinite(p.score)) out.score = p.score;
  if (typeof p.channel === "string") out.channel = p.channel;
  const into = p.into_number ?? p.intoNumber;
  if (typeof into === "number" && Number.isFinite(into)) out.intoNumber = into;
  return out;
}

// ---------------------------------------------------------------------------------------------------
// SLA policy of a new ticket (the clocks live in the engine, ./sla)
// ---------------------------------------------------------------------------------------------------

/** The policy columns a new ticket needs — `computeDueDates` reads the targets and the business hours. */
export interface SlaPolicyLite {
  id: string;
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
}

/**
 * The SLA policy of a new ticket (readable by tenants — targets are not secret): the policy listing the
 * organisation's plan first, otherwise the desk default — the same choice the inbound e-mail handler makes;
 * null when neither exists (no SLA, never guessed).
 */
export async function loadSlaPolicyForPlan(tx: DbOrTx, planId: string | null | undefined): Promise<SlaPolicyLite | null> {
  try {
    const rows = await tx.select({ id: supportSlaPolicies.id, priorities: supportSlaPolicies.priorities, businessHours: supportSlaPolicies.businessHours, planIds: supportSlaPolicies.planIds, isDefault: supportSlaPolicies.isDefault }).from(supportSlaPolicies);
    const chosen = (planId ? rows.find((p) => Array.isArray(p.planIds) && p.planIds.includes(planId)) : undefined) ?? rows.find((p) => p.isDefault) ?? null;
    return chosen ? { id: chosen.id, priorities: chosen.priorities, businessHours: chosen.businessHours } : null;
  } catch (e) {
    if (pgErrorCode(e) !== "42P01") throw e;
    return null;
  }
}

/** The desk's default SLA policy; null until one is marked default. */
export async function loadDefaultSlaPolicy(tx: DbOrTx): Promise<SlaPolicyLite | null> {
  return loadSlaPolicyForPlan(tx, null);
}

/**
 * Plan of an organisation (`subscriptions.plan_id`) for the policy choice, read through the application
 * connection like the billing module does (the table carries no tenant policy); null without a row.
 */
export async function organizationPlanId(organizationId: string | null): Promise<string | null> {
  if (!organizationId) return null;
  try {
    const [row] = await db().select({ planId: subscriptions.planId }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
    return row?.planId ?? null;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "support.plan_lookup_failed");
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Desk settings (singleton; read outside the tenant transaction — the row carries no tenant data)
// ---------------------------------------------------------------------------------------------------

export interface PortalSettings {
  csatEnabled: boolean;
  autoReplyEnabled: boolean;
  mail: SupportMailSettings;
}

export const PORTAL_SETTINGS_DEFAULTS: PortalSettings = { csatEnabled: true, autoReplyEnabled: false, mail: supportMailSettings(null) };

/**
 * `support_settings` (id = 1). Tenants have no privilege on the table, so the singleton is read through the
 * application connection; it holds desk configuration only, never customer data. Missing table or row →
 * defaults (satisfaction surveys on, no automatic acknowledgement).
 */
export async function loadPortalSettings(): Promise<PortalSettings> {
  try {
    const rows = await db().select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
    const row = rows[0];
    if (!row) return PORTAL_SETTINGS_DEFAULTS;
    return { csatEnabled: row.csatEnabled, autoReplyEnabled: row.autoReplyEnabled, mail: supportMailSettings(row) };
  } catch (e) {
    if (pgErrorCode(e) !== "42P01") throw e;
    logger.warn("support_settings missing: apply migration 0015_support_desk");
    return PORTAL_SETTINGS_DEFAULTS;
  }
}

// ---------------------------------------------------------------------------------------------------
// Uploads (attachments from the dashboard)
// ---------------------------------------------------------------------------------------------------

export interface ScreenedUpload {
  file: File;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadScreening {
  accepted: ScreenedUpload[];
  rejected: Array<{ fileName: string; reason: AttachmentRejection }>;
}

/** Files of a multipart form field (`formData.getAll(name)`): empty selections drop out, the rest goes through `screenAttachments`. */
export function screenUploads(entries: FormDataEntryValue[]): UploadScreening {
  const candidates: ScreenedUpload[] = [];
  for (const entry of entries) {
    if (typeof entry === "string" || !(entry instanceof File)) continue;
    if (entry.size === 0 && !entry.name) continue;
    candidates.push({ file: entry, fileName: sanitizeFileName(entry.name), contentType: (entry.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase(), sizeBytes: entry.size });
  }
  const screening = screenAttachments(candidates);
  return { accepted: screening.accepted, rejected: screening.rejected.map((r) => ({ fileName: r.attachment.fileName, reason: r.reason })) };
}

// ---------------------------------------------------------------------------------------------------
// Writes shared by the dashboard actions and the public contact form
// ---------------------------------------------------------------------------------------------------

export interface NewTicketInput {
  organizationId: string | null;
  requester: { userId: string | null; email: string; name: string | null; locale: string };
  subject: string;
  category: string | null;
  priority: SupportTicketPriority;
  channel: SupportTicketChannel;
  /** plain text as the customer typed it (rendered as text, never as HTML) */
  body: string;
  attachments?: ScreenedUpload[];
  scanner?: AttachmentScanner;
  now?: Date;
  /** the organisation's plan (`organizationPlanId`) — picks a plan-specific SLA policy over the default */
  planId?: string | null;
}

export interface StoredAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface NewTicketResult {
  ticketId: string;
  number: number;
  messageId: string;
  attachments: StoredAttachment[];
  /** attachments the scanner refused (name and verdict only) */
  refused: Array<{ fileName: string; detail: string | null }>;
  sla: SlaDueDates & { policyId: string | null };
}

async function storeAttachments(tx: DbOrTx, args: { messageId: string; ticketId: string; organizationId: string | null; uploads: ScreenedUpload[]; scanner: AttachmentScanner }): Promise<{ stored: StoredAttachment[]; refused: Array<{ fileName: string; detail: string | null }> }> {
  const stored: StoredAttachment[] = [];
  const refused: Array<{ fileName: string; detail: string | null }> = [];
  for (const upload of args.uploads) {
    const content = Buffer.from(await upload.file.arrayBuffer());
    const verdict = await args.scanner.scan(content, { fileName: upload.fileName, contentType: upload.contentType, sizeBytes: content.length });
    if (!verdict.clean) {
      refused.push({ fileName: upload.fileName, detail: verdict.detail });
      continue;
    }
    const [row] = await tx
      .insert(supportAttachments)
      .values({ messageId: args.messageId, ticketId: args.ticketId, organizationId: args.organizationId, fileName: upload.fileName, contentType: upload.contentType, sizeBytes: content.length, sha256: createHash("sha256").update(content).digest("hex"), content })
      .returning({ id: supportAttachments.id });
    stored.push({ id: row!.id, fileName: upload.fileName, contentType: upload.contentType, sizeBytes: content.length });
  }
  return { stored, refused };
}

/**
 * Creates a ticket with its first customer message, attachments and the `created` event. Runs inside the
 * caller's transaction: a tenant transaction (`withOrg`) for the dashboard — where RLS requires the
 * organisation to be the caller's own and the message to be `inbound` + `customer` — or the application
 * connection for the public form (organisation null unless the sender is a member).
 */
export async function insertTicket(tx: DbOrTx, input: NewTicketInput): Promise<NewTicketResult> {
  const now = input.now ?? new Date();
  const policy = await loadSlaPolicyForPlan(tx, input.planId ?? null);
  const due = computeDueDates(policy, input.priority, now);
  const [ticket] = await tx
    .insert(supportTickets)
    .values({
      organizationId: input.organizationId,
      requesterUserId: input.requester.userId,
      requesterEmail: input.requester.email.trim().toLowerCase(),
      requesterName: input.requester.name?.trim() || null,
      subject: input.subject,
      status: "new",
      priority: input.priority,
      channel: input.channel,
      category: input.category,
      slaPolicyId: policy?.id ?? null,
      firstResponseDueAt: due.firstResponseDueAt,
      resolutionDueAt: due.resolutionDueAt,
      lastCustomerMessageAt: now,
      locale: isLocale(input.requester.locale) ? input.requester.locale : "en",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: supportTickets.id, number: supportTickets.number });
  const [message] = await tx
    .insert(supportMessages)
    .values({ ticketId: ticket!.id, organizationId: input.organizationId, direction: "inbound", authorKind: "customer", authorUserId: input.requester.userId, fromEmail: input.requester.email.trim().toLowerCase(), subject: input.subject, textBody: input.body, htmlBody: null, deliveryStatus: "na", createdAt: now })
    .returning({ id: supportMessages.id });
  const files = await storeAttachments(tx, { messageId: message!.id, ticketId: ticket!.id, organizationId: input.organizationId, uploads: input.attachments ?? [], scanner: input.scanner ?? noopAttachmentScanner });
  await tx.insert(supportEvents).values({ ticketId: ticket!.id, organizationId: input.organizationId, actorKind: "customer", actorUserId: input.requester.userId, kind: "created", payload: { channel: input.channel, priority: input.priority, category: input.category, attachments: files.stored.length }, createdAt: now });
  return { ticketId: ticket!.id, number: Number(ticket!.number), messageId: message!.id, attachments: files.stored, refused: files.refused, sla: { ...due, policyId: policy?.id ?? null } };
}

/** SLA clock columns of the locked ticket row; consumed by the engine's `statusTransition` inside the transaction, never sent to the page. */
export interface CustomerTicketClock {
  priority: SupportTicketPriority;
  slaPolicyId: string | null;
  pausedAt: Date | null;
  pauseTotalMs: number;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export interface CustomerReplyInput {
  ticket: CustomerTicketClock & { id: string; organizationId: string; status: SupportTicketStatus; reopenCount: number; requesterEmail: string };
  author: { userId: string; email: string };
  body: string;
  attachments?: ScreenedUpload[];
  scanner?: AttachmentScanner;
  now?: Date;
}

export interface CustomerReplyResult {
  messageId: string;
  statusFrom: SupportTicketStatus;
  statusTo: SupportTicketStatus;
  reopened: boolean;
  attachments: StoredAttachment[];
  refused: Array<{ fileName: string; detail: string | null }>;
}

/**
 * A customer message on an existing ticket: message, attachments, status change (`pending` → `open`,
 * reopening) and events. The status transition is the SLA engine's `statusTransition` with the ticket's
 * own policy (docs/18 §10) — the same call the ticket page makes: leaving `pending` books the pause and
 * shifts the running due times by its business minutes, a reopen restarts the resolution clock (and the
 * first-response clock while unanswered) from now — the SLA worker never sees a stale due time.
 */
export async function insertCustomerReply(tx: Tx, input: CustomerReplyInput): Promise<CustomerReplyResult> {
  const now = input.now ?? new Date();
  const next = statusAfterCustomerReply(input.ticket.status);
  const [message] = await tx
    .insert(supportMessages)
    .values({ ticketId: input.ticket.id, organizationId: input.ticket.organizationId, direction: "inbound", authorKind: "customer", authorUserId: input.author.userId, fromEmail: input.author.email.toLowerCase(), textBody: input.body, htmlBody: null, deliveryStatus: "na", createdAt: now })
    .returning({ id: supportMessages.id });
  const files = await storeAttachments(tx, { messageId: message!.id, ticketId: input.ticket.id, organizationId: input.ticket.organizationId, uploads: input.attachments ?? [], scanner: input.scanner ?? noopAttachmentScanner });
  const policy = next.status !== input.ticket.status && input.ticket.slaPolicyId ? await loadSlaPolicy(tx, input.ticket.slaPolicyId) : null;
  const transition = next.status !== input.ticket.status ? statusTransition(policy, input.ticket, next.status, now).patch : {};
  await tx
    .update(supportTickets)
    .set({ ...transition, ...(next.reopened ? { reopenCount: input.ticket.reopenCount + 1 } : {}), lastCustomerMessageAt: now, updatedAt: now })
    .where(eq(supportTickets.id, input.ticket.id));
  await tx.insert(supportEvents).values({ ticketId: input.ticket.id, organizationId: input.ticket.organizationId, actorKind: "customer", actorUserId: input.author.userId, kind: "reply", payload: { direction: "inbound", attachments: files.stored.length }, createdAt: now });
  if (next.reopened) {
    await tx.insert(supportEvents).values({ ticketId: input.ticket.id, organizationId: input.ticket.organizationId, actorKind: "customer", actorUserId: input.author.userId, kind: "reopened", payload: { from: input.ticket.status, to: next.status }, createdAt: now });
  } else if (next.status !== input.ticket.status) {
    await tx.insert(supportEvents).values({ ticketId: input.ticket.id, organizationId: input.ticket.organizationId, actorKind: "customer", actorUserId: input.author.userId, kind: "status", payload: { from: input.ticket.status, to: next.status }, createdAt: now });
  }
  return { messageId: message!.id, statusFrom: input.ticket.status, statusTo: next.status, reopened: next.reopened, attachments: files.stored, refused: files.refused };
}

// ---------------------------------------------------------------------------------------------------
// Reads (customer view)
// ---------------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export interface PortalTicketRow {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: string | null;
  channel: SupportTicketChannel;
  requesterName: string | null;
  requesterEmail: string;
  createdAt: Date;
  updatedAt: Date;
  lastAgentMessageAt: Date | null;
  lastCustomerMessageAt: Date | null;
  resolvedAt: Date | null;
  satisfactionScore: number | null;
  mergedIntoId: string | null;
}

/** Column set of the customer view (exactly `SUPPORT_TICKET_CUSTOMER_COLUMNS` minus what the row type does not need). */
const TICKET_COLUMNS = {
  id: supportTickets.id,
  number: supportTickets.number,
  organizationId: supportTickets.organizationId,
  requesterUserId: supportTickets.requesterUserId,
  requesterEmail: supportTickets.requesterEmail,
  requesterName: supportTickets.requesterName,
  subject: supportTickets.subject,
  status: supportTickets.status,
  priority: supportTickets.priority,
  channel: supportTickets.channel,
  category: supportTickets.category,
  firstRespondedAt: supportTickets.firstRespondedAt,
  resolvedAt: supportTickets.resolvedAt,
  closedAt: supportTickets.closedAt,
  lastCustomerMessageAt: supportTickets.lastCustomerMessageAt,
  lastAgentMessageAt: supportTickets.lastAgentMessageAt,
  mergedIntoId: supportTickets.mergedIntoId,
  locale: supportTickets.locale,
  satisfaction: supportTickets.satisfaction,
  reopenCount: supportTickets.reopenCount,
  createdAt: supportTickets.createdAt,
  updatedAt: supportTickets.updatedAt,
};

interface TicketRecord {
  id: string;
  number: number;
  organizationId: string | null;
  requesterUserId: string | null;
  requesterEmail: string;
  requesterName: string | null;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  channel: SupportTicketChannel;
  category: string | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastCustomerMessageAt: Date | null;
  lastAgentMessageAt: Date | null;
  mergedIntoId: string | null;
  locale: string;
  satisfaction: SupportSatisfaction | null;
  reopenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalListResult {
  tickets: PortalTicketRow[];
  view: PortalView;
  counts: { open: number; solved: number };
  /** false while migration 0015 is not applied — the page says so instead of failing */
  available: boolean;
}

function toRow(t: TicketRecord): PortalTicketRow {
  return {
    id: t.id,
    number: Number(t.number),
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    category: t.category ?? null,
    channel: t.channel,
    requesterName: t.requesterName ?? null,
    requesterEmail: t.requesterEmail,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    lastAgentMessageAt: t.lastAgentMessageAt ?? null,
    lastCustomerMessageAt: t.lastCustomerMessageAt ?? null,
    resolvedAt: t.resolvedAt ?? null,
    satisfactionScore: t.satisfaction?.score ?? null,
    mergedIntoId: t.mergedIntoId ?? null,
  };
}

/** The organisation's tickets for a view (newest activity first), plus the open / solved counts for the view chips. */
export async function listCustomerTickets(ctx: OrgContext, view: PortalView): Promise<PortalListResult> {
  return withOrg(ctx, async (tx) => {
    let rows: TicketRecord[];
    try {
      rows = await tx.transaction((sp) =>
        sp
          .select(TICKET_COLUMNS)
          .from(supportTickets)
          .where(and(eq(supportTickets.organizationId, ctx.organization.id), notInArray(supportTickets.status, [...CUSTOMER_HIDDEN_STATUSES])))
          .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.number)),
      );
    } catch (e) {
      if (pgErrorCode(e) !== "42P01") throw e;
      logger.warn("support_tickets missing: apply migration 0015_support_desk");
      return { tickets: [], view, counts: { open: 0, solved: 0 }, available: false };
    }
    const all = rows.map(toRow);
    const open = all.filter((t) => CUSTOMER_OPEN_STATUSES.includes(t.status));
    const solved = all.filter((t) => CUSTOMER_SOLVED_STATUSES.includes(t.status));
    const tickets = (view === "open" ? open : view === "solved" ? solved : all).slice(0, PORTAL_LIMITS.listLimit);
    return { tickets, view, counts: { open: open.length, solved: solved.length }, available: true };
  });
}

export interface PortalAttachmentMeta {
  id: string;
  messageId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface PortalMessage {
  id: string;
  direction: "inbound" | "outbound";
  authorKind: SupportAuthorKind;
  /** requester / member name for customer messages, the agent's display name for agent messages, null otherwise */
  authorName: string | null;
  textBody: string;
  /** sanitised HTML (allow-list, no scripts, styles, forms or remote images) or null when the message is plain text */
  htmlBody: string | null;
  createdAt: Date;
  attachments: PortalAttachmentMeta[];
}

export interface PortalEvent {
  id: string;
  kind: SupportEventKind;
  actorKind: SupportAuthorKind;
  payload: PortalEventPayload;
  createdAt: Date;
}

export interface PortalTicketDetail {
  ticket: PortalTicketRow & { locale: string; reopenCount: number; satisfaction: SupportSatisfaction | null; firstRespondedAt: Date | null; closedAt: Date | null };
  messages: PortalMessage[];
  events: PortalEvent[];
  mergedInto: { id: string; number: number } | null;
}

/**
 * One ticket of the organisation as the customer may see it: messages without internal notes (RLS and an
 * explicit filter), attachment metadata (never bytes), customer-relevant events and display names only.
 * `null` for an unknown id, another organisation's ticket (RLS) or a ticket flagged as spam.
 */
export async function loadCustomerTicket(ctx: OrgContext, ticketId: string): Promise<PortalTicketDetail | null> {
  if (!isUuid(ticketId)) return null;
  return withOrg(ctx, async (tx) => {
    let rows: TicketRecord[];
    try {
      rows = await tx.transaction((sp) => sp.select(TICKET_COLUMNS).from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.organizationId, ctx.organization.id))).limit(1));
    } catch (e) {
      if (pgErrorCode(e) !== "42P01") throw e;
      return null;
    }
    const t = rows[0];
    if (!t || CUSTOMER_HIDDEN_STATUSES.includes(t.status)) return null;
    // sequential on purpose: one pg client per transaction
    const messageRows = await tx
      .select({ id: supportMessages.id, direction: supportMessages.direction, authorKind: supportMessages.authorKind, authorUserId: supportMessages.authorUserId, textBody: supportMessages.textBody, htmlBody: supportMessages.htmlBody, createdAt: supportMessages.createdAt })
      .from(supportMessages)
      .where(and(eq(supportMessages.ticketId, t.id), ne(supportMessages.direction, "note")))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
    const attachmentRows = await tx
      .select({ id: supportAttachments.id, messageId: supportAttachments.messageId, fileName: supportAttachments.fileName, contentType: supportAttachments.contentType, sizeBytes: supportAttachments.sizeBytes })
      .from(supportAttachments)
      .where(eq(supportAttachments.ticketId, t.id))
      .orderBy(asc(supportAttachments.createdAt), asc(supportAttachments.id));
    const eventRows = await tx
      .select({ id: supportEvents.id, kind: supportEvents.kind, actorKind: supportEvents.actorKind, payload: supportEvents.payload, createdAt: supportEvents.createdAt })
      .from(supportEvents)
      .where(and(eq(supportEvents.ticketId, t.id), inArray(supportEvents.kind, [...SUPPORT_EVENT_CUSTOMER_KINDS])))
      .orderBy(asc(supportEvents.createdAt), asc(supportEvents.id));
    const authorIds = Array.from(new Set(messageRows.map((m) => m.authorUserId).filter((id): id is string => Boolean(id))));
    // display names only — never an operator's e-mail, role or any other detail
    const names = new Map<string, string>();
    if (authorIds.length) {
      const nameRows = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, authorIds));
      for (const n of nameRows) if (n.name) names.set(n.id, n.name);
    }
    let mergedInto: PortalTicketDetail["mergedInto"] = null;
    if (t.mergedIntoId) {
      const [target] = await tx.select({ id: supportTickets.id, number: supportTickets.number }).from(supportTickets).where(eq(supportTickets.id, t.mergedIntoId)).limit(1);
      mergedInto = target ? { id: target.id, number: Number(target.number) } : null;
    }
    const byMessage = new Map<string, PortalAttachmentMeta[]>();
    const messageIds = new Set(messageRows.map((m) => m.id));
    for (const a of attachmentRows) {
      if (!messageIds.has(a.messageId)) continue;
      const list = byMessage.get(a.messageId) ?? [];
      list.push(a);
      byMessage.set(a.messageId, list);
    }
    const messages: PortalMessage[] = messageRows
      .filter((m): m is typeof m & { direction: "inbound" | "outbound" } => m.direction !== "note")
      .map((m) => ({
        id: m.id,
        direction: m.direction,
        authorKind: m.authorKind,
        authorName: (m.authorUserId ? names.get(m.authorUserId) : undefined) ?? (m.authorKind === "customer" ? (t.requesterName ?? t.requesterEmail) : null),
        textBody: m.textBody,
        // stored sanitised already; sanitised again on the way out so an older row never reaches the page raw
        htmlBody: m.htmlBody?.trim() ? sanitizeHtml(m.htmlBody) : null,
        createdAt: m.createdAt,
        attachments: byMessage.get(m.id) ?? [],
      }));
    const events: PortalEvent[] = eventRows.map((e) => ({ id: e.id, kind: e.kind, actorKind: e.actorKind, payload: customerEventPayload(e.payload), createdAt: e.createdAt }));
    return {
      ticket: { ...toRow(t), locale: t.locale, reopenCount: t.reopenCount, satisfaction: t.satisfaction ?? null, firstRespondedAt: t.firstRespondedAt ?? null, closedAt: t.closedAt ?? null },
      messages,
      events,
      mergedInto,
    };
  });
}

export type LockedCustomerTicket = CustomerTicketClock & { id: string; number: number; organizationId: string; status: SupportTicketStatus; reopenCount: number; requesterEmail: string; requesterName: string | null; subject: string; locale: string; satisfaction: SupportSatisfaction | null; mergedIntoId: string | null };

/**
 * The ticket row the mutations need, locked for the transaction; null when it is not the organisation's (RLS)
 * or hidden. Carries the SLA clock columns for the status transition — they stay inside the action and never
 * reach a page (`SUPPORT_TICKET_CUSTOMER_COLUMNS` governs what is rendered).
 */
export async function lockCustomerTicket(tx: Tx, organizationId: string, ticketId: string): Promise<LockedCustomerTicket | null> {
  if (!isUuid(ticketId)) return null;
  const rows = await tx
    .select({
      id: supportTickets.id,
      number: supportTickets.number,
      status: supportTickets.status,
      priority: supportTickets.priority,
      reopenCount: supportTickets.reopenCount,
      requesterEmail: supportTickets.requesterEmail,
      requesterName: supportTickets.requesterName,
      subject: supportTickets.subject,
      locale: supportTickets.locale,
      satisfaction: supportTickets.satisfaction,
      mergedIntoId: supportTickets.mergedIntoId,
      slaPolicyId: supportTickets.slaPolicyId,
      pausedAt: supportTickets.pausedAt,
      pauseTotalMs: supportTickets.pauseTotalMs,
      firstResponseDueAt: supportTickets.firstResponseDueAt,
      resolutionDueAt: supportTickets.resolutionDueAt,
      firstRespondedAt: supportTickets.firstRespondedAt,
      resolvedAt: supportTickets.resolvedAt,
      closedAt: supportTickets.closedAt,
    })
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.organizationId, organizationId)))
    .limit(1)
    .for("update");
  const t = rows[0];
  if (!t || CUSTOMER_HIDDEN_STATUSES.includes(t.status)) return null;
  return {
    id: t.id,
    number: Number(t.number),
    organizationId,
    status: t.status,
    priority: t.priority,
    reopenCount: t.reopenCount,
    requesterEmail: t.requesterEmail,
    requesterName: t.requesterName ?? null,
    subject: t.subject,
    locale: t.locale,
    satisfaction: t.satisfaction ?? null,
    mergedIntoId: t.mergedIntoId ?? null,
    slaPolicyId: t.slaPolicyId ?? null,
    pausedAt: t.pausedAt ?? null,
    pauseTotalMs: t.pauseTotalMs ?? 0,
    firstResponseDueAt: t.firstResponseDueAt ?? null,
    resolutionDueAt: t.resolutionDueAt ?? null,
    firstRespondedAt: t.firstRespondedAt ?? null,
    resolvedAt: t.resolvedAt ?? null,
    closedAt: t.closedAt ?? null,
  };
}

/** RFC 6266 `Content-Disposition` with an ASCII fallback and the UTF-8 name; a file name can never break the header. */
export function attachmentDisposition(fileName: string): string {
  // control characters are dropped, non-ASCII, quotes and backslashes become "_"; the UTF-8 parameter keeps the real name
  const ascii = Array.from(fileName, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return "";
    return code > 0x7e || ch === '"' || ch === "\\" ? "_" : ch;
  })
    .join("")
    .trim() || "attachment";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export interface PortalAttachmentFile {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
}

/** Attachment bytes for the download route; the tenant policy already excludes notes and other organisations. */
export async function loadCustomerAttachment(ctx: OrgContext, ticketId: string, attachmentId: string): Promise<PortalAttachmentFile | null> {
  if (!isUuid(ticketId) || !isUuid(attachmentId)) return null;
  return withOrg(ctx, async (tx) => {
    const rows = await tx
      .select({ fileName: supportAttachments.fileName, contentType: supportAttachments.contentType, sizeBytes: supportAttachments.sizeBytes, content: supportAttachments.content, status: supportTickets.status })
      .from(supportAttachments)
      .innerJoin(supportTickets, eq(supportTickets.id, supportAttachments.ticketId))
      .where(and(eq(supportAttachments.id, attachmentId), eq(supportAttachments.ticketId, ticketId), eq(supportAttachments.organizationId, ctx.organization.id)))
      .limit(1);
    const row = rows[0];
    if (!row || CUSTOMER_HIDDEN_STATUSES.includes(row.status)) return null;
    return { fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, content: Buffer.from(row.content) };
  });
}

// ---------------------------------------------------------------------------------------------------
// Tracking Knowledge suggestions while typing
// ---------------------------------------------------------------------------------------------------

export interface KnowledgeSuggestion {
  id: string;
  title: string;
  description: string;
  /** absolute URL on the marketing host in the reader's language */
  href: string;
  readingMinutes: number;
}

export const KNOWLEDGE_SUGGESTION_LIMIT = 5;
const QUERY_TOKEN_MIN = 3;
const QUERY_TOKENS_MAX = 8;
const QUERY_INPUT_MAX = 600;

/** Search text from what the customer typed: distinct words of three or more letters, at most eight, in order. */
export function knowledgeQueryFrom(text: string): string {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of text.slice(0, QUERY_INPUT_MAX).split(/[^\p{L}\p{N}-]+/u)) {
    const token = raw.replace(/^-+|-+$/g, "").toLowerCase();
    if (token.length < QUERY_TOKEN_MIN || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= QUERY_TOKENS_MAX) break;
  }
  return tokens.join(" ");
}

/** Origin of the public site (`HOST_MARKETING`, no trailing slash) for links out of the dashboard host. */
export function marketingOrigin(): string {
  let host: string | undefined;
  try {
    host = env().HOST_MARKETING;
  } catch {
    // no environment (tests, tooling): the production host
  }
  return (host || "https://www.track.site").replace(/\/+$/, "");
}

/** Public URL of an article in the reader's language. */
export function knowledgeHref(locale: AppLocale, slug: string): string {
  return `${marketingOrigin()}/${locale}${articlePath(slug)}`;
}

/** Published Tracking Knowledge articles that match the customer's subject and message (empty for too little text). */
export async function suggestKnowledge(locale: string, text: string, limit: number = KNOWLEDGE_SUGGESTION_LIMIT): Promise<KnowledgeSuggestion[]> {
  const lang: AppLocale = isLocale(locale) ? locale : "en";
  const q = knowledgeQueryFrom(text);
  if (!q) return [];
  const result = await searchKnowledge(lang, { q });
  return result.hits.slice(0, Math.max(0, limit)).map((a) => ({ id: a.translationGroupId, title: a.title, description: a.description, href: knowledgeHref(lang, a.slug), readingMinutes: a.readingMinutes }));
}

// ---------------------------------------------------------------------------------------------------
// E-mail to the requester
// ---------------------------------------------------------------------------------------------------

interface AcknowledgementCopy {
  /** `{number}`, `{subject}` */
  text: string;
}

const ACK_COPY: LocalizedCopy<AcknowledgementCopy> = {
  en: { text: "Thank you for your message. We have received it as ticket #{number} (\"{subject}\") and will get back to you by e-mail. You can follow the conversation in your Track dashboard under Support." },
  de: { text: "Vielen Dank für Ihre Nachricht. Wir haben sie als Ticket #{number} („{subject}“) erhalten und melden uns per E-Mail bei Ihnen. Den Verlauf finden Sie in Ihrem Track-Dashboard unter Support." },
  fr: { text: "Merci pour votre message. Nous l’avons enregistré sous le ticket n° {number} (« {subject} ») et vous répondrons par e-mail. Vous pouvez suivre la conversation dans votre tableau de bord Track, rubrique Support." },
  es: { text: "Gracias por su mensaje. Lo hemos registrado como ticket n.º {number} («{subject}») y le responderemos por correo electrónico. Puede seguir la conversación en su panel de Track, en Soporte." },
  it: { text: "Grazie per il messaggio. Lo abbiamo registrato come ticket n. {number} (“{subject}”) e ti risponderemo via e-mail. Puoi seguire la conversazione nella dashboard Track alla voce Supporto." },
  nl: { text: "Bedankt voor uw bericht. We hebben het ontvangen als ticket #{number} (\"{subject}\") en reageren per e-mail. U kunt het gesprek volgen in uw Track-dashboard onder Support." },
};

export function acknowledgementText(locale: string | null | undefined, ticket: { number: number; subject: string }): string {
  return pick(locale ?? "en", ACK_COPY).text.replace("{number}", String(ticket.number)).replace("{subject}", ticket.subject);
}

/**
 * Automatic acknowledgement of a new ticket (`kind: "auto"` — Auto-Submitted header, no signature), sent only
 * while the desk has `auto_reply_enabled` on. Never throws; the outcome is returned for the audit entry.
 */
export async function sendTicketAcknowledgement(ticket: { id: string; number: number; subject: string; requesterEmail: string; requesterName: string | null; locale: string }, settings: PortalSettings): Promise<TicketMailResult | null> {
  if (!settings.autoReplyEnabled) return null;
  return sendTicketMail({ ticket, message: { id: `ack-${ticket.id}`, textBody: acknowledgementText(ticket.locale, ticket), kind: "auto" }, locale: ticket.locale, settings: settings.mail });
}

/** Threading of an agent reply: answer the customer's last message, reference every id of the thread so far. */
export function threadingFor(messages: ReadonlyArray<{ direction: string; messageId: string | null; createdAt: Date }>): { inReplyTo: string | null; references: string[] } {
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const references = ordered.map((m) => m.messageId).filter((id): id is string => Boolean(id));
  const lastInbound = [...ordered].reverse().find((m) => m.direction === "inbound" && m.messageId);
  return { inReplyTo: lastInbound?.messageId ?? null, references: Array.from(new Set(references)) };
}

export interface AgentReplyNotification {
  ticketId: string;
  /** the stored outbound agent message (`support_messages`, direction `outbound`, author kind `agent`) */
  messageId: string;
  /** display name of the answering agent (never the e-mail address) */
  agentName: string | null;
}

/**
 * E-mail to the requester about an agent reply (docs/18 §"Outbound"): builds the mail from the stored ticket and
 * message, stores the Message-ID on the row **before** sending, sends through `support/mail.ts` and records the
 * delivery outcome (`sent` / `failed` + error, provider id) on the message. Meant for the operator console's
 * reply action inside its `withPlatform` transaction (the tenant role cannot update messages). Never throws for a
 * transport failure.
 */
export async function notifyRequesterOfAgentReply(tx: DbOrTx, input: AgentReplyNotification, settings?: PortalSettings): Promise<TicketMailResult | { ok: false; transport: "none"; error: string; messageId: null }> {
  const [ticket] = await tx
    .select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject, requesterEmail: supportTickets.requesterEmail, requesterName: supportTickets.requesterName, locale: supportTickets.locale })
    .from(supportTickets)
    .where(eq(supportTickets.id, input.ticketId))
    .limit(1);
  const [message] = await tx
    .select({ id: supportMessages.id, textBody: supportMessages.textBody, htmlBody: supportMessages.htmlBody, ccEmails: supportMessages.ccEmails, messageId: supportMessages.messageId, direction: supportMessages.direction })
    .from(supportMessages)
    .where(and(eq(supportMessages.id, input.messageId), eq(supportMessages.ticketId, input.ticketId)))
    .limit(1);
  if (!ticket || !message || message.direction !== "outbound") return { ok: false, transport: "none", error: "message not found", messageId: null };
  const thread = await tx
    .select({ direction: supportMessages.direction, messageId: supportMessages.messageId, createdAt: supportMessages.createdAt })
    .from(supportMessages)
    .where(and(eq(supportMessages.ticketId, input.ticketId), ne(supportMessages.id, input.messageId), ne(supportMessages.direction, "note")));
  const threading = threadingFor(thread);
  const desk = settings ?? (await loadPortalSettings());
  const attachmentRows = await tx.select({ fileName: supportAttachments.fileName, contentType: supportAttachments.contentType, content: supportAttachments.content }).from(supportAttachments).where(eq(supportAttachments.messageId, message.id));
  const built = { ticket: { id: ticket.id, number: Number(ticket.number), subject: ticket.subject, requesterEmail: ticket.requesterEmail, requesterName: ticket.requesterName, locale: ticket.locale }, message: { id: message.id, textBody: message.textBody, htmlBody: message.htmlBody, messageId: message.messageId, inReplyTo: threading.inReplyTo, references: threading.references, ccEmails: message.ccEmails, agentName: input.agentName, kind: "agent" as const, attachments: attachmentRows.map((a) => ({ filename: a.fileName, contentType: a.contentType, content: Buffer.from(a.content) })) }, locale: ticket.locale, settings: desk.mail };
  // the Message-ID is persisted first so a reply can be matched even when the provider rewrites the header
  const prepared = buildTicketMail(built);
  if (!message.messageId) await tx.update(supportMessages).set({ messageId: prepared.messageId, inReplyTo: threading.inReplyTo, references: threading.references }).where(eq(supportMessages.id, message.id));
  const result = await sendTicketMail({ ...built, message: { ...built.message, messageId: prepared.messageId } });
  await tx
    .update(supportMessages)
    .set(result.ok ? { deliveryStatus: "sent", deliveryError: null, providerMessageId: result.id ?? null } : { deliveryStatus: "failed", deliveryError: (result.error ?? "send failed").slice(0, 300) })
    .where(eq(supportMessages.id, message.id));
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------------------------------

export const SUPPORT_AUDIT_ACTIONS = {
  create: "support.ticket.create",
  reply: "support.ticket.reply",
  solve: "support.ticket.solve",
  rate: "support.ticket.rate",
} as const;

/** Audit row of a customer-side ticket change: ids, counts and field changes only — never a body or an e-mail. */
export async function auditTicket(tx: DbOrTx, args: { organizationId: string | null; actor: Actor; action: string; ticketId: string; diff: Record<string, unknown>; metadata?: Record<string, unknown>; requestId: string | null }): Promise<string> {
  return recordAudit(tx, { organizationId: args.organizationId, actor: args.actor, action: args.action, targetType: "support_ticket", targetId: args.ticketId, diff: args.diff, metadata: args.metadata, requestId: args.requestId });
}
