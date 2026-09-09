"use server";

import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PlatformPermission } from "@track-site/core";
import {
  SUPPORT_ATTACHMENT_MAX_PER_MESSAGE,
  SUPPORT_PRESENCE_MODES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  supportAttachments,
  supportMacros,
  supportMessages,
  supportTickets,
  user,
  type SupportMacroActions,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import { COMPOSER_MAX_CHARS, COMPOSER_MIN_CHARS, COMPOSER_STATUSES } from "@/components/ops/support/ticket/constants";
import { markdownToHtml, markdownToText } from "@/components/ops/support/ticket/markdown";
import { logger } from "@/server/db";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { sanitizeHtml, screenAttachments } from "@/server/support/inbound";
import { sendTicketMail, ticketMessageId, ticketSubject } from "@/server/support/mail";
import { fanOutAfterMutation } from "@/server/support/notifications";
import { clearPresence, loadPresence, purgeStalePresence, touchPresence, type PresenceView } from "@/server/support/presence";
import { applyPolicyOnPriorityChange, markFirstResponse, statusTransition, type SlaTicketPatch } from "@/server/support/sla";
import {
  COMPOSE_BLOCKED_STATUSES,
  CONFIRMED_TICKET_TRANSITIONS,
  DELIVERY_CLAIM_STALE_MS,
  canTransitionTicket,
  isPlatformOperator,
  loadMacroForUse,
  loadMailSettings,
  loadSlaPolicy,
  loadTicketByNumber,
  loadTicketRow,
  loadThreading,
  normalizeCategory,
  normalizeTags,
  recordTicketEvent,
  tagDiff,
  type SlaPolicyView,
  type TicketRow,
} from "@/server/support/ticket";

/**
 * Ticket detail mutations (docs/18 §12 "Ticket detail"). Every action resolves the operator with
 * `requirePlatform(role, permission)`, validates its input with zod, runs as `tracksite_ops`, appends the
 * `support_events` timeline rows and writes an `auditPlatform` entry inside the same transaction. Audit
 * diffs carry ids, lengths and field changes — never message bodies, e-mail contents or attachment bytes.
 *
 * Composing has two phases because server actions cannot carry 5 × 5 MB: `composeTicketMessageAction`
 * stores the message (outbound messages as `queued`, notes as `na`), applies the status / macro changes
 * and returns the message id; the page uploads attachments to `/api/support/attachments` and then calls
 * `finalizeTicketMessageAction`, which sends the mail through `support/mail.ts` and records the delivery
 * outcome. Without attachments the compose action sends immediately. Sending claims the message row
 * atomically with a transient `sending` state (`deliverMessage`), so two "send now" clicks or a retried
 * compose never mail the customer twice.
 */

const PATH = "/ops/support";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export type TicketActionError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "unchanged"
  | "invalid_transition"
  | "invalid_state"
  | "confirmation_required"
  | "invalid_assignee"
  | "invalid_macro"
  | "invalid_target"
  | "mail_failed"
  | "generic";

export interface TicketActionResult {
  ok: boolean;
  error: TicketActionError | null;
}

export interface ComposeResult extends TicketActionResult {
  messageId: string | null;
  /** attachments still have to be uploaded and `finalizeTicketMessageAction` called */
  pendingUpload: boolean;
  /** the e-mail was handed to a transport (replies without attachments) */
  sent: boolean;
  transport: string | null;
  fieldErrors?: Record<string, string>;
}

export interface FinalizeResult extends TicketActionResult {
  sent: boolean;
  transport: string | null;
}

export interface PresenceResult extends TicketActionResult {
  others: PresenceView[];
  /** the server's clock at the heartbeat (ISO) — the page measures staleness against it, not its own clock */
  now: string | null;
}

async function contextOr(permission: PlatformPermission): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_SUPPORT", permission);
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

function revalidate(ticketId: string): void {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${ticketId}`);
}

const composeStatus = z.enum(COMPOSER_STATUSES);

const attachmentMeta = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().nonnegative(),
});

const composeSchema = z.object({
  ticketId: uuid,
  mode: z.enum(["reply", "note"]),
  body: z.string().trim().min(COMPOSER_MIN_CHARS).max(COMPOSER_MAX_CHARS),
  status: composeStatus.nullable().optional(),
  macroId: uuid.nullable().optional(),
  applyMacroActions: z.boolean().optional(),
  attachments: z.array(attachmentMeta).max(SUPPORT_ATTACHMENT_MAX_PER_MESSAGE).optional(),
});

export type ComposeInput = z.input<typeof composeSchema>;

interface TicketChange {
  statusFrom: SupportTicketStatus;
  statusTo: SupportTicketStatus;
  reopened: boolean;
  priorityFrom: SupportTicketPriority;
  priorityTo: SupportTicketPriority;
  tagsAdded: string[];
  tagsRemoved: string[];
  assigneeFrom: string | null;
  assigneeTo: string | null;
}

interface WantedChanges {
  status?: SupportTicketStatus | null;
  /** why the status changed without an explicit choice (e.g. `agent_reply`); lands in the `status` event */
  statusReason?: string;
  /** the status change closes a ticket merged into another one (no `resolved_at`) */
  merge?: boolean;
  priority?: SupportTicketPriority | null;
  tags?: string[] | null;
  assigneeUserId?: string | null | undefined;
  extra?: Partial<TicketRow>;
}

/** The engine's closing patch without the resolution stamp and flag — a merged source is closed, not resolved. */
function withoutResolution(patch: SlaTicketPatch): SlaTicketPatch {
  const rest: SlaTicketPatch = { ...patch };
  delete rest.resolvedAt;
  delete rest.breachedResolution;
  return rest;
}

/**
 * Applies a set of field changes to a ticket in one UPDATE and writes one timeline event per changed
 * field. Shared by the composer (status via the split button or a macro, macro actions) and the
 * individual property actions. Returns what changed (for the audit diff) — nothing when nothing changed.
 */
async function applyTicketChanges(tx: Tx, ctx: PlatformContext, row: TicketRow, wanted: WantedChanges, now: Date, policy: SlaPolicyView | null): Promise<TicketChange> {
  const change: TicketChange = {
    statusFrom: row.status,
    statusTo: row.status,
    reopened: false,
    priorityFrom: row.priority,
    priorityTo: row.priority,
    tagsAdded: [],
    tagsRemoved: [],
    assigneeFrom: row.assigneeUserId ?? null,
    assigneeTo: row.assigneeUserId ?? null,
  };
  const set: Partial<TicketRow> = { ...(wanted.extra ?? {}) };
  const events: Array<{ kind: "status" | "priority" | "tags" | "assignee" | "reopened"; payload: Record<string, unknown> }> = [];

  if (wanted.status && wanted.status !== row.status) {
    // the SLA engine's transition (docs/18 §10) with the ticket's own policy — the same call the bulk
    // dialog, the portal and the inbound handler make: business minutes, never the wall clock
    const transition = statusTransition(policy, row, wanted.status, now);
    // a merged source is closed without a resolution — the target answers the request (docs/18 §12 "Merge")
    const patch = wanted.merge ? withoutResolution(transition.patch) : transition.patch;
    Object.assign(set, patch);
    if (transition.reopened) set.reopenCount = (row.reopenCount ?? 0) + 1;
    change.statusTo = wanted.status;
    change.reopened = transition.reopened;
    events.push({ kind: "status", payload: { from: row.status, to: wanted.status, pauseEndedMs: transition.pauseEndedMs, ...(wanted.statusReason ? { reason: wanted.statusReason } : {}) } });
    if (transition.reopened) events.push({ kind: "reopened", payload: { count: (row.reopenCount ?? 0) + 1, resolutionDueAt: patch.resolutionDueAt?.toISOString() ?? null } });
  }
  if (wanted.priority && wanted.priority !== row.priority) {
    // the engine moves every running clock by the target difference (absorbed pauses stay absorbed), from
    // the clocks as they stand after the status change above — a reopen in the same call restarts them
    // first; without a policy there are no due times
    const clocks = { ...row, ...set, priority: row.priority };
    if (policy) Object.assign(set, applyPolicyOnPriorityChange(policy, clocks, wanted.priority, now));
    else {
      if (!clocks.firstRespondedAt) set.firstResponseDueAt = null;
      if (!clocks.resolvedAt) set.resolutionDueAt = null;
    }
    set.priority = wanted.priority;
    change.priorityTo = wanted.priority;
    events.push({ kind: "priority", payload: { from: row.priority, to: wanted.priority } });
  }
  if (wanted.tags) {
    const next = normalizeTags(wanted.tags);
    const diff = tagDiff(row.tags ?? [], next);
    if (diff.added.length || diff.removed.length) {
      set.tags = next;
      change.tagsAdded = diff.added;
      change.tagsRemoved = diff.removed;
      events.push({ kind: "tags", payload: { added: diff.added, removed: diff.removed } });
    }
  }
  if (wanted.assigneeUserId !== undefined && (wanted.assigneeUserId ?? null) !== (row.assigneeUserId ?? null)) {
    set.assigneeUserId = wanted.assigneeUserId ?? null;
    change.assigneeTo = wanted.assigneeUserId ?? null;
    events.push({ kind: "assignee", payload: { from: row.assigneeUserId ?? null, to: wanted.assigneeUserId ?? null, self: wanted.assigneeUserId === ctx.user.id } });
  }
  if (Object.keys(set).length) await tx.update(supportTickets).set({ ...set, updatedAt: now }).where(eq(supportTickets.id, row.id));
  for (const event of events) await recordTicketEvent(tx, { ticketId: row.id, organizationId: row.organizationId, actorKind: "agent", actorUserId: ctx.user.id, kind: event.kind, payload: event.payload }, now);
  return change;
}

const changeDiff = (c: TicketChange): Record<string, unknown> => ({
  ...(c.statusFrom !== c.statusTo ? { statusFrom: c.statusFrom, statusTo: c.statusTo, reopened: c.reopened } : {}),
  ...(c.priorityFrom !== c.priorityTo ? { priorityFrom: c.priorityFrom, priorityTo: c.priorityTo } : {}),
  ...(c.tagsAdded.length || c.tagsRemoved.length ? { tagsAdded: c.tagsAdded, tagsRemoved: c.tagsRemoved } : {}),
  ...(c.assigneeFrom !== c.assigneeTo ? { assigneeFrom: c.assigneeFrom, assigneeTo: c.assigneeTo } : {}),
});

/**
 * Stores a reply or an internal note. Replies: sanitised Markdown → HTML, threading ids, `queued` until
 * sent, first response stamped, unassigned tickets taken over by the author; a status from the split
 * button or the macro is applied through the workflow (pending pauses the SLA clock), and without one the
 * first agent reply moves a `new` ticket to `open` (`status` event with `reason: agent_reply`). An agent
 * reply never reopens a solved or closed ticket by itself — a follow-up on a solved ticket keeps it
 * solved; "Send & mark as open" reopens deliberately and a customer reply reopens on its own. Notes never
 * leave the console and change no status. With attachment metadata the message waits for the uploads
 * (`pendingUpload`).
 */
export async function composeTicketMessageAction(input: ComposeInput): Promise<ComposeResult> {
  const fail = (error: TicketActionError, fieldErrors?: Record<string, string>): ComposeResult => ({ ok: false, error, messageId: null, pendingUpload: false, sent: false, transport: null, ...(fieldErrors ? { fieldErrors } : {}) });
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return fail("forbidden");
  const parsed = composeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = "invalid";
    return fail("invalid", fieldErrors);
  }
  const { ticketId, mode, body, status, macroId, applyMacroActions, attachments } = parsed.data;
  const screening = screenAttachments(attachments ?? []);
  if (screening.rejected.length) return fail("invalid", { attachments: screening.rejected[0]!.reason });
  const now = new Date();

  const stored = await withPlatform(ctx, async (tx): Promise<ComposeResult | { messageId: string; row: TicketRow; sendNow: boolean }> => {
    const row = await loadTicketRow(tx, ticketId);
    if (!row) return fail("not_found");
    if (COMPOSE_BLOCKED_STATUSES.includes(row.status) || row.mergedIntoId) return fail("invalid_state");
    const macro = macroId ? await loadMacroForUse(tx, macroId, ctx.user.id) : null;
    if (macroId && !macro) return fail("invalid_macro");
    const macroActions: SupportMacroActions = macro && applyMacroActions !== false ? (macro.actions ?? {}) : {};
    const outbound = mode === "reply";
    const chosenStatus = status ?? macroActions.status ?? null;
    // the first agent reply takes a new ticket into work unless the operator or the macro chose a status
    const implicitOpen = !chosenStatus && outbound && row.status === "new";
    const wantedStatus = chosenStatus ?? (implicitOpen ? "open" : null);
    if (wantedStatus && wantedStatus !== row.status && !canTransitionTicket(row.status, wantedStatus)) return fail("invalid_transition");
    if (wantedStatus && (CONFIRMED_TICKET_TRANSITIONS as readonly string[]).includes(wantedStatus)) return fail("invalid_transition");

    const settings = await loadMailSettings(tx);
    const policy = await loadSlaPolicy(tx, row.slaPolicyId);
    const html = sanitizeHtml(markdownToHtml(body));
    const text = markdownToText(body);
    const threading = outbound ? await loadThreading(tx, row.id) : { inReplyTo: null, references: [] };
    const [message] = await tx
      .insert(supportMessages)
      .values({
        ticketId: row.id,
        organizationId: row.organizationId,
        direction: outbound ? "outbound" : "note",
        authorKind: "agent",
        authorUserId: ctx.user.id,
        fromEmail: outbound ? settings.fromAddress : null,
        toEmails: outbound ? [row.requesterEmail] : [],
        ccEmails: [],
        subject: outbound ? ticketSubject(row.number, row.subject) : null,
        textBody: text,
        htmlBody: html || null,
        messageId: outbound ? ticketMessageId(row.number, settings) : null,
        inReplyTo: threading.inReplyTo,
        references: threading.references,
        deliveryStatus: outbound ? "queued" : "na",
        macroId: macro?.id ?? null,
        createdAt: now,
      })
      .returning({ id: supportMessages.id });
    const messageId = message!.id;
    const pending = (attachments?.length ?? 0) > 0;

    const extra: Partial<TicketRow> = {};
    let firstResponse = false;
    if (outbound) {
      extra.lastAgentMessageAt = now;
      if (!row.firstRespondedAt) {
        // the engine stops the first-response clock (and flags a late answer) — the same call every reply path makes
        firstResponse = true;
        Object.assign(extra, markFirstResponse(row, now));
      }
    }
    const tags = macroActions.tags_add?.length || macroActions.tags_remove?.length ? [...(row.tags ?? []).filter((t) => !(macroActions.tags_remove ?? []).includes(t)), ...(macroActions.tags_add ?? [])] : null;
    const assignee = outbound && !row.assigneeUserId ? ctx.user.id : macroActions.assign_to_self ? ctx.user.id : undefined;
    const change = await applyTicketChanges(tx, ctx, row, { status: wantedStatus, statusReason: implicitOpen ? "agent_reply" : undefined, priority: macroActions.priority ?? null, tags, assigneeUserId: assignee, extra }, now, policy);
    await recordTicketEvent(tx, { ticketId: row.id, organizationId: row.organizationId, actorKind: "agent", actorUserId: ctx.user.id, kind: outbound ? "reply" : "note", payload: { messageId, attachments: attachments?.length ?? 0, macroId: macro?.id ?? null, firstResponse, pendingUpload: pending } }, now);
    if (macro) await tx.update(supportMacros).set({ usageCount: sql`${supportMacros.usageCount} + 1` }).where(eq(supportMacros.id, macro.id));
    await auditPlatform(
      ctx,
      {
        action: outbound ? "platform.support_ticket.reply" : "platform.support_ticket.note",
        organizationId: row.organizationId,
        targetType: "support_ticket",
        targetId: row.id,
        // never the body: its length, the macro, the attachment count and the field changes are the trail
        diff: { messageId, bodyLength: body.length, attachments: attachments?.length ?? 0, macroId: macro?.id ?? null, firstResponse, ...changeDiff(change) },
        metadata: { module: "support", ticketNumber: row.number, pendingUpload: pending },
      },
      tx,
    );
    return { messageId, row, sendNow: outbound && !pending };
  });
  if ("ok" in stored) return stored;
  revalidate(ticketId);
  // a note may mention a colleague: materialise the notification now instead of on the next bell poll
  await fanOutAfterMutation((fn) => withPlatform(ctx, fn), now);
  if (!stored.sendNow) return { ok: true, error: null, messageId: stored.messageId, pendingUpload: (attachments?.length ?? 0) > 0, sent: false, transport: null };
  const delivery = await deliverMessage(ctx, stored.messageId);
  return { ok: delivery.ok, error: delivery.error, messageId: stored.messageId, pendingUpload: false, sent: delivery.sent, transport: delivery.transport };
}

type MessageRow = typeof supportMessages.$inferSelect;
type Claimed = { error: "not_found" | "invalid_state" | "unchanged" } | { message: MessageRow; ticket: TicketRow };

/**
 * Sends a stored outbound message (queued, or failed for a retry) with its attachments through
 * `sendTicketMail` and records the delivery outcome on the row and in the audit log. The row is **claimed
 * atomically first** (docs/18 §"Hardening"): one `UPDATE … SET delivery_status = 'sending',
 * delivery_claimed_at = now WHERE delivery_status IN ('queued', 'failed') … RETURNING`, committed on its
 * own, so of two clicks — another operator's "send now", a retried compose, a double click — exactly one
 * UPDATE matches; the other finds `sending` (or `sent`) and answers `unchanged`. The transport call runs
 * outside any transaction, then a second transaction records `sent` (+ `provider_message_id`) or `failed`
 * + `delivery_error` and the audit entry. A claim the process never resolved (crash between the two) stays
 * `sending` until `DELIVERY_CLAIM_STALE_MS` (`isMessageSendable`), after which "send again" may claim it;
 * a send that reaches the transport is never repeated within that window. Never throws for a transport
 * failure — the message stays `failed` with its error, visible in the timeline.
 */
async function deliverMessage(ctx: PlatformContext, messageId: string): Promise<FinalizeResult> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - DELIVERY_CLAIM_STALE_MS);
  const claimed = await withPlatform(ctx, async (tx): Promise<Claimed> => {
    const [message] = await tx
      .update(supportMessages)
      .set({ deliveryStatus: "sending", deliveryClaimedAt: now, deliveryError: null })
      .where(
        and(
          eq(supportMessages.id, messageId),
          eq(supportMessages.direction, "outbound"),
          or(
            inArray(supportMessages.deliveryStatus, ["queued", "failed"]),
            // an abandoned claim (the process died between the claim and the outcome) may be taken over
            and(eq(supportMessages.deliveryStatus, "sending"), or(isNull(supportMessages.deliveryClaimedAt), lt(supportMessages.deliveryClaimedAt, staleBefore))),
          ),
        ),
      )
      .returning();
    if (!message) {
      // nothing claimable: gone, not an outbound message, or already sending / sent — a plain read tells which
      const [existing] = await tx.select({ direction: supportMessages.direction, deliveryStatus: supportMessages.deliveryStatus }).from(supportMessages).where(eq(supportMessages.id, messageId)).limit(1);
      if (!existing) return { error: "not_found" };
      return { error: existing.direction !== "outbound" ? "invalid_state" : "unchanged" };
    }
    const ticket = await loadTicketRow(tx, message.ticketId);
    if (!ticket) return { error: "not_found" };
    return { message, ticket };
  });
  if ("error" in claimed) return { ok: false, error: claimed.error, sent: false, transport: null };
  const { message, ticket } = claimed;

  const sent = await withPlatform(ctx, async (tx) => {
    const files = await tx.select().from(supportAttachments).where(eq(supportAttachments.messageId, message.id)).orderBy(supportAttachments.createdAt);
    const settings = await loadMailSettings(tx);
    const [author] = message.authorUserId ? await tx.select({ name: user.name }).from(user).where(eq(user.id, message.authorUserId)).limit(1) : [];
    return { files, settings, agentName: author?.name ?? null };
  });
  const result = await sendTicketMail({
    ticket: { id: ticket.id, number: ticket.number, subject: ticket.subject, requesterEmail: ticket.requesterEmail, requesterName: ticket.requesterName, locale: ticket.locale },
    message: {
      id: message.id,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      ccEmails: message.ccEmails,
      attachments: sent.files.map((f) => ({ filename: f.fileName, content: Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content as unknown as Uint8Array), contentType: f.contentType })),
      kind: "agent",
      agentName: sent.agentName,
    },
    locale: ticket.locale,
    settings: sent.settings,
  });
  if (!result.ok) logger.warn({ ticketId: ticket.id, messageId: message.id, transport: result.transport, err: result.error }, "support ticket reply failed");

  await withPlatform(ctx, async (tx) => {
    // only the claim this call holds is resolved: a provider event that arrived meanwhile (`sent` → `delivered`) is never downgraded
    await tx
      .update(supportMessages)
      .set({
        deliveryStatus: result.ok ? "sent" : "failed",
        deliveryError: result.ok ? null : (result.error ?? "send failed").slice(0, 500),
        deliveryClaimedAt: null,
        providerMessageId: result.ok && result.transport === "resend" ? (result.id ?? null) : message.providerMessageId,
      })
      .where(and(eq(supportMessages.id, message.id), eq(supportMessages.deliveryStatus, "sending")));
    await auditPlatform(
      ctx,
      {
        action: "platform.support_ticket.send",
        organizationId: ticket.organizationId,
        targetType: "support_ticket",
        targetId: ticket.id,
        diff: { messageId: message.id, ok: result.ok, transport: result.transport, error: result.ok ? null : (result.error ?? "send failed").slice(0, 200), attachments: sent.files.length, locale: ticket.locale, claimedAt: now.toISOString() },
        metadata: { module: "support", ticketNumber: ticket.number, mailId: result.ok ? (result.id ?? null) : null },
      },
      tx,
    );
  });
  revalidate(ticket.id);
  return result.ok ? { ok: true, error: null, sent: true, transport: result.transport } : { ok: false, error: "mail_failed", sent: false, transport: result.transport };
}

/** Second phase of the composer (or "send now" on a queued / failed message): sends the mail with the uploaded attachments. */
export async function finalizeTicketMessageAction(input: { messageId: string }): Promise<FinalizeResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return { ok: false, error: "forbidden", sent: false, transport: null };
  const parsed = z.object({ messageId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", sent: false, transport: null };
  const note = await withPlatform(ctx, async (tx) => {
    const [message] = await tx.select({ direction: supportMessages.direction, ticketId: supportMessages.ticketId }).from(supportMessages).where(eq(supportMessages.id, parsed.data.messageId)).limit(1);
    return message ?? null;
  });
  if (!note) return { ok: false, error: "not_found", sent: false, transport: null };
  if (note.direction === "note") {
    revalidate(note.ticketId);
    return { ok: true, error: null, sent: false, transport: null };
  }
  return deliverMessage(ctx, parsed.data.messageId);
}

/** Status transition (`TICKET_TRANSITIONS`); spam and closed need `confirmed: true` (confirmation dialog). */
export async function setTicketStatusAction(input: { ticketId: string; status: SupportTicketStatus; confirmed?: boolean }): Promise<TicketActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid, status: z.enum(SUPPORT_TICKET_STATUSES), confirmed: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { ticketId, status, confirmed } = parsed.data;
  if (CONFIRMED_TICKET_TRANSITIONS.includes(status) && confirmed !== true) return { ok: false, error: "confirmation_required" };
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<TicketActionResult> => {
    const row = await loadTicketRow(tx, ticketId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === status) return { ok: false, error: "unchanged" };
    // a merged ticket stays closed: its request lives on in the target (reopen the target instead)
    if (row.mergedIntoId) return { ok: false, error: "invalid_state" };
    if (!canTransitionTicket(row.status, status)) return { ok: false, error: "invalid_transition" };
    const policy = await loadSlaPolicy(tx, row.slaPolicyId);
    const change = await applyTicketChanges(tx, ctx, row, { status }, now, policy);
    await auditPlatform(
      ctx,
      { action: change.reopened ? "platform.support_ticket.reopen" : "platform.support_ticket.status", organizationId: row.organizationId, targetType: "support_ticket", targetId: row.id, diff: changeDiff(change), metadata: { module: "support", ticketNumber: row.number, confirmed: confirmed === true } },
      tx,
    );
    return { ok: true, error: null };
  });
  if (result.ok) revalidate(ticketId);
  return result;
}

/** Reopen (solved / closed → open); restarts the resolution clock under the policy. */
export async function reopenTicketAction(input: { ticketId: string }): Promise<TicketActionResult> {
  return setTicketStatusAction({ ticketId: input.ticketId, status: "open" });
}

export async function setTicketPriorityAction(input: { ticketId: string; priority: SupportTicketPriority }): Promise<TicketActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid, priority: z.enum(SUPPORT_TICKET_PRIORITIES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<TicketActionResult> => {
    const row = await loadTicketRow(tx, parsed.data.ticketId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.priority === parsed.data.priority) return { ok: false, error: "unchanged" };
    const policy = await loadSlaPolicy(tx, row.slaPolicyId);
    const change = await applyTicketChanges(tx, ctx, row, { priority: parsed.data.priority }, now, policy);
    await auditPlatform(ctx, { action: "platform.support_ticket.priority", organizationId: row.organizationId, targetType: "support_ticket", targetId: row.id, diff: changeDiff(change), metadata: { module: "support", ticketNumber: row.number } }, tx);
    return { ok: true, error: null };
  });
  if (result.ok) revalidate(parsed.data.ticketId);
  return result;
}

export async function setTicketTagsAction(input: { ticketId: string; tags: string[] }): Promise<TicketActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid, tags: z.array(z.string().max(80)).max(50) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<TicketActionResult> => {
    const row = await loadTicketRow(tx, parsed.data.ticketId);
    if (!row) return { ok: false, error: "not_found" };
    const change = await applyTicketChanges(tx, ctx, row, { tags: parsed.data.tags }, now, null);
    if (!change.tagsAdded.length && !change.tagsRemoved.length) return { ok: false, error: "unchanged" };
    await auditPlatform(ctx, { action: "platform.support_ticket.tags", organizationId: row.organizationId, targetType: "support_ticket", targetId: row.id, diff: changeDiff(change), metadata: { module: "support", ticketNumber: row.number } }, tx);
    return { ok: true, error: null };
  });
  if (result.ok) revalidate(parsed.data.ticketId);
  return result;
}

export async function setTicketCategoryAction(input: { ticketId: string; category: string | null }): Promise<TicketActionResult> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid, category: z.string().max(200).nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const category = normalizeCategory(parsed.data.category);
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<TicketActionResult> => {
    const row = await loadTicketRow(tx, parsed.data.ticketId);
    if (!row) return { ok: false, error: "not_found" };
    if ((row.category ?? null) === category) return { ok: false, error: "unchanged" };
    await tx.update(supportTickets).set({ category, updatedAt: now }).where(eq(supportTickets.id, row.id));
    await auditPlatform(ctx, { action: "platform.support_ticket.category", organizationId: row.organizationId, targetType: "support_ticket", targetId: row.id, diff: { from: row.category ?? null, to: category }, metadata: { module: "support", ticketNumber: row.number } }, tx);
    return { ok: true, error: null };
  });
  if (result.ok) revalidate(parsed.data.ticketId);
  return result;
}

/** Assigns the ticket to a platform operator (or clears the assignee); `platform.tickets.assign`. */
export async function assignTicketAction(input: { ticketId: string; assigneeUserId: string | null }): Promise<TicketActionResult> {
  const ctx = await contextOr("platform.tickets.assign");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid, assigneeUserId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { ticketId, assigneeUserId } = parsed.data;
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<TicketActionResult> => {
    const row = await loadTicketRow(tx, ticketId);
    if (!row) return { ok: false, error: "not_found" };
    if ((row.assigneeUserId ?? null) === assigneeUserId) return { ok: false, error: "unchanged" };
    if (assigneeUserId && !(await isPlatformOperator(tx, assigneeUserId))) return { ok: false, error: "invalid_assignee" };
    const change = await applyTicketChanges(tx, ctx, row, { assigneeUserId }, now, null);
    await auditPlatform(ctx, { action: "platform.support_ticket.assign", organizationId: row.organizationId, targetType: "support_ticket", targetId: row.id, diff: { ...changeDiff(change), self: assigneeUserId === ctx.user.id }, metadata: { module: "support", ticketNumber: row.number } }, tx);
    return { ok: true, error: null };
  });
  if (result.ok) {
    revalidate(ticketId);
    // the assignee's notification (and, by preference, their e-mail) goes out now, not on the next poll
    await fanOutAfterMutation((fn) => withPlatform(ctx, fn), now);
  }
  return result;
}

/**
 * Merges this ticket into another one (by number): the source is closed with `merged_into_id` — without a
 * `resolved_at`, the target answers the request, so a merged ticket never counts as resolved — both
 * tickets get a `merged` event and an audit entry; messages stay where they are (the target's timeline
 * links to the source). Requires confirmation; a merged, spam or identical target is refused.
 */
export async function mergeTicketAction(input: { ticketId: string; targetNumber: number; confirmed?: boolean }): Promise<TicketActionResult & { targetId?: string }> {
  const ctx = await contextOr("platform.tickets.write");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid, targetNumber: z.number().int().positive().max(999_999_999_999), confirmed: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.confirmed !== true) return { ok: false, error: "confirmation_required" };
  const now = new Date();
  const result = await withPlatform(ctx, async (tx): Promise<TicketActionResult & { targetId?: string }> => {
    const row = await loadTicketRow(tx, parsed.data.ticketId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.mergedIntoId || row.status === "spam") return { ok: false, error: "invalid_state" };
    const target = await loadTicketByNumber(tx, parsed.data.targetNumber);
    if (!target || target.id === row.id || target.mergedIntoId || target.status === "spam") return { ok: false, error: "invalid_target" };
    // never across tenants: `merged_into` and the `merged` events are customer-visible on both sides (docs/18 §3),
    // so a ticket of organisation A must not point at (or be listed on) a ticket of organisation B; tickets
    // without an organisation may join either side — the same rule as the queue's bulk merge
    if (row.organizationId && target.organizationId && row.organizationId !== target.organizationId) return { ok: false, error: "invalid_target" };
    const policy = await loadSlaPolicy(tx, row.slaPolicyId);
    const closing = row.status === "closed" ? null : "closed";
    const change = await applyTicketChanges(tx, ctx, row, { status: closing, merge: true, statusReason: "merged", extra: { mergedIntoId: target.id } }, now, policy);
    await recordTicketEvent(tx, { ticketId: row.id, organizationId: row.organizationId, actorKind: "agent", actorUserId: ctx.user.id, kind: "merged", payload: { direction: "into", ticketId: target.id, number: target.number, intoNumber: target.number } }, now);
    await recordTicketEvent(tx, { ticketId: target.id, organizationId: target.organizationId, actorKind: "agent", actorUserId: ctx.user.id, kind: "merged", payload: { direction: "from", ticketId: row.id, number: row.number } }, now);
    await tx.update(supportTickets).set({ updatedAt: now }).where(eq(supportTickets.id, target.id));
    const diff = { sourceId: row.id, sourceNumber: row.number, targetId: target.id, targetNumber: target.number, ...changeDiff(change) };
    await auditPlatform(ctx, { action: "platform.support_ticket.merge", organizationId: row.organizationId, targetType: "support_ticket", targetId: row.id, diff, metadata: { module: "support", ticketNumber: row.number, confirmed: true } }, tx);
    await auditPlatform(ctx, { action: "platform.support_ticket.merge_target", organizationId: target.organizationId, targetType: "support_ticket", targetId: target.id, diff, metadata: { module: "support", ticketNumber: target.number } }, tx);
    return { ok: true, error: null, targetId: target.id };
  });
  if (result.ok) {
    revalidate(parsed.data.ticketId);
    if (result.targetId) revalidate(result.targetId);
  }
  return result;
}

/**
 * Presence heartbeat (every 15 s while the page is open): refreshes the caller's row and returns the other
 * operators on the ticket. Not audited — it changes nothing about the ticket and the row is the record.
 */
export async function presenceHeartbeatAction(input: { ticketId: string; mode: "viewing" | "typing" }): Promise<PresenceResult> {
  const ctx = await contextOr("platform.tickets.read");
  if (!ctx) return { ok: false, error: "forbidden", others: [], now: null };
  const parsed = z.object({ ticketId: uuid, mode: z.enum(SUPPORT_PRESENCE_MODES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", others: [], now: null };
  const now = new Date();
  return withPlatform(ctx, async (tx): Promise<PresenceResult> => {
    const row = await loadTicketRow(tx, parsed.data.ticketId);
    if (!row) return { ok: false, error: "not_found", others: [], now: now.toISOString() };
    await touchPresence(tx, row.id, ctx.user.id, parsed.data.mode, now);
    await purgeStalePresence(tx, now);
    return { ok: true, error: null, others: await loadPresence(tx, row.id, ctx.user.id, now), now: now.toISOString() };
  });
}

/** The page leaves the ticket: the presence row disappears immediately instead of after the staleness window. */
export async function presenceLeaveAction(input: { ticketId: string }): Promise<TicketActionResult> {
  const ctx = await contextOr("platform.tickets.read");
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ ticketId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await withPlatform(ctx, (tx) => clearPresence(tx, parsed.data.ticketId, ctx.user.id));
  return { ok: true, error: null };
}
