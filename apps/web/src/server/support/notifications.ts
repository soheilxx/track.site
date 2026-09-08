import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  supportAgentSettings,
  supportEvents,
  supportMessages,
  supportNotificationSync,
  supportNotifications,
  supportPresence,
  supportTickets,
  user,
  type SupportAuthorKind,
  type SupportEventKind,
  type SupportNotificationKind,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import {
  AGENT_ONLINE_MS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LIST_LIMIT,
  NOTIFICATION_MAIL_KINDS,
  NOTIFICATION_POLL_MS,
  NOTIFICATION_RETENTION_DAYS,
  type NotificationKind,
} from "@/components/ops/shell/notifications/constants";
import { env } from "@/env";
import { logger } from "@/server/db";
import { sendMail, type Mail, type MailResult } from "@/server/mail";
import { getMailCopy, renderMail } from "@/server/mail/templates";
import { formatAddress } from "@/server/support/mail";

/**
 * Agent notifications and presence of the support desk (docs/18 §"Notifications").
 *
 * - **Fan-out on poll.** Notifications are not written by the mutations themselves (assignment, inbound
 *   reply, the SLA engine): `syncNotifications` scans the ticket timeline (`support_events`) and the internal
 *   notes (`support_messages`, `direction = note`) since the singleton cursor and materialises one
 *   `support_notifications` row per recipient — `assignee` → `assignment` for the new assignee, a customer
 *   `reply` → `customer_reply` for the ticket's assignee, `sla_warning` / `sla_breach` for the assignee and
 *   the recipients the engine named, and a `@name` in a note → `mention` for the named operator. The unique
 *   index `(user_id, kind, source_kind, source_id)` makes the scan idempotent; the cursor is taken with
 *   `FOR UPDATE SKIP LOCKED`, so concurrent polls never double-process and never queue up. Every poll of
 *   every agent runs it (the bell polls every `NOTIFICATION_POLL_MS`), and `runNotificationFanOut` is the
 *   hook a mutation can call to deliver at once.
 * - **E-mail** for `assignment` and `customer_reply` only (`NOTIFICATION_MAIL_KINDS`), never to the person
 *   who caused the event, honouring the per-agent preference (`support_agent_settings`, default on). SLA
 *   warnings and breaches are e-mailed by the SLA engine (apps/worker `support-sla`) — the desk shows them in
 *   the bell and does not mail them again; mentions stay in-app. A row is claimed (`mail_status = sent`)
 *   inside the transaction and the mail sent after the commit; a transport failure is recorded on the row
 *   (`failed` + error) and never throws. Mails carry ticket number, subject and the link — no message bodies.
 * - **Presence.** Every poll refreshes `support_agent_settings.last_seen_at`; `listOnlineAgents` unites that
 *   with the ticket-page heartbeats (`support_presence`) within `AGENT_ONLINE_MS` — the one "online" rule of
 *   the desk since the integration pass: round-robin assignment (`auto-assign.ts` `listAgentsOnline`) and the
 *   detail sidebar (`presence.ts` `onlineOperatorIds`) read this union.
 * - **Immediate delivery.** Besides the poll, the mutations that create the notifying rows call
 *   `fanOutAfterMutation` after their commit (assignment, bulk assignment, a composed note or reply, an
 *   inbound customer mail) so an assignment or customer-reply mail does not wait for the next poll.
 * - Payloads and audit diffs carry ids and field values only — never bodies; nothing here is tenant-visible
 *   (all three tables are revoked from `tracksite_app`).
 */

export { AGENT_ONLINE_MS, NOTIFICATION_KINDS, NOTIFICATION_LIST_LIMIT, NOTIFICATION_MAIL_KINDS, NOTIFICATION_POLL_MS, NOTIFICATION_RETENTION_DAYS };
export type { NotificationKind };

/** Events the fan-out reads (everything else on the timeline is a change nobody needs a ping for). */
export const NOTIFYING_EVENT_KINDS: readonly SupportEventKind[] = ["assignee", "reply", "sla_warning", "sla_breach"];
/** Scan overlap: rows committed with a `created_at` slightly behind the cursor (long requests) are still seen. */
export const SYNC_OVERLAP_MS = 10 * 60_000;
/** A fresh cursor looks this far back (the desk is not flooded with weeks of history on the first poll). */
export const SYNC_FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60_000;
export const SYNC_EVENT_BATCH = 500;
export const SYNC_NOTE_BATCH = 200;
/** Mails one poll hands to the transport (the rest waits for the next poll). */
export const MAIL_BATCH_LIMIT = 10;

