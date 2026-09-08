import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { usagePeriodKey } from "@track-site/core";
import {
  auditLog,
  contactRequests,
  organization,
  plans,
  subscriptions,
  supportAttachments,
  supportEvents,
  supportMacros,
  supportMessages,
  supportSettings,
  supportSlaPolicies,
  supportTickets,
  usagePeriods,
  user,
  type SupportAuthorKind,
  type SupportDeliveryStatus,
  type SupportEventKind,
  type SupportMacroActions,
  type SupportMacroScope,
  type SupportMessageDirection,
  type SupportSatisfaction,
  type SupportTicketChannel,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SlaEscalation,
  type Tx,
} from "@track-site/db";
import { withPlatform, type PlatformContext } from "@/server/ops/platform";
import { sanitizeHtml } from "@/server/support/inbound";
import { supportMailSettings, type SupportMailSettings } from "@/server/support/mail";
import { loadPresence, onlineOperatorIds, type PresenceView } from "@/server/support/presence";
import { slaClockState, type SlaClock, type SlaClockStateInput, type SlaClockStatus, type SlaPolicyLike } from "@/server/support/sla";

/**
 * Ticket detail of the support desk (docs/18 §"Ticket detail"): pure workflow helpers (status transitions,
 * SLA clock, business hours, tags) and the loaders of `/ops/support/[id]`. Every loader runs as
 * `tracksite_ops` through `withPlatform(ctx, …)`; mutations live in `server/ops/actions/support-ticket.ts`.
 *
 * SLA semantics (docs/18 §3, §10 and §12): the engine in ./sla owns the clocks. Every status change, pause,
 * resume, reopen and priority change on the ticket page goes through `statusTransition` /
 * `applyPolicyOnPriorityChange` with the ticket's own policy (business minutes, never the wall clock), and
 * the panel's states come from `slaClockState`, so the detail, the queue's bulk actions, the portal, the
 * inbound handler and the worker agree on one model. A ticket without policy has no due times and says so.
 * Nothing here estimates.
 */

// strict 8-4-4-4-12 form (Postgres rejects other 36-character layouts, and a bad link must never 500)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export const RECENT_TICKETS_LIMIT = 5;
export const RECENT_AUDIT_LIMIT = 5;
export const TAG_MAX_COUNT = 20;
export const TAG_MAX_LENGTH = 40;
export const CATEGORY_MAX_LENGTH = 60;
/** Attachments may be added to a note this long after it was written (the composer's upload phase). */
export const NOTE_ATTACH_WINDOW_MS = 15 * 60_000;

// ---------------------------------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------------------------------

/** Allowed status transitions; closed and solved tickets come back through `open` (a reopen). */
export const TICKET_TRANSITIONS: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  new: ["open", "pending", "on_hold", "solved", "spam"],
  open: ["pending", "on_hold", "solved", "spam"],
  pending: ["open", "on_hold", "solved", "spam"],
  on_hold: ["open", "pending", "solved", "spam"],
  solved: ["open", "closed"],
  closed: ["open"],
  spam: ["open"],
};

/** Transitions that hide the ticket from the queue or end it and therefore need an explicit confirmation. */
export const CONFIRMED_TICKET_TRANSITIONS: readonly SupportTicketStatus[] = ["spam", "closed"];

/** Statuses in which no reply or note can be written (reopen or restore first). */
export const COMPOSE_BLOCKED_STATUSES: readonly SupportTicketStatus[] = ["spam"];

const ENDED: readonly SupportTicketStatus[] = ["solved", "closed"];

export function canTransitionTicket(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

/** A reopen: leaving `solved` / `closed` for a working status. */
export function isReopen(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return ENDED.includes(from) && !ENDED.includes(to) && to !== "spam";
}

export function isTicketStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === "string" && value in TICKET_TRANSITIONS;
}

/** Human-facing reference (`#1234`). */
export function ticketRef(number: number): string {
  return `#${number}`;
}

// ---------------------------------------------------------------------------------------------------
// Tags and categories
// ---------------------------------------------------------------------------------------------------

