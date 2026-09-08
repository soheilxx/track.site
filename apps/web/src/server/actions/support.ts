"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, type Permission } from "@track-site/core";
import { SUPPORT_TICKET_PRIORITIES, supportEvents, supportTickets, type SupportSatisfaction } from "@track-site/db";
import { logger } from "@/server/db";
import { requireOrgContext, withOrg, type OrgContext } from "@/server/session";
import { autoAssignTicketAfterCommit } from "@/server/support/auto-assign";
import {
  PORTAL_LIMITS,
  SUPPORT_AUDIT_ACTIONS,
  SUPPORT_CATEGORIES,
  auditTicket,
  customerCanMarkSolved,
  customerCanRate,
  customerCanReply,
  insertCustomerReply,
  insertTicket,
  loadPortalSettings,
  lockCustomerTicket,
  screenUploads,
  sendTicketAcknowledgement,
  suggestKnowledge,
  organizationPlanId,
  type KnowledgeSuggestion,
} from "@/server/support/portal";
import { statusTransition } from "@/server/support/sla";
import { loadSlaPolicy } from "@/server/support/ticket";

/**
 * Customer support portal actions (`/app/support`, docs/18 §"Customer view"). Every action resolves the
 * organisation context with the permission of the change (`support.write`; a read-only break-glass session is
 * refused by `requireOrgContext` before the role check), validates its input with zod, runs inside the tenant
 * transaction (RLS as `tracksite_app`) and writes an audit entry with ids, counts and field changes — never a
 * message body or an e-mail address. Attachments are screened (≤ 5 per message, ≤ 5 MB, allow-listed types)
 * before anything is written; a refused file fails the whole submission so nothing is dropped silently.
 */

export type SupportActionError = "forbidden" | "invalid" | "not_found" | "invalid_state" | "attachments" | "confirmation_required" | "already_rated" | "csat_disabled" | "generic";
export type SupportNotice = "created" | "replied" | "reopened" | "solved" | "rated";

export interface SupportActionState {
  ok: boolean;
  error: SupportActionError | null;
  notice: SupportNotice | null;
  fieldErrors?: Record<string, string>;
  /** attachments refused by the screening (name + reason code) — shown next to the file input */
  refused?: Array<{ fileName: string; reason: string }>;
}

const PATH = "/app/support";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

const fail = (error: SupportActionError, extra: Partial<SupportActionState> = {}): SupportActionState => ({ ok: false, error, notice: null, ...extra });
const done = (notice: SupportNotice): SupportActionState => ({ ok: true, error: null, notice });

/** The organisation context or null for a missing permission / read-only support session (redirects propagate). */
async function contextOr(permission: Permission): Promise<OrgContext | null> {
  try {
    return await requireOrgContext(permission);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return null;
    throw e;
  }
}

function revalidate(ticketId?: string): void {
  revalidatePath(PATH);
  if (ticketId) revalidatePath(`${PATH}/${ticketId}`);
}

function fieldErrorsOf(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? "form")] = "invalid";
  return out;
}

const createSchema = z.object({
  subject: z.string().trim().min(PORTAL_LIMITS.subjectMin).max(PORTAL_LIMITS.subjectMax),
  category: z.enum(SUPPORT_CATEGORIES),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
  body: z.string().trim().min(PORTAL_LIMITS.bodyMin).max(PORTAL_LIMITS.bodyMax),
});

/**
 * Opens a ticket for the organisation (channel `dashboard`): ticket, first message, attachments and the
 * `created` event in one tenant transaction with the audit entry; the optional automatic acknowledgement
 * goes out afterwards (a transport failure is logged, never shown as a failed submission). Redirects to
 * the new ticket.
 */
