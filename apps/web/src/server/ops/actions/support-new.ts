"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SUPPORT_TICKET_PRIORITIES } from "@track-site/db";
import { SUPPORT_CATEGORIES } from "@/components/app/support/constants";
import {
  AGENT_TICKET_BODY_MAX,
  AGENT_TICKET_BODY_MIN,
  AGENT_TICKET_SUBJECT_MAX,
  AGENT_TICKET_SUBJECT_MIN,
  REQUESTER_MODES,
  REQUESTER_NAME_MAX,
  REQUESTER_SEARCH_MAX,
  REQUESTER_SEARCH_MIN,
} from "@/components/ops/support/new/constants";
import { ACTIVE_LOCALES, type AppLocale } from "@/i18n/routing";
import { PlatformAccessError, platformCan, requirePlatform, withPlatform, type PlatformContext } from "@/server/ops/platform";
import { AgentTicketError, createAgentTicket, resolveRequester, searchRequesters, sendAgentTicketMessage, type RequesterSearch } from "@/server/support/agent-tickets";
import { loadMacroForUse } from "@/server/support/macros";
import { fanOutAfterMutation } from "@/server/support/notifications";
import { normalizeTags } from "@/server/support/views";

/**
 * Console → Support → "New ticket" (docs/18 §"Agent-created tickets and teams", task N). Both actions resolve
 * the operator with `requirePlatform("PLATFORM_SUPPORT", "platform.tickets.write")`; the creation validates
 * with zod, runs as `tracksite_ops` and writes its `auditPlatform` entry in the same transaction
 * (`createAgentTicket`); the requester search is a read of display data (organisation names, member names
 * and addresses) and audits nothing. "Assign to me" additionally needs `platform.tickets.assign`.
 */

export type NewTicketError = "forbidden" | "invalid" | "invalid_requester" | "invalid_team" | "invalid_macro" | "generic";

export interface NewTicketActionState {
  ok: boolean;
  error: NewTicketError | null;
  fieldErrors?: Record<string, string>;
  /** the created ticket */
  ticketId?: string;
  number?: number;
  /** the opening mail was handed to a transport (`sendToCustomer` only) */
  sent?: boolean;
  /** the transport refused the opening mail: the ticket exists, the message is `failed` with "Send again" on the ticket page */
  mailFailed?: boolean;
}

export interface RequesterSearchState {
  ok: boolean;
  error: "forbidden" | "invalid" | "generic" | null;
  results: RequesterSearch;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const EMPTY: RequesterSearch = { organisations: [], members: [] };

const fail = (error: NewTicketError, fieldErrors?: Record<string, string>): NewTicketActionState => ({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) });

async function operator(): Promise<PlatformContext | null> {
  try {
    return await requirePlatform("PLATFORM_SUPPORT", "platform.tickets.write");
  } catch (e) {
    if (e instanceof PlatformAccessError) return null;
    throw e;
  }
}

const str = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

/** Organisations and members matching `query` (name, slug, e-mail) for the requester picker. */
export async function searchRequestersAction(query: string): Promise<RequesterSearchState> {
  const ctx = await operator();
  if (!ctx) return { ok: false, error: "forbidden", results: EMPTY };
  const parsed = z.string().trim().min(REQUESTER_SEARCH_MIN).max(REQUESTER_SEARCH_MAX).safeParse(query);
  if (!parsed.success) return { ok: false, error: "invalid", results: EMPTY };
  const results = await withPlatform(ctx, (tx) => searchRequesters(tx, parsed.data));
  return { ok: true, error: null, results };
}

const formSchema = z.object({
  requesterMode: z.enum(REQUESTER_MODES),
  requesterUserId: uuid.optional(),
  requesterOrganizationId: uuid.optional(),
  requesterEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  requesterName: z.string().trim().max(REQUESTER_NAME_MAX),
  subject: z.string().trim().min(AGENT_TICKET_SUBJECT_MIN).max(AGENT_TICKET_SUBJECT_MAX),
  body: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim())
    .pipe(z.string().min(AGENT_TICKET_BODY_MIN).max(AGENT_TICKET_BODY_MAX)),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
  category: z.enum(SUPPORT_CATEGORIES).nullable(),
  tags: z.string().max(400),
  teamId: uuid.nullable(),
  locale: z.enum(ACTIVE_LOCALES as unknown as [AppLocale, ...AppLocale[]]),
  macroId: uuid.nullable(),
});

