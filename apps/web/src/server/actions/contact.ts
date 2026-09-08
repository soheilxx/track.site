"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { MemoryRateLimiter, sha256Hex } from "@track-site/core";
import { uaFamily } from "@track-site/events";
import { contactRequests, pgErrorCode } from "@track-site/db";
import { env } from "@/env";
import { ALL_LOCALES } from "@/i18n/routing";
import { db, logger } from "@/server/db";
import { sendMail } from "@/server/mail";
import { autoAssignNewTicket } from "@/server/support/auto-assign";
import { getSession, isMemberOf } from "@/server/session";
import { SUPPORT_AUDIT_ACTIONS, auditTicket, formTicketSubject, insertTicket, loadPortalSettings, organizationPlanId, sendTicketAcknowledgement } from "@/server/support/portal";

export interface ContactState {
  ok: boolean;
  error: "invalid" | "rate_limited" | "generic" | null;
}

const limiter = new MemoryRateLimiter();
const schema = z.object({
  kind: z.enum(["contact", "demo", "support"]),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(4000),
  topic: z.string().trim().max(60).optional(),
  // the page's locale (hidden field of the form on every public locale): a programme locale, never a free string
  locale: z.enum(ALL_LOCALES).default("en"),
  website: z.string().max(0).optional(), // honeypot
});

/**
 * Persists contact / demo / support requests as support tickets (channel `form`, docs/18) and in the legacy
 * inbox (`contact_requests`, linked through `ticket_id`), then forwards them to the configured inbox address
 * (best effort, recorded). A signed-in sender who is a member of their active organisation gets the ticket on
 * that organisation (it shows up under /app/support); everyone else gets a ticket without organisation, which
 * only operators see. When the support tables are not available (migration 0015 pending) the request is still
 * stored in the inbox without a ticket, so the public form never fails because of the desk.
 */
export async function submitContactAction(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = schema.safeParse({ kind: formData.get("kind"), name: formData.get("name"), email: formData.get("email"), company: formData.get("company") || undefined, message: formData.get("message"), topic: formData.get("topic") || undefined, locale: formData.get("locale") || "en", website: formData.get("website") || undefined });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = sha256Hex(`${env().AUTH_SECRET ?? "salt"}:${ip}`);
  const limit = await limiter.hit(`contact:${ipHash}`, 5, 60 * 60_000, 1);
  if (!limit.allowed) return { ok: false, error: "rate_limited" };
  const session = await getSession().catch(() => null);
  // the organisation is attached only when the sender is (still) a member: a ticket on an organisation is visible to all its members
  const organizationId = session?.activeOrganizationId && (await isMemberOf(session.user.id, session.activeOrganizationId).catch(() => false)) ? session.activeOrganizationId : null;
  const message = parsed.data.topic ? `[${parsed.data.topic}] ${parsed.data.message}` : parsed.data.message;
  const subject = formTicketSubject(parsed.data.kind, parsed.data.topic, parsed.data.message);

  let id: string;
  let ticket: { ticketId: string; number: number } | null;
  try {
    const planId = await organizationPlanId(organizationId);
    const result = await db().transaction(async (tx) => {
      let created: { ticketId: string; number: number } | null = null;
      try {
        // savepoint: a missing support table (42P01) must not abort the inbox insert below
        created = await tx.transaction(async (sp) => {
          const t = await insertTicket(sp, {
            organizationId,
            requester: { userId: session?.user.id ?? null, email: parsed.data.email, name: parsed.data.name, locale: parsed.data.locale },
            subject,
            category: parsed.data.topic ?? parsed.data.kind,
            priority: "normal",
            channel: "form",
            body: parsed.data.company ? `${parsed.data.message}\n\n— ${parsed.data.name}, ${parsed.data.company}` : parsed.data.message,
            planId,
          });
          // desk auto-assignment (round robin among agents online, docs/18 §"Round robin") in a savepoint of its
          // own, before the creation audit so the diff below carries the outcome: a failure leaves the ticket
          // unassigned (`autoAssigneeUserId: null`, candidates unknown → null) and logged, never without the
          // ticket or the request; a pick writes its own `support.ticket.auto_assign` audit row as well
          const assigned = await sp.transaction((ap) => autoAssignNewTicket(ap, { ticketId: t.ticketId, organizationId, source: "form" })).catch((e: unknown) => {
            logger.warn({ ticketId: t.ticketId, err: e instanceof Error ? e.message : String(e) }, "support.auto_assign_failed");
            return null;
          });
          await auditTicket(sp, {
            organizationId,
            actor: { kind: "system", name: "contact_form" },
            action: SUPPORT_AUDIT_ACTIONS.create,
            ticketId: t.ticketId,
            diff: {
              number: t.number,
              channel: "form",
              kind: parsed.data.kind,
              category: parsed.data.topic ?? parsed.data.kind,
              locale: parsed.data.locale,
              bodyLength: parsed.data.message.length,
              signedIn: Boolean(session),
              slaPolicyId: t.sla.policyId,
              autoAssignStrategy: assigned?.strategy ?? null,
              autoAssigneeUserId: assigned?.assigneeUserId ?? null,
              autoAssignCandidates: assigned?.candidates ?? null,
            },
            requestId: null,
          });
          return { ticketId: t.ticketId, number: t.number };
        });
      } catch (err) {
        if (pgErrorCode(err) !== "42P01") throw err;
        logger.warn("support tables missing: contact request stored without a ticket (apply migration 0015_support_desk)");
      }
      const [row] = await tx
        .insert(contactRequests)
        .values({ kind: parsed.data.kind, name: parsed.data.name, email: parsed.data.email, company: parsed.data.company ?? null, message, locale: parsed.data.locale, organizationId: session?.activeOrganizationId ?? null, userId: session?.user.id ?? null, ticketId: created?.ticketId ?? null, ipHash, uaFamily: uaFamily(h.get("user-agent")) })
        .returning({ id: contactRequests.id });
      return { id: row!.id, ticket: created };
    });
    id = result.id;
    ticket = result.ticket;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "contact.persist_failed");
    return { ok: false, error: "generic" };
  }

  if (ticket) {
    const settings = await loadPortalSettings().catch(() => null);
    if (settings) {
      const ack = await sendTicketAcknowledgement({ id: ticket.ticketId, number: ticket.number, subject, requesterEmail: parsed.data.email, requesterName: parsed.data.name, locale: parsed.data.locale }, settings);
      if (ack && !ack.ok) logger.warn({ ticketId: ticket.ticketId, transport: ack.transport, err: ack.error }, "contact.acknowledgement_failed");
    }
  }

  const inbox = env().CONTACT_INBOX_EMAIL;
  if (inbox) {
    const reference = ticket ? `Ticket: #${ticket.number} (${ticket.ticketId})\nRequest: ${id}` : `Request: ${id}`;
    const result = await sendMail({ to: inbox, subject: `[Track ${parsed.data.kind}]${ticket ? ` [Track #${ticket.number}]` : ""} ${parsed.data.name}${parsed.data.company ? ` (${parsed.data.company})` : ""}`, text: `${message}\n\nFrom: ${parsed.data.name} <${parsed.data.email}>\nLocale: ${parsed.data.locale}\n${reference}`, replyTo: parsed.data.email }).catch((err: unknown) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }) as { ok: false; error: string });
    await db()
      .update(contactRequests)
      .set(result.ok ? { deliveredAt: new Date() } : { deliveryError: String(("error" in result && result.error) || "send failed").slice(0, 300) })
      .where(eq(contactRequests.id, id));
  }
  return { ok: true, error: null };
}