/**
 * Cursor value after a full batch: the next scan (`cursor - SYNC_OVERLAP_MS`) starts one millisecond before the
 * batch's last row instead of a full overlap window behind it (see the cursor comment in `syncNotifications`).
 */
export function continueFrom(lastCreatedAt: Date): Date {
  return new Date(lastCreatedAt.getTime() + SYNC_OVERLAP_MS - 1);
}

const OPERATOR_ROLES = ["PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// ---------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------

export interface AgentPreferences {
  emailOnAssignment: boolean;
  emailOnCustomerReply: boolean;
}

export const DEFAULT_AGENT_PREFERENCES: AgentPreferences = { emailOnAssignment: true, emailOnCustomerReply: true };

export interface AgentName {
  id: string;
  name: string;
}

/** Ids and field values of the source event; never a body. */
export interface NotificationPayload {
  /** SLA clock the warning / breach concerns */
  clock?: "first_response" | "resolution";
  dueAt?: string;
  /** previous assignee of an assignment */
  from?: string | null;
  /** how a customer reply arrived (`plus_address`, `thread`, `subject`, `dashboard`) */
  via?: string | null;
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  ticket: { id: string; number: number; subject: string; status: SupportTicketStatus };
  /** display name of the agent or customer who caused it (never an e-mail address); null otherwise */
  actor: AgentName | null;
  /** `former` = the actor's account no longer exists; `system` = the SLA engine or inbound mail */
  actorKind: "agent" | "customer" | "system" | "former";
  payload: NotificationPayload;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationFeed {
  unread: number;
  items: NotificationView[];
  preferences: AgentPreferences;
  /** when the feed was read (ISO) */
  at: string;
}

export interface OnlineAgent {
  userId: string;
  name: string;
  lastSeenAt: string;
}

export interface NotificationDraft {
  userId: string;
  kind: NotificationKind;
  payload: NotificationPayload;
}

/** The slice of a timeline event the fan-out needs. */
export interface FanOutEvent {
  id: string;
  ticketId: string;
  kind: SupportEventKind;
  actorKind: SupportAuthorKind;
  actorUserId: string | null;
  payload: Record<string, unknown>;
  /** the ticket's assignee at scan time (the fallback when the event names none) */
  ticketAssigneeUserId: string | null;
}

export interface SyncOutcome {
  /** another poll held the cursor; nothing was scanned */
  skipped: boolean;
  scannedEvents: number;
  scannedNotes: number;
  inserted: number;
  purged: number;
}

/** A claimed notification whose mail is sent after the transaction committed. */
export interface PendingMail {
  id: string;
  kind: NotificationKind;
  ticketId: string;
  number: number;
  subject: string;
  recipient: { id: string; email: string; name: string; locale: string };
  /** display name of the assigning agent; null = automatic assignment */
  actorName: string | null;
  requesterName: string | null;
  requesterEmail: string;
}

// ---------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lower-case spellings a `@mention` of this name may use: the full name and the name without spaces. */
export function mentionPatterns(name: string): string[] {
  const full = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!full) return [];
  const compact = full.replace(/\s+/g, "");
  return compact === full ? [full] : [full, compact];
}

/**
 * Operators mentioned as `@Name` in a note: the full name (case-insensitive, spaces optional) or — when only
 * one operator carries it — the first name. A match needs a word boundary after the name, so `@Ada` never
 * matches `@Adam`. Returns unique ids in order of first appearance.
 */
export function extractMentions(text: string, agents: readonly AgentName[]): string[] {
  if (!text.includes("@") || !agents.length) return [];
  const firstNames = new Map<string, number>();
  for (const agent of agents) {
    const first = agent.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) firstNames.set(first, (firstNames.get(first) ?? 0) + 1);
  }
  const hits: Array<{ id: string; at: number }> = [];
  for (const agent of agents) {
    const patterns = mentionPatterns(agent.name);
    const first = agent.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && firstNames.get(first) === 1 && !patterns.includes(first)) patterns.push(first);
    let best = -1;
    for (const pattern of patterns) {
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])@${escapeRe(pattern)}(?![\\p{L}\\p{N}_])`, "iu");
      const m = re.exec(text);
      if (m && (best < 0 || m.index < best)) best = m.index;
    }
    if (best >= 0) hits.push({ id: agent.id, at: best });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}

const asClock = (v: unknown): NotificationPayload["clock"] | undefined => (v === "first_response" || v === "resolution" ? v : undefined);
const asString = (v: unknown): string | null => (typeof v === "string" && v.length ? v : null);

/**
 * Who gets a notification for a timeline event, and of which kind. Only platform operators are recipients,
 * and never the person who caused the event (a self-assignment or one's own reply is no news).
 */
export function recipientsForEvent(event: FanOutEvent, operators: ReadonlySet<string>): NotificationDraft[] {
  const p = event.payload ?? {};
  const out: NotificationDraft[] = [];
  const push = (userId: unknown, kind: NotificationKind, payload: NotificationPayload) => {
    if (!isUuid(userId) || userId === event.actorUserId || !operators.has(userId)) return;
    if (out.some((d) => d.userId === userId && d.kind === kind)) return;
    out.push({ userId, kind, payload });
  };
  switch (event.kind) {
    case "assignee":
      push(p.to, "assignment", { from: isUuid(p.from) ? p.from : null });
      break;
    case "reply":
      if (event.actorKind !== "customer" || p.auto === true) break;
      push(event.ticketAssigneeUserId, "customer_reply", { via: asString(p.via) ?? (asString(p.direction) === "inbound" ? null : null) });
      break;
    case "sla_warning":
    case "sla_breach": {
      const payload: NotificationPayload = { clock: asClock(p.clock), dueAt: asString(p.due_at) ?? undefined };
      push(isUuid(p.assignee_user_id) ? p.assignee_user_id : event.ticketAssigneeUserId, event.kind, payload);
      if (Array.isArray(p.recipient_user_ids)) for (const id of p.recipient_user_ids) push(id, event.kind, payload);
      break;
    }
    default:
      break;
  }
  return out;
}

/** Origin of the console (`HOST_MARKETING`, no trailing slash) — `/ops` lives on the public host (docs/17 §2). */
export function opsOrigin(): string {
  let host: string | undefined;
  try {
    host = env().HOST_MARKETING;
  } catch {
    // no environment (tests, tooling): the production host
  }
  return (host || "https://www.track.site").replace(/\/+$/, "");
}

export function ticketPath(ticketId: string): string {
  return `/ops/support/${ticketId}`;
}

export function ticketUrl(ticketId: string): string {
  return `${opsOrigin()}${ticketPath(ticketId)}`;
}

/** Builds the agent mail (pure): ticket number, subject, who / which customer, the link — no bodies. */
export function buildNotificationMail(pending: PendingMail): Mail {
  const copy = getMailCopy(pending.recipient.locale);
  const values = { number: String(pending.number), subject: pending.subject.replace(/[\r\n]+/g, " ").trim() || "(no subject)", url: ticketUrl(pending.ticketId) };
  const rendered =
    pending.kind === "assignment"
      ? renderMail(copy.supportAssigned, { ...values, actor: pending.actorName?.trim() || copy.supportAssigned.system })
      : renderMail(copy.supportCustomerReply, { ...values, requester: pending.requesterName?.trim() || pending.requesterEmail });
  return { to: formatAddress(pending.recipient.name, pending.recipient.email), subject: rendered.subject, text: rendered.text, headers: { "X-Track-Ticket": String(pending.number), "Auto-Submitted": "auto-generated" } };
}

const prefFor = (kind: NotificationKind, prefs: AgentPreferences): boolean => (kind === "assignment" ? prefs.emailOnAssignment : kind === "customer_reply" ? prefs.emailOnCustomerReply : false);

// ---------------------------------------------------------------------------------------------------
// Agent settings and presence
// ---------------------------------------------------------------------------------------------------

/** Refreshes the operator's last activity (every poll of the bell). */
export async function touchAgentSeen(tx: Tx, userId: string, now: Date = new Date()): Promise<void> {
  await tx
    .insert(supportAgentSettings)
    .values({ userId, lastSeenAt: now })
    .onConflictDoUpdate({ target: supportAgentSettings.userId, set: { lastSeenAt: now } });
}

export async function loadAgentPreferences(tx: Tx, userId: string): Promise<AgentPreferences> {
  const [row] = await tx.select({ a: supportAgentSettings.emailOnAssignment, r: supportAgentSettings.emailOnCustomerReply }).from(supportAgentSettings).where(eq(supportAgentSettings.userId, userId)).limit(1);
  return row ? { emailOnAssignment: row.a, emailOnCustomerReply: row.r } : { ...DEFAULT_AGENT_PREFERENCES };
}

/** Stores the e-mail preferences; returns before / after for the audit diff. */
export async function saveAgentPreferences(tx: Tx, userId: string, prefs: AgentPreferences, now: Date = new Date()): Promise<{ before: AgentPreferences; after: AgentPreferences }> {
  const before = await loadAgentPreferences(tx, userId);
  await tx
    .insert(supportAgentSettings)
    .values({ userId, lastSeenAt: now, emailOnAssignment: prefs.emailOnAssignment, emailOnCustomerReply: prefs.emailOnCustomerReply })
    .onConflictDoUpdate({ target: supportAgentSettings.userId, set: { emailOnAssignment: prefs.emailOnAssignment, emailOnCustomerReply: prefs.emailOnCustomerReply, updatedAt: now } });
  return { before, after: { ...prefs } };
}

/**
 * Operators the desk saw within `AGENT_ONLINE_MS`: a bell poll (`support_agent_settings.last_seen_at`) or a
 * ticket-page heartbeat (`support_presence`), whichever is newer; most recently seen first. Only accounts
 * that still hold a platform role are listed.
 */
export async function listOnlineAgents(tx: Tx, now: Date = new Date()): Promise<OnlineAgent[]> {
  const since = new Date(now.getTime() - AGENT_ONLINE_MS);
  const seen = new Map<string, number>();
  const bump = (userId: string, at: Date | string) => {
    const t = at instanceof Date ? at.getTime() : Date.parse(at);
    if (Number.isFinite(t) && t > (seen.get(userId) ?? 0)) seen.set(userId, t);
  };
  const polls = await tx.select({ userId: supportAgentSettings.userId, at: supportAgentSettings.lastSeenAt }).from(supportAgentSettings).where(gt(supportAgentSettings.lastSeenAt, since));
  for (const r of polls) bump(r.userId, r.at);
  const beats = await tx
    .select({ userId: supportPresence.userId, at: sql<Date | string>`max(${supportPresence.lastSeenAt})` })
    .from(supportPresence)
    .where(gt(supportPresence.lastSeenAt, since))
    .groupBy(supportPresence.userId);
  for (const r of beats) bump(r.userId, r.at);
  if (!seen.size) return [];
  const rows = await tx
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(inArray(user.id, [...seen.keys()]), inArray(user.platformRole, [...OPERATOR_ROLES])));
  return rows
    .map((r) => ({ userId: r.id, name: r.name, lastSeenAt: new Date(seen.get(r.id)!).toISOString() }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.name.localeCompare(b.name));
}

export async function onlineAgentIds(tx: Tx, now: Date = new Date()): Promise<Set<string>> {
  return new Set((await listOnlineAgents(tx, now)).map((a) => a.userId));
}

// ---------------------------------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------------------------------

async function loadOperators(tx: Tx): Promise<AgentName[]> {
  return tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.platformRole, [...OPERATOR_ROLES]));
}

type DraftRow = typeof supportNotifications.$inferInsert;

async function insertDrafts(tx: Tx, rows: DraftRow[]): Promise<number> {
  if (!rows.length) return 0;
  const inserted = await tx
    .insert(supportNotifications)
    .values(rows)
    .onConflictDoNothing({ target: [supportNotifications.userId, supportNotifications.kind, supportNotifications.sourceKind, supportNotifications.sourceId] })
    .returning({ id: supportNotifications.id });
  return inserted.length;
}

/**
 * Scans the timeline and the notes since the cursor and materialises the notification rows (see the module
 * comment). Idempotent; a poll that finds the cursor locked returns `skipped` instead of waiting.
 */
export async function syncNotifications(tx: Tx, now: Date = new Date()): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { skipped: false, scannedEvents: 0, scannedNotes: 0, inserted: 0, purged: 0 };
  const [exists] = await tx.select({ id: supportNotificationSync.id }).from(supportNotificationSync).where(eq(supportNotificationSync.id, 1)).limit(1);
  if (!exists) await tx.insert(supportNotificationSync).values({ id: 1 }).onConflictDoNothing();
  const [cursor] = await tx.select().from(supportNotificationSync).where(eq(supportNotificationSync.id, 1)).for("update", { skipLocked: true });
  if (!cursor) return { ...outcome, skipped: true };

  const operators = await loadOperators(tx);
  const operatorIds = new Set(operators.map((o) => o.id));
  const firstRun = new Date(now.getTime() - SYNC_FIRST_RUN_LOOKBACK_MS);

  // timeline events
  const eventsSince = cursor.eventsThrough ? new Date(cursor.eventsThrough.getTime() - SYNC_OVERLAP_MS) : firstRun;
  const events = await tx
    .select({
      id: supportEvents.id,
      ticketId: supportEvents.ticketId,
      kind: supportEvents.kind,
      actorKind: supportEvents.actorKind,
      actorUserId: supportEvents.actorUserId,
      payload: supportEvents.payload,
      createdAt: supportEvents.createdAt,
      ticketAssigneeUserId: supportTickets.assigneeUserId,
    })
    .from(supportEvents)
    .innerJoin(supportTickets, eq(supportTickets.id, supportEvents.ticketId))
    .where(and(gt(supportEvents.createdAt, eventsSince), inArray(supportEvents.kind, [...NOTIFYING_EVENT_KINDS])))
    .orderBy(asc(supportEvents.createdAt), asc(supportEvents.id))
    .limit(SYNC_EVENT_BATCH);
  outcome.scannedEvents = events.length;
  const eventRows: DraftRow[] = [];
  for (const e of events) {
    for (const draft of recipientsForEvent({ ...e, payload: e.payload ?? {} }, operatorIds)) {
      eventRows.push({
        userId: draft.userId,
        kind: draft.kind,
        ticketId: e.ticketId,
        sourceKind: "event",
        sourceId: e.id,
        actorUserId: e.actorUserId,
        payload: { ...draft.payload },
        createdAt: e.createdAt,
        mailStatus: NOTIFICATION_MAIL_KINDS.includes(draft.kind) ? "pending" : "none",
      });
    }
  }
  outcome.inserted += await insertDrafts(tx, eventRows);

  // @mentions in internal notes (bodies are read here and nowhere else — never stored again)
  const notesSince = cursor.messagesThrough ? new Date(cursor.messagesThrough.getTime() - SYNC_OVERLAP_MS) : firstRun;
  const notes = await tx
    .select({ id: supportMessages.id, ticketId: supportMessages.ticketId, authorUserId: supportMessages.authorUserId, textBody: supportMessages.textBody, createdAt: supportMessages.createdAt })
    .from(supportMessages)
    .where(and(eq(supportMessages.direction, "note"), gt(supportMessages.createdAt, notesSince)))
    .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id))
    .limit(SYNC_NOTE_BATCH);
  outcome.scannedNotes = notes.length;
  const noteRows: DraftRow[] = [];
  for (const note of notes) {
    for (const userId of extractMentions(note.textBody ?? "", operators)) {
      if (userId === note.authorUserId) continue;
      noteRows.push({ userId, kind: "mention", ticketId: note.ticketId, sourceKind: "message", sourceId: note.id, actorUserId: note.authorUserId, payload: {}, createdAt: note.createdAt, mailStatus: "none" });
    }
  }
  outcome.inserted += await insertDrafts(tx, noteRows);

  // cursor: a full batch continues from its last row next time; otherwise everything up to now is covered.
  // A continuation must not re-apply the overlap (a window holding a full batch would be re-read forever and
  // the scan would never advance): the stored value cancels it out, so the next scan resumes one millisecond
  // before the last row — the rows of that millisecond are re-read and deduplicated by the unique index.
  const eventsThrough = events.length >= SYNC_EVENT_BATCH ? continueFrom(events[events.length - 1]!.createdAt) : now;
  const messagesThrough = notes.length >= SYNC_NOTE_BATCH ? continueFrom(notes[notes.length - 1]!.createdAt) : now;
  await tx.update(supportNotificationSync).set({ eventsThrough, messagesThrough, ranAt: now }).where(eq(supportNotificationSync.id, 1));

  const purged = await tx
    .delete(supportNotifications)
    .where(lt(supportNotifications.createdAt, new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000)))
    .returning({ id: supportNotifications.id });
  outcome.purged = purged.length;
  return outcome;
}

/**
 * Claims pending mails: rows whose recipient wants the e-mail are marked `sent` (optimistically, inside the
 * transaction — a second poll can never claim them again), rows whose preference is off become `skipped`.
 * The caller sends the returned mails after the commit with `deliverNotificationMails`.
 */
export async function claimNotificationMails(tx: Tx, now: Date = new Date(), limit: number = MAIL_BATCH_LIMIT): Promise<PendingMail[]> {
  const actor = alias(user, "actor");
  const rows = await tx
    .select({
      id: supportNotifications.id,
      kind: supportNotifications.kind,
      ticketId: supportNotifications.ticketId,
      number: supportTickets.number,
      subject: supportTickets.subject,
      requesterName: supportTickets.requesterName,
      requesterEmail: supportTickets.requesterEmail,
      recipientId: user.id,
      recipientEmail: user.email,
      recipientName: user.name,
      recipientLocale: user.locale,
      recipientRole: user.platformRole,
      actorName: actor.name,
      emailOnAssignment: supportAgentSettings.emailOnAssignment,
      emailOnCustomerReply: supportAgentSettings.emailOnCustomerReply,
    })
    .from(supportNotifications)
    .innerJoin(supportTickets, eq(supportTickets.id, supportNotifications.ticketId))
    .innerJoin(user, eq(user.id, supportNotifications.userId))
    .leftJoin(actor, eq(actor.id, supportNotifications.actorUserId))
    .leftJoin(supportAgentSettings, eq(supportAgentSettings.userId, supportNotifications.userId))
    .where(eq(supportNotifications.mailStatus, "pending"))
    .orderBy(asc(supportNotifications.createdAt))
    .limit(limit)
    .for("update", { of: supportNotifications, skipLocked: true });
  const out: PendingMail[] = [];
  for (const r of rows) {
    const prefs: AgentPreferences = { emailOnAssignment: r.emailOnAssignment ?? true, emailOnCustomerReply: r.emailOnCustomerReply ?? true };
    const kind = r.kind as NotificationKind;
    const operator = (OPERATOR_ROLES as readonly string[]).includes(r.recipientRole);
    if (!operator || !prefFor(kind, prefs)) {
      await tx.update(supportNotifications).set({ mailStatus: "skipped" }).where(eq(supportNotifications.id, r.id));
      continue;
    }
    await tx.update(supportNotifications).set({ mailStatus: "sent", emailedAt: now, emailError: null }).where(eq(supportNotifications.id, r.id));
    out.push({
      id: r.id,
      kind,
      ticketId: r.ticketId,
      number: Number(r.number),
      subject: r.subject,
      recipient: { id: r.recipientId, email: r.recipientEmail, name: r.recipientName, locale: r.recipientLocale },
      actorName: r.actorName ?? null,
      requesterName: r.requesterName ?? null,
      requesterEmail: r.requesterEmail,
    });
  }
  return out;
}

/** Runs a function inside an operator transaction (the caller binds `withPlatform(ctx, …)`). */
export type RunAsOperator = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/**
 * Sends claimed mails through the shared transport (SMTP → Resend → local outbox); a failure is recorded on
 * the row (`failed`, error text) and logged without recipient or body. Never throws.
 */
export async function deliverNotificationMails(mails: readonly PendingMail[], run: RunAsOperator, send: (mail: Mail) => Promise<MailResult> = sendMail): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    mails.map(async (pending) => {
      const result = await send(buildNotificationMail(pending)).catch((err: unknown): MailResult => ({ ok: false, transport: "none", error: err instanceof Error ? err.message : "send failed" }));
      if (result.ok) {
        sent += 1;
        return;
      }
      failed += 1;
      logger.warn({ notificationId: pending.id, kind: pending.kind, transport: result.transport }, "support notification mail failed");
      await run((tx) => tx.update(supportNotifications).set({ mailStatus: "failed", emailedAt: null, emailError: (result.error ?? "send failed").slice(0, 1000) }).where(eq(supportNotifications.id, pending.id))).catch(() => undefined);
    }),
  );
  return { sent, failed };
}

/**
 * Fan-out plus delivery in one go: sync and claim inside an operator transaction, send after it committed.
 * The bell's poll calls it; a mutation that wants its notification out at once (assignment, inbound reply)
 * can call it as well — the result is the same either way.
 */
export async function runNotificationFanOut(run: RunAsOperator, now: Date = new Date()): Promise<{ sync: SyncOutcome; mails: { sent: number; failed: number } }> {
  const { sync, pending } = await run(async (tx) => {
    const outcome = await syncNotifications(tx, now);
    const claimed = outcome.skipped ? [] : await claimNotificationMails(tx, now);
    return { sync: outcome, pending: claimed };
  });
  const mails = pending.length ? await deliverNotificationMails(pending, run) : { sent: 0, failed: 0 };
  return { sync, mails };
}

/**
 * Fan-out after a mutation committed (assignment, bulk assignment, a note with mentions, an inbound customer
 * reply): the same run as the poll, fenced — a failure is logged and never fails the mutation, the next poll
 * catches up (the sync is idempotent). Returns whether it ran.
 */
export async function fanOutAfterMutation(run: RunAsOperator, now: Date = new Date()): Promise<boolean> {
  try {
    await runNotificationFanOut(run, now);
    return true;
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "support.notifications.fan_out_failed");
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------
// Feed and read markers
// ---------------------------------------------------------------------------------------------------

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** The operator's unread count, the latest items (with ticket and actor names) and their preferences. */
export async function loadNotificationFeed(tx: Tx, userId: string, now: Date = new Date()): Promise<NotificationFeed> {
  const [count] = await tx
    .select({ unread: sql<number>`count(*)::int` })
    .from(supportNotifications)
    .where(and(eq(supportNotifications.userId, userId), isNull(supportNotifications.readAt)));
  const actor = alias(user, "actor");
  const rows = await tx
    .select({
      id: supportNotifications.id,
      kind: supportNotifications.kind,
      actorUserId: supportNotifications.actorUserId,
      payload: supportNotifications.payload,
      createdAt: supportNotifications.createdAt,
      readAt: supportNotifications.readAt,
      ticketId: supportTickets.id,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      actorName: actor.name,
      actorRole: actor.platformRole,
    })
    .from(supportNotifications)
    .innerJoin(supportTickets, eq(supportTickets.id, supportNotifications.ticketId))
    .leftJoin(actor, eq(actor.id, supportNotifications.actorUserId))
    .where(eq(supportNotifications.userId, userId))
    .orderBy(desc(supportNotifications.createdAt), desc(supportNotifications.id))
    .limit(NOTIFICATION_LIST_LIMIT);
  const items: NotificationView[] = rows.map((r) => {
    const kind = r.kind as SupportNotificationKind;
    const payload = (r.payload ?? {}) as NotificationPayload;
    let actorKind: NotificationView["actorKind"] = "system";
    let actorView: AgentName | null = null;
    if (r.actorUserId) {
      if (r.actorName == null) actorKind = "former";
      else {
        actorView = { id: r.actorUserId, name: r.actorName };
        actorKind = kind === "customer_reply" ? "customer" : "agent";
      }
    } else if (kind === "customer_reply") actorKind = "customer";
    return {
      id: r.id,
      kind,
      ticket: { id: r.ticketId, number: Number(r.number), subject: r.subject, status: r.status },
      actor: actorView,
      actorKind,
      payload: { clock: payload.clock, dueAt: payload.dueAt, from: payload.from ?? null, via: payload.via ?? null },
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
    };
  });
  return { unread: Number(count?.unread ?? 0), items, preferences: await loadAgentPreferences(tx, userId), at: now.toISOString() };
}

/** Marks the operator's own notifications read (given ids or all unread); returns how many changed. */
export async function markNotificationsRead(tx: Tx, userId: string, ids: readonly string[] | "all", now: Date = new Date()): Promise<number> {
  const scope = ids === "all" ? and(eq(supportNotifications.userId, userId), isNull(supportNotifications.readAt)) : and(eq(supportNotifications.userId, userId), isNull(supportNotifications.readAt), inArray(supportNotifications.id, [...ids]));
  if (ids !== "all" && ids.length === 0) return 0;
  const rows = await tx.update(supportNotifications).set({ readAt: now }).where(scope).returning({ id: supportNotifications.id });
  return rows.length;
}