/**
 * Creates the ticket. Fields: `requesterMode` (`member` with `requesterUserId` + `requesterOrganizationId`,
 * or `email` with `requesterEmail` + `requesterName`), `subject`, `body` (the composer's Markdown subset),
 * `priority`, `category`, `tags` (comma-separated), `teamId` (empty = no team), `assignToMe`,
 * `sendToCustomer`, `locale`, `macroId`. On success the state carries the ticket id and number (the form
 * navigates to the ticket); a refused opening mail is reported honestly (`mailFailed`) — the ticket exists.
 */
export async function createAgentTicketAction(_prev: NewTicketActionState, formData: FormData): Promise<NewTicketActionState> {
  const ctx = await operator();
  if (!ctx) return fail("forbidden");
  const assignToMe = str(formData, "assignToMe") === "on";
  const sendToCustomer = str(formData, "sendToCustomer") === "on";
  if (assignToMe && !platformCan(ctx, "platform.tickets.assign")) return fail("forbidden");
  const parsed = formSchema.safeParse({
    requesterMode: str(formData, "requesterMode") || "email",
    requesterUserId: str(formData, "requesterUserId") || undefined,
    requesterOrganizationId: str(formData, "requesterOrganizationId") || undefined,
    requesterEmail: str(formData, "requesterEmail") || undefined,
    requesterName: str(formData, "requesterName"),
    subject: str(formData, "subject"),
    body: str(formData, "body"),
    priority: str(formData, "priority") || "normal",
    category: str(formData, "category") || null,
    tags: str(formData, "tags"),
    teamId: str(formData, "teamId") || null,
    locale: str(formData, "locale") || "en",
    macroId: str(formData, "macroId") || null,
  });
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] = field === "requesterEmail" ? "email" : issue.code === "too_big" ? "too_long" : issue.code === "too_small" ? "required" : "invalid";
    }
    return fail("invalid", fieldErrors);
  }
  const data = parsed.data;
  if (data.requesterMode === "member" && (!data.requesterUserId || !data.requesterOrganizationId)) return fail("invalid", { requester: "required" });
  if (data.requesterMode === "email" && !data.requesterEmail) return fail("invalid", { requesterEmail: "required" });
  const tags = normalizeTags(data.tags.split(/[,\n]/));
  const now = new Date();

  const stored = await withPlatform(ctx, async (tx): Promise<NewTicketActionState | { ticketId: string; number: number; messageId: string; sendToCustomer: boolean }> => {
    const requester = await resolveRequester(
      tx,
      data.requesterMode === "member" ? { mode: "member", userId: data.requesterUserId!, organizationId: data.requesterOrganizationId! } : { mode: "email", email: data.requesterEmail!, name: data.requesterName || null },
    );
    if (!requester) return fail("invalid_requester", { requester: "invalid" });
    if (data.macroId) {
      const macro = await loadMacroForUse(tx, data.macroId, { id: ctx.user.id });
      if (!macro) return fail("invalid_macro", { macroId: "invalid" });
    }
    try {
      const result = await createAgentTicket(tx, ctx, {
        requester,
        subject: data.subject,
        body: data.body,
        priority: data.priority,
        category: data.category,
        tags,
        teamId: data.teamId,
        assignToMe,
        sendToCustomer,
        locale: data.locale,
        macroId: data.macroId,
        now,
      });
      return { ticketId: result.ticketId, number: result.number, messageId: result.messageId, sendToCustomer: result.sendToCustomer };
    } catch (e) {
      if (e instanceof AgentTicketError) return fail(e.code === "invalid_team" ? "invalid_team" : "invalid_requester", e.code === "invalid_team" ? { teamId: "invalid" } : { requester: "invalid" });
      throw e;
    }
  });
  if ("ok" in stored) return stored;
  revalidatePath("/ops/support");
  revalidatePath(`/ops/support/${stored.ticketId}`);
  // an assignment or a note may concern a colleague: materialise the notifications now, not on the next poll
  await fanOutAfterMutation((fn) => withPlatform(ctx, fn), now);
  if (!stored.sendToCustomer) return { ok: true, error: null, ticketId: stored.ticketId, number: stored.number, sent: false };
  const delivery = await sendAgentTicketMessage(ctx, stored.messageId);
  return { ok: true, error: null, ticketId: stored.ticketId, number: stored.number, sent: delivery.sent, mailFailed: !delivery.sent };
}
