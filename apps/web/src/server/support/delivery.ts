import "server-only";
import { and, eq, not, sql } from "drizzle-orm";
import { recordAudit, supportEvents, supportMessages, supportTickets, withWorker, type Db, type SupportDeliveryStatus, type Tx } from "@track-site/db";
import { env } from "@/env";
import { db, logger } from "@/server/db";
import { deliveryStatusForEvent, nextDeliveryStatus, type DeliveryEvent } from "./inbound";
import { DO_NOT_EMAIL_TAG, createDrizzleInboundLedger, type DeliveryPatch, type InboundLedger, type InboundLog } from "./inbound-handler";

/**
 * Outbound delivery status of ticket mails (docs/18-support-desk.md §4 "Delivery events", task T3). Resend
 * posts `email.sent` / `delivered` / `delivery_delayed` / `bounced` / `complained` / `failed` / `suppressed`
 * for every mail sent through the API; the handler matches the event's `email_id` against
 * `support_messages.provider_message_id` (the id the transport returned when the mail was sent) and moves
 * `delivery_status` forward (`nextDeliveryStatus`, never backwards). Events for mails that are no ticket mail
 * (password resets, invitations) are acknowledged and recorded as `ignored`.
 *
 * A complaint (the recipient marked the mail as spam) tags every ticket of that requester `do-not-email`:
 * the inbound handler then never auto-acknowledges them again and the console shows the tag on the ticket.
 * The flag is recorded as a `tags` event (actor `system`) and an `audit_log` row with actor kind `system`
 * (ids and the tag only — never the mail). It is the honest stand-in for a blocked-senders column, which
 * migration 0015 does not have (docs/18 §4 "Blocked senders").
 *
 * Runs as `tracksite_worker` like the inbound handler (no operator, no tenant session).
 */

export interface DeliveryMessage {
  messageRowId: string;
  ticketId: string;
  organizationId: string | null;
  deliveryStatus: SupportDeliveryStatus;
  requesterEmail: string;
}

export interface DeliveryStore extends InboundLedger {
  findMessageByProviderId(emailId: string): Promise<DeliveryMessage | null>;
  updateDelivery(messageRowId: string, patch: DeliveryPatch): Promise<void>;
  /** tags every ticket of the requester `do-not-email`; returns how many tickets changed (0 when all carried it) */
  markDoNotEmail(requesterEmail: string, context: { ticketId: string; organizationId: string | null; messageRowId: string; emailId: string; providerEventId: string }, now: Date): Promise<{ ticketsTagged: number }>;
}

export interface DeliveryDeps {
  store: DeliveryStore;
  now?: () => Date;
  log?: InboundLog;
}

export type DeliveryOutcome =
  | { status: "duplicate" }
  | { status: "in_progress" }
  | { status: "ignored"; reason: "no_message" | "no_status_change" }
  | { status: "failed"; error: string }
  | { status: "processed"; messageRowId: string; ticketId: string; from: SupportDeliveryStatus; to: SupportDeliveryStatus; doNotEmail: boolean; ticketsTagged: number };

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Applies one delivery event (no ledger — see `handleDeliveryEvent`). */
export async function processDeliveryEvent(event: DeliveryEvent, deps: DeliveryDeps): Promise<Exclude<DeliveryOutcome, { status: "duplicate" | "in_progress" | "failed" }>> {
  const { store } = deps;
  const now = deps.now?.() ?? new Date();
  const message = await store.findMessageByProviderId(event.emailId);
  if (!message) return { status: "ignored", reason: "no_message" };
  const from = message.deliveryStatus;
  const incoming = deliveryStatusForEvent(event.type);
  const next = incoming ? nextDeliveryStatus(from, incoming) : from;
  const changed = next !== from;
  if (changed) {
    const patch: DeliveryPatch = { deliveryStatus: next };
    if (next === "bounced" || next === "failed" || next === "complained") patch.deliveryError = event.detail ?? next;
    if (next === "delivered") patch.deliveryError = null;
    await store.updateDelivery(message.messageRowId, patch);
  }
  let ticketsTagged = 0;
  const complaint = event.type === "email.complained";
  if (complaint) {
    const tagged = await store.markDoNotEmail(message.requesterEmail, { ticketId: message.ticketId, organizationId: message.organizationId, messageRowId: message.messageRowId, emailId: event.emailId, providerEventId: event.providerEventId }, now);
    ticketsTagged = tagged.ticketsTagged;
  }
  if (!changed && !complaint) return { status: "ignored", reason: "no_status_change" };
  return { status: "processed", messageRowId: message.messageRowId, ticketId: message.ticketId, from, to: next, doNotEmail: complaint, ticketsTagged };
}

/** Ledger-wrapped delivery processing; the same idempotency rules as `handleInboundEvent`. Never throws. */
export async function handleDeliveryEvent(event: DeliveryEvent, deps: DeliveryDeps): Promise<DeliveryOutcome> {
  const { store } = deps;
  const log = deps.log ?? logger;
  const begin = await store.beginEvent(event.providerEventId, event.provider, deps.now?.() ?? new Date());
  if (begin === "duplicate") return { status: "duplicate" };
  if (begin === "in_progress") return { status: "in_progress" };
  try {
    const outcome = await processDeliveryEvent(event, deps);
    await store.finishEvent(event.providerEventId, { status: outcome.status === "ignored" ? "ignored" : "processed", ticketId: outcome.status === "processed" ? outcome.ticketId : null }, deps.now?.() ?? new Date());
    log.info(outcome.status === "processed" ? { eventId: event.providerEventId, type: event.type, ticketId: outcome.ticketId, from: outcome.from, to: outcome.to, doNotEmail: outcome.doNotEmail } : { eventId: event.providerEventId, type: event.type, reason: outcome.reason }, "support.delivery.processed");
    return outcome;
  } catch (err) {
    const message = errorMessage(err);
    await store.finishEvent(event.providerEventId, { status: "failed", error: message.slice(0, 1000) }, deps.now?.() ?? new Date()).catch(() => undefined);
    log.error({ eventId: event.providerEventId, type: event.type, err: message }, "support.delivery.failed");
    return { status: "failed", error: message };
  }
}