/** Lower-case slugs (`a-z0-9._-`), whitespace → `-`, ≤ 40 characters, deduplicated, at most 20. */
export function normalizeTags(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const tag = raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, TAG_MAX_LENGTH);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= TAG_MAX_COUNT) break;
  }
  return out;
}

/** Free text (commas, spaces or newlines between tags) → tag list. */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,\n]+/));
}

export function tagDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  return { added: after.filter((t) => !before.includes(t)), removed: before.filter((t) => !after.includes(t)) };
}

export function normalizeCategory(value: string | null | undefined): string | null {
  const clean = (value ?? "").replace(/\s+/g, " ").trim().slice(0, CATEGORY_MAX_LENGTH);
  return clean.length ? clean : null;
}

// ---------------------------------------------------------------------------------------------------
// SLA view (the clocks themselves live in the engine, ./sla)
// ---------------------------------------------------------------------------------------------------

/** The policy columns the detail reads — the engine's `SlaPolicyLike` plus the name for the panel. */
export interface SlaPolicyView extends SlaPolicyLike {
  id: string;
  name: string;
  escalation: SlaEscalation | null;
}

export type SlaClockState = "none" | "met" | "late" | "paused" | "breached" | "warning" | "on_track";

export interface SlaClockView {
  dueAt: string | null;
  completedAt: string | null;
  state: SlaClockState;
  /** milliseconds until the due time (negative when past); frozen while paused; null without a due time */
  remainingMs: number | null;
  /** the stored breach flag (set by the SLA worker or the first response) */
  breachedFlag: boolean;
}

export interface SlaView {
  policy: { id: string; name: string } | null;
  paused: boolean;
  pausedSince: string | null;
  pauseTotalMs: number;
  /** when the resolution clock was restarted by the last reopening; null for a ticket never reopened */
  resolutionRestartedAt: string | null;
  firstResponse: SlaClockView;
  resolution: SlaClockView;
}

/** What the panel reads: the engine's clock input plus the pause total, the closing and the merge link. */
type SlaTicketFields = SlaClockStateInput & {
  pauseTotalMs: number;
  closedAt: Date | null;
  mergedIntoId: string | null;
};

export type ClockEvent = { kind: SupportEventKind; createdAt: Date };

/** When the resolution clock was last restarted — the latest `reopened` event of the timeline; null for a ticket never reopened. */
export function resolutionRestartedAt(events: readonly ClockEvent[]): Date | null {
  let restartedAt: Date | null = null;
  for (const e of events) if (e.kind === "reopened" && (!restartedAt || e.createdAt.getTime() > restartedAt.getTime())) restartedAt = e.createdAt;
  return restartedAt;
}

/** The engine's clock status in the panel's vocabulary (`due_soon` = the panel's "warning"). */
const VIEW_STATE: Record<SlaClockStatus, SlaClockState> = { none: "none", met: "met", paused: "paused", breached: "breached", due_soon: "warning", running: "on_track" };

/** One clock of the panel from the engine's `slaClockState`; the remaining time is frozen at `paused_at` while pending. */
function clock(ticket: SlaClockStateInput, which: SlaClock, now: Date, policy: SlaPolicyView | null): SlaClockView {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const state = slaClockState(ticket, which, now, policy);
  const breachedFlag = which === "first_response" ? ticket.breachedFirstResponse : ticket.breachedResolution;
  const dueAt = state.dueAt;
  if (!dueAt) return { dueAt: null, completedAt: iso(state.stoppedAt), state: "none", remainingMs: null, breachedFlag };
  if (state.stoppedAt) return { dueAt: iso(dueAt), completedAt: iso(state.stoppedAt), state: state.status === "met" ? "met" : "late", remainingMs: dueAt.getTime() - state.stoppedAt.getTime(), breachedFlag };
  const reference = ticket.pausedAt ?? now;
  return { dueAt: iso(dueAt), completedAt: null, state: VIEW_STATE[state.status], remainingMs: dueAt.getTime() - reference.getTime(), breachedFlag };
}

/**
 * The SLA panel: both clocks from the ticket's real timestamps through the engine's `slaClockState`, so the
 * panel's `warning` is exactly the worker's `due_soon` (the remaining business minutes at or under the
 * policy's unwarned share of the target — never a window derived from the ticket's lifetime) and the two
 * never disagree; "none" whenever nothing is measured. A merged ticket's resolution clock ends at its
 * closing — the target answers the request, so nothing is stamped as resolved. `restartedAt` (the last
 * reopening, from the timeline) is shown in the panel, never measured against.
 */
