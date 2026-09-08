"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTACT_REQUEST_STATUSES, contactRequests, user, type ContactRequestStatus } from "@track-site/db";
import { env } from "@/env";
import { logger } from "@/server/db";
import { sendMail, type MailResult } from "@/server/mail";
import { getMailCopy, renderMail } from "@/server/mail/templates";
import { CONFIRMED_TRANSITIONS, canTransition, contactReference, getContactRequestRow } from "@/server/ops/inbox";
import { PlatformAccessError, auditPlatform, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";

/**
 * Track Operations → Inbox mutations (docs/17 §1 product rules). Every action resolves the operator with
 * `requirePlatform`, validates its input with zod, runs as `tracksite_ops` and writes an `auditPlatform`
 * entry (actor kind `platform`, target `contact_request`) inside the same transaction. Contact requests are
 * global by design (public forms), so `organization_id` of the audit entry stays null; the organisation the
 * requester was signed in to — when there is one — is recorded in the metadata instead. Marking a request as
 * spam hides it from the default view and therefore needs the `confirmed` literal that the confirmation
 * dialog sends; a reply is confirmed the same way because it sends an e-mail on Track's behalf.
 */

const PATH = "/ops/inbox";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export type InboxActionError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "unchanged"
  | "invalid_transition"
  | "confirmation_required"
  | "invalid_assignee"
  | "mail_failed"
  | "generic";

export interface InboxActionResult {
  ok: boolean;
  error: InboxActionError | null;
}

export interface ReplyState extends InboxActionResult {
  /** transport that accepted the e-mail (`smtp`, `resend`, `file`) */
  transport: string | null;
  fieldErrors?: Record<string, string>;
}

async function contextOr(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_SUPPORT");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

function revalidate(requestId: string): void {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${requestId}`);
}

/**
 * Moves a request along the inbox workflow (`CONTACT_TRANSITIONS`); `done` and `spam` stamp `handled_at`,
 * reopening clears it. Spam requires `confirmed: true` (confirmation dialog in the UI).
 */
export async function setContactStatusAction(input: {
  requestId: string;
  status: ContactRequestStatus;
  confirmed?: boolean;
}): Promise<InboxActionResult> {
  const ctx = await contextOr();
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z
    .object({ requestId: uuid, status: z.enum(CONTACT_REQUEST_STATUSES), confirmed: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { requestId, status, confirmed } = parsed.data;
  if (CONFIRMED_TRANSITIONS.includes(status) && confirmed !== true) return { ok: false, error: "confirmation_required" };
  const result = await withPlatform(ctx, async (tx): Promise<InboxActionResult> => {
    const row = await getContactRequestRow(tx, requestId);
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === status) return { ok: false, error: "unchanged" };
    if (!canTransition(row.status, status)) return { ok: false, error: "invalid_transition" };
    const closing = status === "done" || status === "spam";
    await tx
      .update(contactRequests)
      .set({ status, handledAt: closing ? new Date() : null })
      .where(eq(contactRequests.id, row.id));
    await auditPlatform(
      ctx,
      {
        action: "platform.contact_request.status",
        targetType: "contact_request",
        targetId: row.id,
        diff: { from: row.status, to: status, kind: row.kind },
        metadata: { linkedOrganizationId: row.organizationId ?? null, confirmed: confirmed === true },
      },
      tx,
    );
    return { ok: true, error: null };
  });
  if (result.ok) revalidate(requestId);
  return result;
}

/** Assigns a request to a platform operator (or clears the assignee); the assignee must hold a platform role. */
export async function assignContactAction(input: {
  requestId: string;
  assigneeUserId: string | null;
}): Promise<InboxActionResult> {
  const ctx = await contextOr();
  if (!ctx) return { ok: false, error: "forbidden" };
  const parsed = z.object({ requestId: uuid, assigneeUserId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { requestId, assigneeUserId } = parsed.data;
  const result = await withPlatform(ctx, async (tx): Promise<InboxActionResult> => {
    const row = await getContactRequestRow(tx, requestId);
    if (!row) return { ok: false, error: "not_found" };
    if ((row.assigneeUserId ?? null) === assigneeUserId) return { ok: false, error: "unchanged" };
    if (assigneeUserId) {
      const [operator] = await tx
        .select({ id: user.id, platformRole: user.platformRole })
        .from(user)
        .where(eq(user.id, assigneeUserId))
        .limit(1);
      if (!operator || (operator.platformRole !== "PLATFORM_SUPPORT" && operator.platformRole !== "PLATFORM_ADMIN"))
        return { ok: false, error: "invalid_assignee" };
    }
    await tx.update(contactRequests).set({ assigneeUserId }).where(eq(contactRequests.id, row.id));
    await auditPlatform(
      ctx,
      {
        action: "platform.contact_request.assign",
        targetType: "contact_request",
        targetId: row.id,
        diff: { from: row.assigneeUserId ?? null, to: assigneeUserId, self: assigneeUserId === ctx.user.id },
        metadata: { linkedOrganizationId: row.organizationId ?? null },
      },
      tx,
    );
    return { ok: true, error: null };
  });
  if (result.ok) revalidate(requestId);
  return result;
}

const replySchema = z.object({
  requestId: uuid,
  body: z.string().trim().min(10).max(4000),
  confirmed: z.literal("true"),
});

/**
 * Replies to the requester by e-mail through the mail module: the template of the requester's language
 * wraps the operator's free text (greeting, signature with the operator's display name, reference). The
 * outcome is audited whether or not the transport accepted the mail; a delivered reply moves a `new`
 * request to `in_progress` and assigns it to the replying operator when nobody holds it yet.
 */
export async function replyContactAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const ctx = await contextOr();
  if (!ctx) return { ok: false, error: "forbidden", transport: null };
  const parsed = replySchema.safeParse({
    requestId: str(formData, "requestId"),
    body: str(formData, "body"),
    confirmed: str(formData, "confirmed"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] = "invalid";
    if (fieldErrors.confirmed) return { ok: false, error: "confirmation_required", transport: null };
    return { ok: false, error: "invalid", transport: null, fieldErrors };
  }
  const { requestId, body } = parsed.data;
  const row = await withPlatform(ctx, (tx) => getContactRequestRow(tx, requestId));
  if (!row) return { ok: false, error: "not_found", transport: null };
  if (row.status === "spam") return { ok: false, error: "invalid_transition", transport: null };

  const reference = contactReference(row.id);
  const mail = renderMail(getMailCopy(row.locale).contactReply, {
    name: row.name,
    body,
    operator: ctx.user.name,
    reference,
  });
  const inbox = env().CONTACT_INBOX_EMAIL;
  const sent = await sendMail({ to: row.email, subject: mail.subject, text: mail.text, replyTo: inbox || undefined }).catch(
    (err: unknown): MailResult => ({ ok: false, transport: "none", error: err instanceof Error ? err.message : "send failed" }),
  );
  if (!sent.ok) logger.warn({ requestId: row.id, transport: sent.transport, err: sent.error }, "ops inbox reply failed");

  const statusTo: ContactRequestStatus = sent.ok && row.status === "new" ? "in_progress" : row.status;
  const assigned = sent.ok && !row.assigneeUserId;
  await withPlatform(ctx, async (tx) => {
    if (statusTo !== row.status || assigned)
      await tx
        .update(contactRequests)
        .set({ status: statusTo, ...(assigned ? { assigneeUserId: ctx.user.id } : {}) })
        .where(eq(contactRequests.id, row.id));
    await auditPlatform(
      ctx,
      {
        action: "platform.contact_request.reply",
        targetType: "contact_request",
        targetId: row.id,
        // never the body: its length, the language and the transport outcome are enough for the trail
        diff: {
          ok: sent.ok,
          transport: sent.transport,
          error: sent.ok ? null : (sent.error ?? "send failed").slice(0, 200),
          locale: row.locale,
          bodyLength: body.length,
          reference,
          statusFrom: row.status,
          statusTo,
          assignedToSelf: assigned,
        },
        metadata: { linkedOrganizationId: row.organizationId ?? null, mailId: sent.ok ? (sent.id ?? null) : null },
      },
      tx,
    );
  });
  revalidate(row.id);
  return sent.ok ? { ok: true, error: null, transport: sent.transport } : { ok: false, error: "mail_failed", transport: sent.transport };
}