export async function createTicketAction(_prev: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const ctx = await contextOr("support.write");
  if (!ctx) return fail("forbidden");
  const parsed = createSchema.safeParse({ subject: str(formData, "subject"), category: str(formData, "category"), priority: str(formData, "priority") || "normal", body: str(formData, "body") });
  if (!parsed.success) return fail("invalid", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
  const uploads = screenUploads(formData.getAll("attachments"));
  if (uploads.rejected.length) return fail("attachments", { refused: uploads.rejected });

  let created: { ticketId: string; number: number; refused: Array<{ fileName: string; detail: string | null }> };
  try {
    const planId = await organizationPlanId(ctx.organization.id);
    created = await withOrg(ctx, async (tx) => {
      const result = await insertTicket(tx, {
        organizationId: ctx.organization.id,
        requester: { userId: ctx.user.id, email: ctx.user.email, name: ctx.user.name, locale: ctx.user.locale },
        subject: parsed.data.subject,
        category: parsed.data.category,
        priority: parsed.data.priority,
        channel: "dashboard",
        body: parsed.data.body,
        attachments: uploads.accepted,
        planId,
      });
      await auditTicket(tx, {
        organizationId: ctx.organization.id,
        actor: ctx.tenant.actor,
        action: SUPPORT_AUDIT_ACTIONS.create,
        ticketId: result.ticketId,
        diff: { number: result.number, channel: "dashboard", category: parsed.data.category, priority: parsed.data.priority, subjectLength: parsed.data.subject.length, bodyLength: parsed.data.body.length, attachments: result.attachments.length, attachmentsRefused: result.refused.length, slaPolicyId: result.sla.policyId },
        requestId: ctx.tenant.requestId,
      });
      return { ticketId: result.ticketId, number: result.number, refused: result.refused };
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "support.ticket.create_failed");
    return fail("generic");
  }
  // desk auto-assignment (round robin among agents online): after the commit, the tenant role has no privilege on
  // the desk tables; the creation audit above cannot carry the outcome, so a pick records its own system audit
  // row `support.ticket.auto_assign` (ids only, this request id) in the same transaction as the assignment
  await autoAssignTicketAfterCommit({ ticketId: created.ticketId, organizationId: ctx.organization.id, source: "portal", requestId: ctx.tenant.requestId });
  const settings = await loadPortalSettings();
  const ack = await sendTicketAcknowledgement({ id: created.ticketId, number: created.number, subject: parsed.data.subject, requesterEmail: ctx.user.email, requesterName: ctx.user.name, locale: ctx.user.locale }, settings);
  if (ack && !ack.ok) logger.warn({ ticketId: created.ticketId, transport: ack.transport, err: ack.error }, "support.ticket.acknowledgement_failed");
  revalidate(created.ticketId);
  redirect(`${PATH}/${created.ticketId}?notice=created`);
}

const replySchema = z.object({ ticketId: uuid, body: z.string().trim().min(PORTAL_LIMITS.bodyMin).max(PORTAL_LIMITS.bodyMax) });

/** A customer message on a ticket; answering a `pending` question reopens the clock, a message on a solved ticket reopens the ticket. */
export async function replyTicketAction(_prev: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const ctx = await contextOr("support.write");
  if (!ctx) return fail("forbidden");
  const parsed = replySchema.safeParse({ ticketId: str(formData, "ticketId"), body: str(formData, "body") });
  if (!parsed.success) return fail("invalid", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
  const uploads = screenUploads(formData.getAll("attachments"));
  if (uploads.rejected.length) return fail("attachments", { refused: uploads.rejected });
  const { ticketId, body } = parsed.data;
  let outcome: { error: SupportActionError } | { reopened: boolean };
  try {
    outcome = await withOrg(ctx, async (tx) => {
      const ticket = await lockCustomerTicket(tx, ctx.organization.id, ticketId);
      if (!ticket) return { error: "not_found" as const };
      if (!customerCanReply(ticket)) return { error: "invalid_state" as const };
      const result = await insertCustomerReply(tx, { ticket, author: { userId: ctx.user.id, email: ctx.user.email }, body, attachments: uploads.accepted });
      await auditTicket(tx, {
        organizationId: ctx.organization.id,
        actor: ctx.tenant.actor,
        action: SUPPORT_AUDIT_ACTIONS.reply,
        ticketId: ticket.id,
        diff: { messageId: result.messageId, statusFrom: result.statusFrom, statusTo: result.statusTo, reopened: result.reopened, bodyLength: body.length, attachments: result.attachments.length, attachmentsRefused: result.refused.length },
        requestId: ctx.tenant.requestId,
      });
      return { reopened: result.reopened };
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), ticketId }, "support.ticket.reply_failed");
    return fail("generic");
  }
  if ("error" in outcome) return fail(outcome.error);
  revalidate(ticketId);
  return done(outcome.reopened ? "reopened" : "replied");
}

const solveSchema = z.object({ ticketId: uuid, confirm: z.literal("solve") });

/** The customer marks the ticket as solved (confirmed in a dialog; re-checked here through the `confirm` literal). */
export async function markTicketSolvedAction(_prev: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const ctx = await contextOr("support.write");
  if (!ctx) return fail("forbidden");
  const parsed = solveSchema.safeParse({ ticketId: str(formData, "ticketId"), confirm: str(formData, "confirm") });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "confirm") ? "confirmation_required" : "invalid");
  const { ticketId } = parsed.data;
  let error: SupportActionError | null;
  try {
    error = await withOrg(ctx, async (tx) => {
      const ticket = await lockCustomerTicket(tx, ctx.organization.id, ticketId);
      if (!ticket) return "not_found" as const;
      if (!customerCanMarkSolved(ticket)) return "invalid_state" as const;
      const now = new Date();
      // the SLA engine's transition with the ticket's own policy (docs/18 §10): `solved` stamps resolved_at and
      // flags a late resolution; leaving `pending` books the pause by its business minutes (the clock stays honest)
      const policy = await loadSlaPolicy(tx, ticket.slaPolicyId);
      await tx
        .update(supportTickets)
        .set({ ...statusTransition(policy, ticket, "solved", now).patch, updatedAt: now })
        .where(eq(supportTickets.id, ticket.id));
      await tx.insert(supportEvents).values({ ticketId: ticket.id, organizationId: ctx.organization.id, actorKind: "customer", actorUserId: ctx.user.id, kind: "status", payload: { from: ticket.status, to: "solved", by: "customer" }, createdAt: now });
      await auditTicket(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: SUPPORT_AUDIT_ACTIONS.solve, ticketId: ticket.id, diff: { statusFrom: ticket.status, statusTo: "solved" }, requestId: ctx.tenant.requestId });
      return null;
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), ticketId }, "support.ticket.solve_failed");
    return fail("generic");
  }
  if (error) return fail(error);
  revalidate(ticketId);
  return done("solved");
}