export function slaView(ticket: SlaTicketFields, policy: SlaPolicyView | null, now: Date, restartedAt: Date | null = null): SlaView {
  const resolutionEnd = ticket.resolvedAt ?? (ticket.mergedIntoId ? ticket.closedAt : null);
  return {
    policy: policy ? { id: policy.id, name: policy.name } : null,
    paused: Boolean(ticket.pausedAt),
    pausedSince: ticket.pausedAt ? ticket.pausedAt.toISOString() : null,
    pauseTotalMs: ticket.pauseTotalMs,
    resolutionRestartedAt: restartedAt ? restartedAt.toISOString() : null,
    firstResponse: clock(ticket, "first_response", now, policy),
    resolution: clock({ ...ticket, resolvedAt: resolutionEnd }, "resolution", now, policy),
  };
}

export type TicketRow = typeof supportTickets.$inferSelect;

// ---------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------

export interface NamedUser {
  id: string;
  name: string;
}

export interface TicketView {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  channel: SupportTicketChannel;
  category: string | null;
  tags: string[];
  requesterEmail: string;
  requesterName: string | null;
  requesterUserId: string | null;
  organizationId: string | null;
  assignee: NamedUser | null;
  locale: string;
  createdAt: string;
  updatedAt: string;
  lastCustomerMessageAt: string | null;
  lastAgentMessageAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenCount: number;
  mergedInto: { id: string; number: number; subject: string } | null;
  mergedFrom: Array<{ id: string; number: number; subject: string }>;
  satisfaction: SupportSatisfaction | null;
  /** the public-form request this ticket was converted from (Inbox module) */
  contactRequestId: string | null;
}

export interface AttachmentView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  /** the scanner hook is a placeholder (docs/18 §4): the console says so instead of claiming a scan */
  scanned: false;
}

export interface MessageView {
  id: string;
  direction: SupportMessageDirection;
  authorKind: SupportAuthorKind;
  /** platform user for agent messages; null for customers and the system */
  author: NamedUser | null;
  fromEmail: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  textBody: string;
  /** sanitised HTML (re-sanitised on load, defence in depth) or null when the message is plain text only */
  htmlBody: string | null;
  deliveryStatus: SupportDeliveryStatus;
  deliveryError: string | null;
  macroId: string | null;
  createdAt: string;
  attachments: AttachmentView[];
}