/** HTTP answer of a delivery outcome (framework-free); `in_progress` and `failed` make the provider retry. */
export function deliveryOutcomeResponse(outcome: DeliveryOutcome): { status: number; body: Record<string, unknown> } {
  switch (outcome.status) {
    case "duplicate":
      return { status: 200, body: { ok: true, duplicate: true } };
    case "in_progress":
      return { status: 409, body: { ok: false, code: "IN_PROGRESS" } };
    case "ignored":
      return { status: 200, body: { ok: true, ignored: true, reason: outcome.reason } };
    case "failed":
      return { status: 500, body: { ok: false, code: "PROCESSING_FAILED" } };
    case "processed":
      return { status: 200, body: { ok: true, ticketId: outcome.ticketId, messageId: outcome.messageRowId, from: outcome.from, to: outcome.to, doNotEmail: outcome.doNotEmail, ticketsTagged: outcome.ticketsTagged } };
  }
}

/**
 * Signing secret of the delivery webhook: `RESEND_DELIVERY_WEBHOOK_SECRET` when a separate Resend webhook
 * posts delivery events to `/api/support/delivery`, otherwise the inbound secret (`RESEND_WEBHOOK_SECRET`) —
 * the recommended setup is one Resend webhook for all events at `/api/support/inbound`, which handles
 * delivery events too (docs/18 §5). Null when neither is configured.
 */
export function deliveryWebhookSecret(): string | null {
  const { RESEND_DELIVERY_WEBHOOK_SECRET, RESEND_WEBHOOK_SECRET } = env();
  return RESEND_DELIVERY_WEBHOOK_SECRET?.trim() || RESEND_WEBHOOK_SECRET?.trim() || null;
}

// ---------------------------------------------------------------------------------------------------
// Drizzle store (tracksite_worker)
// ---------------------------------------------------------------------------------------------------

export function createDrizzleDeliveryStore(database?: Db): DeliveryStore {
  const dbase = database ?? db();
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withWorker(dbase, fn);
  return {
    ...createDrizzleInboundLedger(dbase),

    async findMessageByProviderId(emailId) {
      const id = emailId.trim();
      if (!id) return null;
      return run(async (tx) => {
        const [row] = await tx
          .select({
            messageRowId: supportMessages.id,
            ticketId: supportMessages.ticketId,
            organizationId: supportMessages.organizationId,
            deliveryStatus: supportMessages.deliveryStatus,
            requesterEmail: supportTickets.requesterEmail,
          })
          .from(supportMessages)
          .innerJoin(supportTickets, eq(supportTickets.id, supportMessages.ticketId))
          .where(and(eq(supportMessages.providerMessageId, id), eq(supportMessages.direction, "outbound")))
          .limit(1);
        return row ?? null;
      });
    },

    async updateDelivery(messageRowId, patch) {
      await run((tx) =>
        tx
          .update(supportMessages)
          .set({ deliveryStatus: patch.deliveryStatus, ...(patch.providerMessageId !== undefined ? { providerMessageId: patch.providerMessageId } : {}), ...(patch.deliveryError !== undefined ? { deliveryError: patch.deliveryError } : {}) })
          .where(eq(supportMessages.id, messageRowId)),
      );
    },

    async markDoNotEmail(requesterEmail, context, now) {
      return run(async (tx) => {
        const address = requesterEmail.trim().toLowerCase();
        const rows = await tx
          .select({ id: supportTickets.id, organizationId: supportTickets.organizationId, tags: supportTickets.tags })
          .from(supportTickets)
          .where(and(eq(supportTickets.requesterEmail, address), not(sql`${DO_NOT_EMAIL_TAG} = ANY(${supportTickets.tags})`)))
          .limit(500);
        for (const t of rows) {
          await tx.update(supportTickets).set({ tags: [...t.tags, DO_NOT_EMAIL_TAG] }).where(eq(supportTickets.id, t.id));
          await tx.insert(supportEvents).values({ ticketId: t.id, organizationId: t.organizationId, actorKind: "system", kind: "tags", payload: { added: [DO_NOT_EMAIL_TAG], removed: [], reason: "complaint", messageId: context.messageRowId }, createdAt: now });
        }
        await recordAudit(tx, {
          organizationId: context.organizationId,
          actor: { kind: "system", name: "resend-webhook" },
          action: "support.requester.do_not_email",
          targetType: "support_ticket",
          targetId: context.ticketId,
          diff: { tagsAdded: [DO_NOT_EMAIL_TAG], ticketsTagged: rows.length, reason: "complaint" },
          metadata: { emailId: context.emailId, providerEventId: context.providerEventId, messageId: context.messageRowId },
        });
        return { ticketsTagged: rows.length };
      });
    },
  };
}

/** Production dependencies of the delivery routes. */
export function defaultDeliveryDeps(overrides: Partial<DeliveryDeps> = {}): DeliveryDeps {
  return { store: createDrizzleDeliveryStore(), log: logger, ...overrides };
}