const rateSchema = z.object({ ticketId: uuid, score: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(PORTAL_LIMITS.csatCommentMax).optional() });

/** Satisfaction after a solved ticket: one answer (1–5 plus an optional comment) while the desk has surveys enabled. */
export async function rateTicketAction(_prev: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const ctx = await contextOr("support.write");
  if (!ctx) return fail("forbidden");
  const parsed = rateSchema.safeParse({ ticketId: str(formData, "ticketId"), score: str(formData, "score"), comment: str(formData, "comment") || undefined });
  if (!parsed.success) return fail("invalid", { fieldErrors: fieldErrorsOf(parsed.error.issues) });
  const { ticketId, score, comment } = parsed.data;
  const settings = await loadPortalSettings();
  if (!settings.csatEnabled) return fail("csat_disabled");
  let error: SupportActionError | null;
  try {
    error = await withOrg(ctx, async (tx) => {
      const ticket = await lockCustomerTicket(tx, ctx.organization.id, ticketId);
      if (!ticket) return "not_found" as const;
      if (ticket.satisfaction) return "already_rated" as const;
      if (!customerCanRate(ticket, settings.csatEnabled)) return "invalid_state" as const;
      const now = new Date();
      const satisfaction: SupportSatisfaction = { score: score as SupportSatisfaction["score"], comment: comment?.length ? comment : null, answered_at: now.toISOString() };
      await tx.update(supportTickets).set({ satisfaction, updatedAt: now }).where(eq(supportTickets.id, ticket.id));
      // the event carries the score only; the comment stays on the ticket row
      await tx.insert(supportEvents).values({ ticketId: ticket.id, organizationId: ctx.organization.id, actorKind: "customer", actorUserId: ctx.user.id, kind: "csat", payload: { score }, createdAt: now });
      await auditTicket(tx, { organizationId: ctx.organization.id, actor: ctx.tenant.actor, action: SUPPORT_AUDIT_ACTIONS.rate, ticketId: ticket.id, diff: { score, commentLength: comment?.length ?? 0 }, requestId: ctx.tenant.requestId });
      return null;
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e), ticketId }, "support.ticket.rate_failed");
    return fail("generic");
  }
  if (error) return fail(error);
  revalidate(ticketId);
  return done("rated");
}

const suggestSchema = z.object({ text: z.string().max(4000) });

/** Tracking Knowledge articles for the text the customer is typing (subject + message), in their language. */
export async function suggestKnowledgeAction(input: { text: string }): Promise<KnowledgeSuggestion[]> {
  const ctx = await contextOr("support.read");
  if (!ctx) return [];
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) return [];
  try {
    return await suggestKnowledge(ctx.user.locale, parsed.data.text);
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "support.knowledge_suggestions_failed");
    return [];
  }
}