export interface EventView {
  id: string;
  kind: SupportEventKind;
  actorKind: SupportAuthorKind;
  actor: NamedUser | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type TimelineItem = { type: "message"; at: string; message: MessageView } | { type: "event"; at: string; event: EventView };

export interface OperatorView extends NamedUser {
  online: boolean;
  self: boolean;
}

export interface MacroView {
  id: string;
  name: string;
  category: string | null;
  scope: SupportMacroScope;
  bodyText: string;
  actions: SupportMacroActions;
}

export interface RequesterView {
  email: string;
  name: string | null;
  userId: string | null;
  locale: string;
  organization: { id: string; name: string; slug: string; suspendedAt: string | null } | null;
  plan: { id: string; name: string } | null;
  /** `subscriptions.status`, or `none` without a row */
  subscriptionStatus: string;
  usage: { periodKey: string; billable: number; limit: number | null } | null;
  recentTickets: Array<{ id: string; number: number; subject: string; status: SupportTicketStatus; updatedAt: string }>;
  /**
   * the organisation's latest audit entries for an admin; a support agent's `platform.audit.read` covers
   * their own actions only (docs/18 §2), so `own` lists the caller's entries on this organisation
   */
  recentAuditScope: "organisation" | "own";
  recentAudit: Array<{ id: string; action: string; actorKind: string; createdAt: string }>;
}

export interface TicketDetail {
  ticket: TicketView;
  timeline: TimelineItem[];
  sla: SlaView;
  presence: PresenceView[];
  operators: OperatorView[];
  macros: MacroView[];
  requester: RequesterView;
  /** effective mail settings (sender shown in the composer; never secrets) */
  mail: Pick<SupportMailSettings, "fromName" | "fromAddress" | "inboundDomain">;
  generatedAt: string;
}

// ---------------------------------------------------------------------------------------------------
// Loaders (tracksite_ops)
// ---------------------------------------------------------------------------------------------------

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const PLATFORM_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;

/** The stored ticket row for actions; null for an unknown or malformed id. */
export async function loadTicketRow(tx: Tx, ticketId: string): Promise<TicketRow | null> {
  if (!isUuid(ticketId)) return null;
  const [row] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  return row ?? null;
}

/** Ticket by its human-facing number (merge target lookup). */
export async function loadTicketByNumber(tx: Tx, number: number): Promise<TicketRow | null> {
  if (!Number.isInteger(number) || number <= 0) return null;
  const [row] = await tx.select().from(supportTickets).where(eq(supportTickets.number, number)).limit(1);
  return row ?? null;
}

export async function loadSlaPolicy(tx: Tx, policyId: string | null): Promise<SlaPolicyView | null> {
  if (!policyId) return null;
  const [row] = await tx.select().from(supportSlaPolicies).where(eq(supportSlaPolicies.id, policyId)).limit(1);
  if (!row) return null;
  return { id: row.id, name: row.name, priorities: row.priorities ?? {}, businessHours: row.businessHours, escalation: row.escalation ?? null };
}

/** The stored settings row merged with the environment overrides and defaults. */
export async function loadMailSettings(tx: Tx): Promise<SupportMailSettings> {
  const [row] = await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
  return supportMailSettings(row ? { inboundDomain: row.inboundDomain, fromName: row.fromName, fromAddress: row.fromAddress, signatureText: row.signatureText } : null);
}

/** A macro the operator may use: global, or personal and their own. */
export async function loadMacroForUse(tx: Tx, macroId: string, userId: string): Promise<MacroView | null> {
  if (!isUuid(macroId)) return null;
  const [row] = await tx
    .select()
    .from(supportMacros)
    .where(and(eq(supportMacros.id, macroId), or(eq(supportMacros.scope, "global"), and(eq(supportMacros.scope, "personal"), eq(supportMacros.ownerUserId, userId)))))
    .limit(1);
  return row ? { id: row.id, name: row.name, category: row.category, scope: row.scope, bodyText: row.bodyText, actions: row.actions ?? {} } : null;
}

/** Platform users who may hold a ticket; used by the assign action to validate an assignee. */
export async function isPlatformOperator(tx: Tx, userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const [row] = await tx.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(row && (PLATFORM_ROLES as readonly string[]).includes(row.platformRole));
}

export interface TicketEventInput {
  ticketId: string;
  organizationId: string | null;
  actorKind: SupportAuthorKind;
  actorUserId: string | null;
  kind: SupportEventKind;
  /** ids and field changes only — never bodies */
  payload?: Record<string, unknown>;
}

/** Appends a timeline event. */
export async function recordTicketEvent(tx: Tx, input: TicketEventInput, at: Date = new Date()): Promise<string> {
  const [row] = await tx
    .insert(supportEvents)
    .values({ ticketId: input.ticketId, organizationId: input.organizationId, actorKind: input.actorKind, actorUserId: input.actorUserId, kind: input.kind, payload: input.payload ?? {}, createdAt: at })
    .returning({ id: supportEvents.id });
  return row!.id;
}

/** Thread ids of a ticket for the next outbound mail: the customer's last message id and the chain so far. */
export async function loadThreading(tx: Tx, ticketId: string): Promise<{ inReplyTo: string | null; references: string[] }> {
  const rows = await tx
    .select({ direction: supportMessages.direction, messageId: supportMessages.messageId })
    .from(supportMessages)
    .where(and(eq(supportMessages.ticketId, ticketId), ne(supportMessages.direction, "note")))
    .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
  const ids = rows.map((r) => r.messageId).filter((id): id is string => Boolean(id));
  const lastInbound = [...rows].reverse().find((r) => r.direction === "inbound" && r.messageId)?.messageId ?? null;
  return { inReplyTo: lastInbound, references: ids.slice(-20) };
}

export type MessageRow = typeof supportMessages.$inferSelect;

export async function loadMessageRow(tx: Tx, messageId: string): Promise<MessageRow | null> {
  if (!isUuid(messageId)) return null;
  const [row] = await tx.select().from(supportMessages).where(eq(supportMessages.id, messageId)).limit(1);
  return row ?? null;
}

export type AttachableRefusal = "not_found" | "not_author" | "not_attachable" | "too_many";

/**
 * Whether `userId` may still add attachments to a message: their own outbound message that is still
 * `queued` (the composer's upload phase) or their own note written within `NOTE_ATTACH_WINDOW_MS`,
 * and fewer than the per-message maximum so far.
 */
export async function assertMessageAttachable(tx: Tx, messageId: string, userId: string, now: Date, max: number): Promise<{ ok: true; message: MessageRow; count: number } | { ok: false; reason: AttachableRefusal }> {
  const message = await loadMessageRow(tx, messageId);
  if (!message) return { ok: false, reason: "not_found" };
  if (message.authorUserId !== userId) return { ok: false, reason: "not_author" };
  const attachable = (message.direction === "outbound" && message.deliveryStatus === "queued") || (message.direction === "note" && now.getTime() - message.createdAt.getTime() <= NOTE_ATTACH_WINDOW_MS);
  if (!attachable) return { ok: false, reason: "not_attachable" };
  const [countRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(supportAttachments).where(eq(supportAttachments.messageId, messageId));
  const count = Number(countRow?.n ?? 0);
  if (count >= max) return { ok: false, reason: "too_many" };
  return { ok: true, message, count };
}

export interface AttachmentDownload {
  id: string;
  messageId: string;
  ticketId: string;
  ticketNumber: number;
  organizationId: string | null;
  direction: SupportMessageDirection;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
}

/** One attachment with its bytes for the download route (which re-checks the permission before serving it). */
export async function loadAttachmentForDownload(ctx: PlatformContext, attachmentId: string): Promise<AttachmentDownload | null> {
  if (!isUuid(attachmentId)) return null;
  return withPlatform(ctx, async (tx) => {
    const [row] = await tx
      .select({
        id: supportAttachments.id,
        messageId: supportAttachments.messageId,
        ticketId: supportAttachments.ticketId,
        organizationId: supportAttachments.organizationId,
        fileName: supportAttachments.fileName,
        contentType: supportAttachments.contentType,
        sizeBytes: supportAttachments.sizeBytes,
        content: supportAttachments.content,
        direction: supportMessages.direction,
        ticketNumber: supportTickets.number,
      })
      .from(supportAttachments)
      .innerJoin(supportMessages, eq(supportMessages.id, supportAttachments.messageId))
      .innerJoin(supportTickets, eq(supportTickets.id, supportAttachments.ticketId))
      .where(eq(supportAttachments.id, attachmentId))
      .limit(1);
    if (!row) return null;
    return { ...row, content: Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content as unknown as Uint8Array) };
  });
}

/** Names of platform users and requesters referenced by a ticket, in one query. */
async function loadNames(tx: Tx, ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id && isUuid(id))))];
  if (!unique.length) return new Map();
  const rows = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Everything the ticket page shows: the ticket, the conversation merged with the timeline events, the
 * SLA clocks (the resolution clock's base derived from the events), who else is on the ticket, the
 * operators (with online dots), usable macros and the requester sidebar (organisation, plan, subscription,
 * current usage, recent tickets, recent audit entries — metadata only, scoped to the caller's own actions
 * for a support agent). Null for an unknown id.
 */
export async function loadTicketDetail(ctx: PlatformContext, ticketId: string, now: Date = new Date()): Promise<TicketDetail | null> {
  if (!isUuid(ticketId)) return null;
  return withPlatform(ctx, async (tx): Promise<TicketDetail | null> => {
    const row = await loadTicketRow(tx, ticketId);
    if (!row) return null;

    const messages = await tx.select().from(supportMessages).where(eq(supportMessages.ticketId, row.id)).orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
    const messageIds = messages.map((m) => m.id);
    const attachmentRows = messageIds.length
      ? await tx
          .select({ id: supportAttachments.id, messageId: supportAttachments.messageId, fileName: supportAttachments.fileName, contentType: supportAttachments.contentType, sizeBytes: supportAttachments.sizeBytes, sha256: supportAttachments.sha256, createdAt: supportAttachments.createdAt })
          .from(supportAttachments)
          .where(inArray(supportAttachments.messageId, messageIds))
          .orderBy(asc(supportAttachments.createdAt))
      : [];
    const events = await tx.select().from(supportEvents).where(eq(supportEvents.ticketId, row.id)).orderBy(asc(supportEvents.createdAt), asc(supportEvents.id));
    const policy = await loadSlaPolicy(tx, row.slaPolicyId);
    const mergedInto = row.mergedIntoId ? ((await tx.select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject }).from(supportTickets).where(eq(supportTickets.id, row.mergedIntoId)).limit(1))[0] ?? null) : null;
    const mergedFrom = await tx.select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject }).from(supportTickets).where(eq(supportTickets.mergedIntoId, row.id)).orderBy(asc(supportTickets.number));
    const [contact] = await tx.select({ id: contactRequests.id }).from(contactRequests).where(eq(contactRequests.ticketId, row.id)).limit(1);
    const operatorRows = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.platformRole, [...PLATFORM_ROLES])).orderBy(asc(user.name), asc(user.email));
    const online = await onlineOperatorIds(tx, now);
    const presence = await loadPresence(tx, row.id, ctx.user.id, now);
    const macroRows = await tx
      .select()
      .from(supportMacros)
      .where(or(eq(supportMacros.scope, "global"), and(eq(supportMacros.scope, "personal"), eq(supportMacros.ownerUserId, ctx.user.id))))
      .orderBy(asc(supportMacros.scope), asc(supportMacros.name));
    const mail = await loadMailSettings(tx);

    // requester sidebar
    const orgRow = row.organizationId
      ? ((
          await tx
            .select({ id: organization.id, name: organization.name, slug: organization.slug, suspendedAt: organization.suspendedAt, planId: subscriptions.planId, subStatus: subscriptions.status, planName: plans.name, planLimits: plans.limits })
            .from(organization)
            .leftJoin(subscriptions, eq(subscriptions.organizationId, organization.id))
            .leftJoin(plans, eq(plans.id, subscriptions.planId))
            .where(eq(organization.id, row.organizationId))
            .limit(1)
        )[0] ?? null)
      : null;
    const periodKey = usagePeriodKey(now);
    const usageRow = orgRow ? ((await tx.select({ billable: usagePeriods.billableEvents, limit: usagePeriods.limitEvents }).from(usagePeriods).where(and(eq(usagePeriods.organizationId, orgRow.id), eq(usagePeriods.periodKey, periodKey))).limit(1))[0] ?? null) : null;
    const relatedWhere = orgRow ? or(eq(supportTickets.organizationId, orgRow.id), eq(supportTickets.requesterEmail, row.requesterEmail)) : eq(supportTickets.requesterEmail, row.requesterEmail);
    const recentTickets = await tx
      .select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject, status: supportTickets.status, updatedAt: supportTickets.updatedAt })
      .from(supportTickets)
      .where(and(ne(supportTickets.id, row.id), relatedWhere))
      .orderBy(desc(supportTickets.updatedAt))
      .limit(RECENT_TICKETS_LIMIT);
    // an admin sees the organisation's trail; a support agent's audit permission covers their own actions only
    const recentAuditScope: RequesterView["recentAuditScope"] = ctx.platformRole === "PLATFORM_ADMIN" ? "organisation" : "own";
    const recentAudit = orgRow
      ? await tx
          .select({ id: auditLog.id, action: auditLog.action, actorKind: sql<string | null>`${auditLog.actor}->>'kind'`, createdAt: auditLog.createdAt })
          .from(auditLog)
          .where(recentAuditScope === "own" ? and(eq(auditLog.organizationId, orgRow.id), sql`${auditLog.actor}->>'userId' = ${ctx.user.id}`) : eq(auditLog.organizationId, orgRow.id))
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(RECENT_AUDIT_LIMIT)
      : [];

    const names = await loadNames(tx, [row.assigneeUserId, ...messages.map((m) => m.authorUserId), ...events.map((e) => e.actorUserId)]);
    const named = (id: string | null): NamedUser | null => (id && names.has(id) ? { id, name: names.get(id)! } : null);
    const attachmentsBy = new Map<string, AttachmentView[]>();
    for (const a of attachmentRows) {
      const list = attachmentsBy.get(a.messageId) ?? [];
      list.push({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes, sha256: a.sha256, createdAt: a.createdAt.toISOString(), scanned: false });
      attachmentsBy.set(a.messageId, list);
    }
    const timeline: TimelineItem[] = [
      ...messages.map((m): TimelineItem => ({
        type: "message",
        at: m.createdAt.toISOString(),
        message: {
          id: m.id,
          direction: m.direction,
          authorKind: m.authorKind,
          author: m.authorKind === "agent" ? named(m.authorUserId) : null,
          fromEmail: m.fromEmail,
          toEmails: m.toEmails,
          ccEmails: m.ccEmails,
          subject: m.subject,
          textBody: m.textBody,
          htmlBody: m.htmlBody ? sanitizeHtml(m.htmlBody) : null,
          deliveryStatus: m.deliveryStatus,
          deliveryError: m.deliveryError,
          macroId: m.macroId,
          createdAt: m.createdAt.toISOString(),
          attachments: attachmentsBy.get(m.id) ?? [],
        },
      })),
      ...events.map((e): TimelineItem => ({ type: "event", at: e.createdAt.toISOString(), event: { id: e.id, kind: e.kind, actorKind: e.actorKind, actor: named(e.actorUserId), payload: e.payload ?? {}, createdAt: e.createdAt.toISOString() } })),
    ].sort((a, b) => a.at.localeCompare(b.at) || (a.type === b.type ? 0 : a.type === "event" ? -1 : 1));

    return {
      ticket: {
        id: row.id,
        number: row.number,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        channel: row.channel,
        category: row.category,
        tags: row.tags ?? [],
        requesterEmail: row.requesterEmail,
        requesterName: row.requesterName,
        requesterUserId: row.requesterUserId,
        organizationId: row.organizationId,
        assignee: named(row.assigneeUserId),
        locale: row.locale,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastCustomerMessageAt: iso(row.lastCustomerMessageAt),
        lastAgentMessageAt: iso(row.lastAgentMessageAt),
        firstRespondedAt: iso(row.firstRespondedAt),
        resolvedAt: iso(row.resolvedAt),
        closedAt: iso(row.closedAt),
        reopenCount: row.reopenCount,
        mergedInto,
        mergedFrom,
        satisfaction: row.satisfaction ?? null,
        contactRequestId: contact?.id ?? null,
      },
      timeline,
      sla: slaView(row, policy, now, resolutionRestartedAt(events)),
      presence,
      operators: operatorRows.map((o) => ({ id: o.id, name: o.name, online: online.has(o.id), self: o.id === ctx.user.id })),
      macros: macroRows.map((m) => ({ id: m.id, name: m.name, category: m.category, scope: m.scope, bodyText: m.bodyText, actions: m.actions ?? {} })),
      requester: {
        email: row.requesterEmail,
        name: row.requesterName,
        userId: row.requesterUserId,
        locale: row.locale,
        organization: orgRow ? { id: orgRow.id, name: orgRow.name, slug: orgRow.slug, suspendedAt: iso(orgRow.suspendedAt) } : null,
        plan: orgRow?.planId ? { id: orgRow.planId, name: orgRow.planName ?? orgRow.planId } : null,
        subscriptionStatus: orgRow?.subStatus ?? "none",
        usage: usageRow ? { periodKey, billable: Number(usageRow.billable ?? 0), limit: usageRow.limit ?? orgRow?.planLimits?.eventsPerMonth ?? null } : null,
        recentTickets: recentTickets.map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, updatedAt: t.updatedAt.toISOString() })),
        recentAuditScope,
        recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, actorKind: a.actorKind ?? "unknown", createdAt: a.createdAt.toISOString() })),
      },
      mail: { fromName: mail.fromName, fromAddress: mail.fromAddress, inboundDomain: mail.inboundDomain },
      generatedAt: now.toISOString(),
    };
  });
}
