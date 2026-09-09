import "server-only";
import { and, asc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  SUPPORT_TICKET_AGENT_CHANNEL,
  member,
  organization,
  subscriptions,
  supportMessages,
  supportSettings,
  supportSlaPolicies,
  supportTickets,
  user,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import { REQUESTER_SEARCH_LIMIT, REQUESTER_SEARCH_MAX, agentTicketStatus, fillTicketNumber } from "@/components/ops/support/new/constants";
import { markdownToHtml, markdownToText } from "@/components/ops/support/ticket/markdown";
import { isLocale, type AppLocale } from "@/i18n/routing";
import { logger } from "@/server/db";
import { auditPlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { autoAssignNewTicket, type AutoAssignOutcome } from "./auto-assign";
import { sanitizeHtml } from "./inbound";
import { sendTicketMail, supportMailSettings, ticketMessageId, ticketSubject, type SupportMailSettings } from "./mail";
import { selectSlaPolicy, type SlaPolicyLike } from "./sla";
import { DELIVERY_CLAIM_STALE_MS, recordTicketEvent } from "./ticket";
import { getTeamRow } from "./teams";

export * from "@/components/ops/support/new/constants";

/**
 * Tickets an operator opens on the customer's behalf (docs/18 §"Agent-created tickets and teams", task N):
 * `/ops/support/new` → `createAgentTicketAction` (server/ops/actions/support-new.ts) → `createAgentTicket`.
 *
 * - The ticket is stored with channel `agent` and `opened_by = 'agent'`, in the chosen team, with the tags,
 *   the category, the priority and the requester's language. Its first message is either an outbound reply
 *   (`send to the customer now`: stored `queued` with the desk's Message-ID before the transport runs, then
 *   mailed by `sendAgentTicketMessage` after the commit — Reply-To is the plus address, so the customer's
 *   answer lands on the ticket) or an internal note. Status: `pending` when the customer was written to
 *   (the desk waits for them), `open` for a note-only ticket (`agentTicketStatus`).
 * - **SLA**: there is no request to answer, so the ticket gets no first-response target and a paused
 *   resolution clock: the plan's (or the default) policy is recorded on the row, both due times stay null
 *   and `sla_pending_first_customer_reply` is set. The first customer reply (inbound mail, portal) starts
 *   the clocks through the engine — `applyFirstCustomerReply(tx, ticketId, now)` (`./first-customer-reply`)
 *   books `computeClockStart(policy, priority, now)` from the reply and clears the flag; the inbound
 *   handler's store (`appendMessage`) and the portal's `insertCustomerReply` call it **after** their
 *   `statusTransition` (`pending → open` ends the pause first, so nothing shifts the fresh due times). While
 *   waiting, the engine keeps the clocks null on a reopen or a priority change (the row's flag is read by
 *   `statusTransition` / `applyPolicyOnPriorityChange`) and the queue shows "SLA starts with the first
 *   customer reply" instead of "no SLA policy".
 * - The opening message never counts as the first response (`first_responded_at` stays null): a later
 *   agent reply through the composer stamps it like on every other ticket.
 * - Assignment: "assign to me" stamps the operator (an `assignee` event, `self: true`); otherwise the desk's
 *   round robin runs inside the transaction with the ticket's team as the candidate pool (`auto-assign.ts`).
 * - Audit: `platform.support_ticket.create` (target `support_ticket`, the ticket's organisation) with ids,
 *   the field values and the body length — never the body, the address or the name; the send is audited as
 *   `platform.support_ticket.send` like the composer's.
 * - Requester: a member picked from the organisation search (`searchRequesters`) or a free e-mail address
 *   with a name. A free address that belongs to a known account is linked to it and — with exactly one
 *   membership, the inbound rule — to its organisation; the operator chose the address deliberately, so no
 *   authentication guard applies here.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string): boolean => UUID.test(value);
const lower = (value: string): string => value.trim().toLowerCase();

// ---------------------------------------------------------------------------------------------------
// Requester search and resolution
// ---------------------------------------------------------------------------------------------------

export interface RequesterOrganisation {
  id: string;
  name: string;
  slug: string;
}

export interface RequesterMember {
  userId: string;
  name: string;
  email: string;
  locale: string;
  role: string;
  organization: RequesterOrganisation;
}

export interface RequesterSearch {
  organisations: RequesterOrganisation[];
  members: RequesterMember[];
}

const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/**
 * Organisations by name / slug and organisation members by name / e-mail / organisation — display data only
 * (name, e-mail, locale, membership role), at most `REQUESTER_SEARCH_LIMIT` rows of each kind.
 */
export async function searchRequesters(tx: Tx, query: string, limit: number = REQUESTER_SEARCH_LIMIT): Promise<RequesterSearch> {
  const q = query.trim().slice(0, REQUESTER_SEARCH_MAX);
  if (!q) return { organisations: [], members: [] };
  const pattern = likePattern(q);
  const organisations = await tx
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(or(ilike(organization.name, pattern), ilike(organization.slug, pattern)))
    .orderBy(asc(organization.name))
    .limit(limit);
  const rows = await tx
    .select({ userId: user.id, name: user.name, email: user.email, locale: user.locale, role: member.role, orgId: organization.id, orgName: organization.name, orgSlug: organization.slug })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(or(ilike(user.name, pattern), ilike(user.email, pattern), ilike(organization.name, pattern), ilike(organization.slug, pattern)))
    .orderBy(asc(organization.name), asc(user.name), asc(user.email))
    .limit(limit);
  return {
    organisations,
    members: rows.map((r) => ({ userId: r.userId, name: r.name, email: r.email, locale: r.locale, role: r.role, organization: { id: r.orgId, name: r.orgName, slug: r.orgSlug } })),
  };
}

/** The requester as the ticket stores it. */
export interface AgentTicketRequester {
  userId: string | null;
  email: string;
  name: string | null;
  organizationId: string | null;
  /** the account's stored locale (null for an unknown address) */
  locale: string | null;
  /** memberships of a known account (the organisation is linked only with exactly one) */
  membershipCount: number;
}

export type RequesterInput = { mode: "member"; userId: string; organizationId: string } | { mode: "email"; email: string; name: string | null };

/**
 * Resolves the form's requester: a member (the user must be a member of the named organisation) or a free
 * address (linked to a known account and, with exactly one membership, to its organisation). Null when the
 * member does not exist or is not in that organisation.
 */
export async function resolveRequester(tx: Tx, input: RequesterInput): Promise<AgentTicketRequester | null> {
  if (input.mode === "member") {
    if (!isUuid(input.userId) || !isUuid(input.organizationId)) return null;
    const [row] = await tx
      .select({ userId: user.id, name: user.name, email: user.email, locale: user.locale })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.userId, input.userId), eq(member.organizationId, input.organizationId)))
      .limit(1);
    if (!row) return null;
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(member).where(eq(member.userId, row.userId));
    return { userId: row.userId, email: lower(row.email), name: row.name, organizationId: input.organizationId, locale: row.locale, membershipCount: Number(count?.n ?? 1) };
  }
  const email = lower(input.email);
  const [known] = await tx
    .select({ id: user.id, name: user.name, locale: user.locale })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  if (!known) return { userId: null, email, name: input.name?.trim() || null, organizationId: null, locale: null, membershipCount: 0 };
  const memberships = await tx.select({ organizationId: member.organizationId }).from(member).where(eq(member.userId, known.id));
  return {
    userId: known.id,
    email,
    name: input.name?.trim() || known.name || null,
    organizationId: memberships.length === 1 ? memberships[0]!.organizationId : null,
    locale: known.locale,
    membershipCount: memberships.length,
  };
}

// ---------------------------------------------------------------------------------------------------
// Policy, settings
// ---------------------------------------------------------------------------------------------------

/** The policy columns the creation and the first-reply hook read. */
export type AgentTicketPolicy = SlaPolicyLike & { id: string };

/** The SLA policy of a requester's organisation (plan match, then default); null without any policy. */
export async function slaPolicyForOrganisation(tx: Tx, organizationId: string | null): Promise<AgentTicketPolicy | null> {
  let planId: string | null = null;
  if (organizationId) {
    const [sub] = await tx.select({ planId: subscriptions.planId }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
    planId = sub?.planId ?? null;
  }
  const policies = await tx.select({ id: supportSlaPolicies.id, planIds: supportSlaPolicies.planIds, isDefault: supportSlaPolicies.isDefault, priorities: supportSlaPolicies.priorities, businessHours: supportSlaPolicies.businessHours }).from(supportSlaPolicies);
  const policy = selectSlaPolicy(policies, planId);
  return policy ? { id: policy.id, priorities: policy.priorities ?? {}, businessHours: policy.businessHours } : null;
}

async function mailSettings(tx: Tx): Promise<SupportMailSettings> {
  const [row] = await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
  return supportMailSettings(row ? { inboundDomain: row.inboundDomain, fromName: row.fromName, fromAddress: row.fromAddress, signatureText: row.signatureText } : null);
}

// ---------------------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------------------

export interface CreateAgentTicketInput {
  requester: AgentTicketRequester;
  subject: string;
  /** Markdown subset of the composer (rendered through `markdownToHtml` + `sanitizeHtml`) */
  body: string;
  priority: SupportTicketPriority;
  category: string | null;
  tags: string[];
  teamId: string | null;
  assignToMe: boolean;
  sendToCustomer: boolean;
  locale: AppLocale;
  macroId: string | null;
  now?: Date;
}

export interface CreateAgentTicketResult {
  ticketId: string;
  number: number;
  messageId: string;
  status: SupportTicketStatus;
  organizationId: string | null;
  teamId: string | null;
  slaPolicyId: string | null;
  slaPending: boolean;
  assigneeUserId: string | null;
  autoAssign: AutoAssignOutcome | null;
  sendToCustomer: boolean;
}

/**
 * Stores the ticket, its opening message and the timeline (`created`, optional `assignee`, `reply` / `note`)
 * and writes the audit entry — one transaction of the caller (`tracksite_ops`). An outbound message is left
 * `queued`; `sendAgentTicketMessage` mails it after the commit. The team must exist and be active, else
 * `invalid_team` is thrown as an `AgentTicketError`.
 */
export async function createAgentTicket(tx: Tx, ctx: PlatformContext, input: CreateAgentTicketInput): Promise<CreateAgentTicketResult> {
  const now = input.now ?? new Date();
  const { requester } = input;
  if (input.teamId) {
    const team = await getTeamRow(tx, input.teamId);
    if (!team || team.archivedAt) throw new AgentTicketError("invalid_team");
  }
  const policy = await slaPolicyForOrganisation(tx, requester.organizationId);
  const status = agentTicketStatus(input.sendToCustomer);
  const assigneeUserId = input.assignToMe ? ctx.user.id : null;
  const locale: AppLocale = isLocale(input.locale) ? input.locale : "en";
  const [ticket] = await tx
    .insert(supportTickets)
    .values({
      organizationId: requester.organizationId,
      requesterUserId: requester.userId,
      requesterEmail: requester.email,
      requesterName: requester.name,
      subject: input.subject,
      status,
      priority: input.priority,
      channel: SUPPORT_TICKET_AGENT_CHANNEL,
      openedBy: "agent",
      category: input.category,
      tags: input.tags,
      assigneeUserId,
      teamId: input.teamId,
      slaPolicyId: policy?.id ?? null,
      // no first-response target, paused resolution clock: both due times wait for the first customer reply
      firstResponseDueAt: null,
      resolutionDueAt: null,
      slaPendingFirstCustomerReply: policy != null,
      pausedAt: status === "pending" ? now : null,
      lastAgentMessageAt: input.sendToCustomer ? now : null,
      locale,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: supportTickets.id, number: supportTickets.number });
  const ticketId = ticket!.id;
  const number = Number(ticket!.number);
  const settings = await mailSettings(tx);
  const body = fillTicketNumber(input.body, number);
  const html = sanitizeHtml(markdownToHtml(body));
  const text = markdownToText(body);
  const outbound = input.sendToCustomer;
  const [message] = await tx
    .insert(supportMessages)
    .values({
      ticketId,
      organizationId: requester.organizationId,
      direction: outbound ? "outbound" : "note",
      authorKind: "agent",
      authorUserId: ctx.user.id,
      fromEmail: outbound ? settings.fromAddress : null,
      toEmails: outbound ? [requester.email] : [],
      ccEmails: [],
      subject: outbound ? ticketSubject(number, input.subject) : null,
      textBody: text,
      htmlBody: html || null,
      messageId: outbound ? ticketMessageId(number, settings) : null,
      inReplyTo: null,
      references: [],
      deliveryStatus: outbound ? "queued" : "na",
      macroId: input.macroId,
      createdAt: now,
    })
    .returning({ id: supportMessages.id });
  const messageId = message!.id;
  const base = { ticketId, organizationId: requester.organizationId, actorKind: "agent" as const, actorUserId: ctx.user.id };
  await recordTicketEvent(
    tx,
    {
      ...base,
      kind: "created",
      payload: {
        channel: SUPPORT_TICKET_AGENT_CHANNEL,
        openedBy: "agent",
        status,
        priority: input.priority,
        category: input.category,
        teamId: input.teamId,
        sendToCustomer: outbound,
        macroId: input.macroId,
        requesterLinked: requester.userId != null,
        organizationMatched: requester.organizationId != null,
        membershipCount: requester.membershipCount,
        slaPolicyId: policy?.id ?? null,
        slaPendingFirstCustomerReply: policy != null,
        locale,
      },
    },
    now,
  );
  if (assigneeUserId) await recordTicketEvent(tx, { ...base, kind: "assignee", payload: { from: null, to: assigneeUserId, self: true, reason: "opened_by_agent" } }, now);
  await recordTicketEvent(tx, { ...base, kind: outbound ? "reply" : "note", payload: { messageId, attachments: 0, macroId: input.macroId, firstResponse: false, pendingUpload: false, opening: true } }, now);
  // the desk's round robin (team-aware, docs/18 §"Round robin") when the operator did not take the ticket;
  // own savepoint: a failure leaves the ticket unassigned and logged, never fails the creation
  let autoAssign: AutoAssignOutcome | null = null;
  if (!assigneeUserId) {
    autoAssign = await tx
      .transaction((sp) => autoAssignNewTicket(sp, { ticketId, organizationId: requester.organizationId, source: "agent", requestId: ctx.requestId, now }))
      .catch((e: unknown) => {
        logger.warn({ ticketId, err: e instanceof Error ? e.message : String(e) }, "support.auto_assign_failed");
        return null;
      });
  }
  await auditPlatform(
    ctx,
    {
      action: "platform.support_ticket.create",
      organizationId: requester.organizationId,
      targetType: "support_ticket",
      targetId: ticketId,
      // ids, field values and the body length — never the body, the address or the name
      diff: {
        ticketNumber: number,
        channel: SUPPORT_TICKET_AGENT_CHANNEL,
        openedBy: "agent",
        status,
        priority: input.priority,
        category: input.category,
        tags: input.tags,
        teamId: input.teamId,
        assigneeUserId,
        autoAssigneeUserId: autoAssign?.assigneeUserId ?? null,
        autoAssignCandidates: autoAssign?.candidates ?? null,
        requesterUserId: requester.userId,
        organizationId: requester.organizationId,
        locale,
        sendToCustomer: outbound,
        messageId,
        bodyLength: body.length,
        macroId: input.macroId,
        slaPolicyId: policy?.id ?? null,
        slaPendingFirstCustomerReply: policy != null,
      },
      metadata: { module: "support", ticketNumber: number, openedBy: "agent" },
    },
    tx,
  );
  return {
    ticketId,
    number,
    messageId,
    status,
    organizationId: requester.organizationId,
    teamId: input.teamId,
    slaPolicyId: policy?.id ?? null,
    slaPending: policy != null,
    assigneeUserId: assigneeUserId ?? autoAssign?.assigneeUserId ?? null,
    autoAssign,
    sendToCustomer: outbound,
  };
}

export type AgentTicketErrorCode = "invalid_team" | "invalid_requester";

export class AgentTicketError extends Error {
  readonly code: AgentTicketErrorCode;
  constructor(code: AgentTicketErrorCode) {
    super(code);
    this.name = "AgentTicketError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------------
// Sending the opening message (after the commit)
// ---------------------------------------------------------------------------------------------------

export interface AgentTicketSendResult {
  ok: boolean;
  sent: boolean;
  transport: string | null;
  error: "not_found" | "invalid_state" | "unchanged" | "mail_failed" | null;
}

type ClaimedOpening = { error: "not_found" | "invalid_state" | "unchanged" } | { message: typeof supportMessages.$inferSelect; ticket: { id: string; number: number; subject: string; requesterEmail: string; requesterName: string | null; locale: string; organizationId: string | null }; settings: SupportMailSettings };

/**
 * Mails the opening message of an agent-created ticket through `sendTicketMail` (Reply-To = the ticket's
 * plus address, the stored Message-ID) and records the outcome on the row and in the audit log
 * (`platform.support_ticket.send`, no body) — the composer's send path of docs/18 §12 step 3 / §"Hardening":
 * **an atomic claim first** (`UPDATE … SET delivery_status = 'sending', delivery_claimed_at = now WHERE
 * delivery_status IN ('queued', 'failed') or a stale claim … RETURNING`, committed on its own), so a retried
 * submit, the ticket page's "send now" and a double click mail the customer at most once; the transport
 * runs outside any transaction (no row lock and no connection held during SMTP); a second transaction records
 * `sent` + `provider_message_id` (Resend's id, which the delivery webhooks match) or `failed` +
 * `delivery_error` and the audit entry — matching the claim only, so a provider event that arrived meanwhile
 * is never downgraded. A transport failure is shown on the ticket page with its "Send again", never thrown.
 */
export async function sendAgentTicketMessage(ctx: PlatformContext, messageId: string): Promise<AgentTicketSendResult> {
  if (!isUuid(messageId)) return { ok: false, sent: false, transport: null, error: "not_found" };
  const now = new Date();
  const staleBefore = new Date(now.getTime() - DELIVERY_CLAIM_STALE_MS);
  const claimed = await withPlatform(ctx, async (tx): Promise<ClaimedOpening> => {
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
      const [existing] = await tx.select({ direction: supportMessages.direction }).from(supportMessages).where(eq(supportMessages.id, messageId)).limit(1);
      if (!existing) return { error: "not_found" };
      return { error: existing.direction !== "outbound" ? "invalid_state" : "unchanged" };
    }
    const [ticket] = await tx
      .select({ id: supportTickets.id, number: supportTickets.number, subject: supportTickets.subject, requesterEmail: supportTickets.requesterEmail, requesterName: supportTickets.requesterName, locale: supportTickets.locale, organizationId: supportTickets.organizationId })
      .from(supportTickets)
      .where(eq(supportTickets.id, message.ticketId))
      .limit(1);
    if (!ticket) return { error: "not_found" };
    return { message, ticket: { ...ticket, number: Number(ticket.number) }, settings: await mailSettings(tx) };
  });
  if ("error" in claimed) return { ok: claimed.error === "unchanged", sent: false, transport: null, error: claimed.error };
  const { message, ticket, settings } = claimed;

  const result = await sendTicketMail({
    ticket: { id: ticket.id, number: ticket.number, subject: ticket.subject, requesterEmail: ticket.requesterEmail, requesterName: ticket.requesterName, locale: ticket.locale },
    message: { id: message.id, textBody: message.textBody, htmlBody: message.htmlBody, messageId: message.messageId, kind: "agent", agentName: ctx.user.name },
    locale: ticket.locale,
    settings,
  });
  if (!result.ok) logger.warn({ ticketId: ticket.id, messageId: message.id, transport: result.transport, err: result.error }, "support agent ticket mail failed");

  await withPlatform(ctx, async (tx) => {
    // only the claim this call holds is resolved: a provider event that arrived meanwhile is never downgraded
    await tx
      .update(supportMessages)
      .set({
        deliveryStatus: result.ok ? "sent" : "failed",
        deliveryError: result.ok ? null : (result.error ?? "send failed").slice(0, 500),
        deliveryClaimedAt: null,
        providerMessageId: result.ok && result.transport === "resend" ? (result.id ?? null) : message.providerMessageId,
      })
      .where(and(eq(supportMessages.id, message.id), eq(supportMessages.deliveryStatus, "sending")));
    await tx.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
    await auditPlatform(
      ctx,
      {
        action: "platform.support_ticket.send",
        organizationId: ticket.organizationId,
        targetType: "support_ticket",
        targetId: ticket.id,
        diff: { messageId: message.id, ok: result.ok, transport: result.transport, error: result.ok ? null : (result.error ?? "send failed").slice(0, 200), attachments: 0, locale: ticket.locale, opening: true, claimedAt: now.toISOString() },
        metadata: { module: "support", ticketNumber: ticket.number, mailId: result.ok ? (result.id ?? null) : null },
      },
      tx,
    );
  });
  return { ok: result.ok, sent: result.ok, transport: result.transport ?? null, error: result.ok ? null : "mail_failed" };
}

// ---------------------------------------------------------------------------------------------------
// First customer reply → the clocks start (`./first-customer-reply`; re-exported for the callers and tests)
// ---------------------------------------------------------------------------------------------------

export { applyFirstCustomerReply, type FirstCustomerReplyOutcome, type FirstCustomerReplyPolicyLoader } from "./first-customer-reply";
