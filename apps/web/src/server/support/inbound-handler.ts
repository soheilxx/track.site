import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  member,
  pgErrorCode,
  pgErrorConstraint,
  subscriptions,
  supportAttachments,
  supportEvents,
  supportInboundEvents,
  supportMessages,
  supportSettings,
  supportSlaPolicies,
  supportTickets,
  user,
  withWorker,
  type Db,
  type SlaPriorityTargets,
  type SupportAuthorKind,
  type SupportBusinessHours,
  type SupportDeliveryStatus,
  type SupportEventKind,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type Tx,
} from "@track-site/db";
import { env } from "@/env";
import type { AppLocale } from "@/i18n/routing";
import { pick } from "@/lib/marketing-copy/pick";
import type { LocalizedCopy } from "@/lib/marketing-copy/types";
import { db, logger } from "@/server/db";
import { autoAssignNewTicket } from "@/server/support/auto-assign";
import {
  ATTACHMENT_MAX_BYTES,
  createResendReceivingClient,
  detectAutoReply,
  detectInboundLocale,
  htmlToText,
  isOwnAddress,
  mergeReceivedEmail,
  noopAttachmentScanner,
  routeInbound,
  sanitizeHtml,
  screenAttachments,
  senderAuthentication,
  spamVerdict,
  type AttachmentRejection,
  type AttachmentScanner,
  type InboundAddress,
  type InboundAttachmentMeta,
  type InboundEmail,
  type InboundLocaleSource,
  type InboundRoute,
  type ResendReceivingClient,
} from "./inbound";
import { sendTicketMail, supportMailSettings, ticketMessageId, ticketSubject, type SupportMailSettings, type TicketMailInput, type TicketMailResult } from "./mail";
import { applyFirstCustomerReply } from "./first-customer-reply";
import { computeClockStart, statusTransition, withDeskBusinessHours } from "./sla";

/**
 * Inbound e-mail processing of the support desk (docs/18-support-desk.md §4 "Inbound", task T3).
 *
 * `handleInboundEvent(email, deps)` is what the webhook route and the development fixture call once the
 * signature is verified and the payload parsed:
 *
 *   ledger (`support_inbound_events`, idempotent by provider event id) → own-address loop guard → bodies and
 *   headers from the receiving API when the event carried none → auto-reply / spam verdicts and the sender
 *   authentication, both read from the receiving MTA's `Authentication-Results` only (`trustedAuthservIds`,
 *   `SUPPORT_AUTHSERV_ID`) → routing (`routeInbound`) with the reply guard → sanitised bodies, screened +
 *   scanned attachments → append to the ticket (reopening a solved / closed one, un-pausing a pending one) or
 *   create a new ticket (requester → user → memberships, linked only for an authenticated From; locale
 *   detection, SLA due times from the matching policy) → optional auto-acknowledgement (`AckSkipReason`,
 *   incl. the per-sender cap) → ledger row `processed` / `ignored` / `failed`.
 *
 * A retried delivery of a mail an earlier attempt already stored (the failure came after the commit — the
 * acknowledgement, its delivery update or the ledger) is recognised by `provider_message_id`
 * (`findInboundMessage`) and answered with the stored ticket (`route: "stored"`, `created: false`): never a
 * second ticket or message for the same e-mail; two *concurrent* deliveries of one mail are serialised by the
 * store (`InboundAlreadyStoredError`) with the same answer. The acknowledgement block is fenced on its own — a
 * failure there is recorded as `ackError`, the event still counts as processed.
 *
 * Persistence goes through the `InboundStore` contract so the pipeline is unit-tested against an in-memory
 * store; `createDrizzleInboundStore` is the production implementation. It runs as `tracksite_worker`
 * (`withWorker`, BYPASSRLS): the webhook has no operator and no tenant session — it is system processing like
 * the worker jobs — and the ticket rows it writes carry the organisation id the RLS policies scope on. No
 * message body ever reaches an event payload, the ledger or a log line.
 */

export const DO_NOT_EMAIL_TAG = "do-not-email";
/** a ledger row still `received` after this long is treated as abandoned and reprocessed on retry */
export const INBOUND_EVENT_STALE_MS = 10 * 60_000;
/** sanitised HTML above this size loses its inline (`data:`) images; above it again, the text body stands alone */
export const HTML_BODY_MAX_CHARS = 1_000_000;
/** at most this many automatic acknowledgements per sender address within `ACK_WINDOW_MS` — the mail-loop cap (docs/18 §4 step 10) */
export const ACK_MAX_PER_SENDER = 3;
export const ACK_WINDOW_MS = 24 * 3_600_000;
/** authserv-id the development fixture writes into `Authentication-Results`; the fixture route alone trusts it */
export const FIXTURE_AUTHSERV_ID = "fixture";

/** `SUPPORT_AUTHSERV_ID` (`env.ts`; one id or a comma-separated list) → lower-cased authserv-ids; unset → nothing is trusted (docs/18 §5). */
export function trustedAuthservIdsFromEnv(value: string | null | undefined = env().SUPPORT_AUTHSERV_ID): string[] {
  return Array.from(new Set((value ?? "").split(/[\s,;]+/).map((v) => v.trim().toLowerCase()).filter(Boolean)));
}

// ---------------------------------------------------------------------------------------------------
// Store contract
// ---------------------------------------------------------------------------------------------------

export type LedgerBegin = "new" | "retry" | "duplicate" | "in_progress";

export interface LedgerFinish {
  status: "processed" | "ignored" | "failed";
  ticketId?: string | null;
  error?: string | null;
}

/**
 * The idempotency ledger (`support_inbound_events`); shared by the inbound and the delivery handlers. The
 * inbound handler hands `payload` (`ledgerPayloadOf`: ids, addresses, subject, headers, attachment names —
 * never bodies) to `beginEvent`, so a failed row can be reprocessed from the console (docs/18 §"Hardening").
 */
export interface InboundLedger {
  beginEvent(providerEventId: string, provider: string, now: Date, payload?: InboundLedgerPayload | null): Promise<LedgerBegin>;
  finishEvent(providerEventId: string, patch: LedgerFinish, now: Date): Promise<void>;
}

export interface InboundSettings {
  mail: SupportMailSettings;
  autoReplyEnabled: boolean;
}

export interface SenderFlags {
  /** an agent moved a ticket of this sender to spam (never the handler's own spam verdict) — further mails land as spam tickets */
  blocked: boolean;
  /** the sender complained about a ticket mail (`do-not-email` tag) — never mail them automatically again */
  doNotEmail: boolean;
}

export interface RequesterMatch {
  userId: string | null;
  name: string | null;
  locale: string | null;
  /** the sender's organisation when exactly one membership exists, else null */
  organizationId: string | null;
  membershipCount: number;
}

export interface InboundTicket {
  id: string;
  number: number;
  status: SupportTicketStatus;
  subject: string;
  requesterEmail: string;
  requesterName: string | null;
  organizationId: string | null;
  locale: string;
  tags: string[];
  reopenCount: number;
  /** the SLA clock columns the engine's `statusTransition` reads on a reopen or a resume (never rendered) */
  priority: SupportTicketPriority;
  slaPolicyId: string | null;
  pausedAt: Date | null;
  pauseTotalMs: number;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  /** lower-cased addresses that took part in the conversation so far (from / to / cc of non-note messages) */
  participants: string[];
}

export interface SlaPolicyMatch {
  id: string;
  priorities: SlaPriorityTargets;
  businessHours: SupportBusinessHours;
}

/** An inbound message an earlier delivery attempt of the same e-mail already stored (`provider_message_id`). */
export interface StoredInboundMatch {
  ticketId: string;
  ticketNumber: number;
  messageRowId: string;
  status: SupportTicketStatus;
  locale: string;
  organizationId: string | null;
}

export interface StoredMessageInput {
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  textBody: string;
  /** already sanitised (`sanitizeHtml`) — never raw provider HTML */
  htmlBody: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  providerMessageId: string | null;
  createdAt: Date;
}

export interface StoredAttachmentInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
}

/** Timeline entry; the store adds `messageId` (the row id of the stored message) to every payload. */
export interface EventInput {
  kind: SupportEventKind;
  actorKind: SupportAuthorKind;
  payload: Record<string, unknown>;
}

export interface CreateTicketInput {
  requesterEmail: string;
  requesterName: string | null;
  requesterUserId: string | null;
  organizationId: string | null;
  subject: string;
  status: Extract<SupportTicketStatus, "new" | "spam">;
  priority: SupportTicketPriority;
  locale: AppLocale;
  slaPolicyId: string | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  /** the persisted clock run (0018): the start (= `receivedAt`) and the booked targets in business milliseconds */
  slaClockStartedAt: Date;
  firstResponseTargetMs: number | null;
  resolutionTargetMs: number | null;
  message: StoredMessageInput;
  attachments: StoredAttachmentInput[];
  events: EventInput[];
  /** internal note (agent-only) next to the message, e.g. refused attachments */
  systemNote: string | null;
}

/** Column patch of a reply: the engine's SLA patch (`SlaTicketPatch`) plus `reopen_count` and the message stamp. */
export interface TicketPatch {
  status?: SupportTicketStatus;
  reopenCount?: number;
  pausedAt?: Date | null;
  pauseTotalMs?: number;
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  breachedFirstResponse?: boolean;
  breachedResolution?: boolean;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  slaClockStartedAt?: Date | null;
  firstResponseTargetMs?: number | null;
  resolutionTargetMs?: number | null;
  lastCustomerMessageAt: Date;
}

export interface AppendMessageInput {
  ticketId: string;
  message: StoredMessageInput;
  attachments: StoredAttachmentInput[];
  patch: TicketPatch;
  events: EventInput[];
  systemNote: string | null;
  /**
   * A customer reply that may start the clocks of an agent-created ticket (docs/18 §"Agent-created tickets
   * and teams"): the store calls `applyFirstCustomerReply` after the patch — a no-op for every other ticket.
   * False for a spam-verdict reply, which never moves a ticket.
   */
  firstCustomerReply?: boolean;
}

export interface OutboundSystemMessageInput {
  ticketId: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  createdAt: Date;
}

export interface DeliveryPatch {
  deliveryStatus: SupportDeliveryStatus;
  providerMessageId?: string | null;
  deliveryError?: string | null;
}

/** A ticket found through threading ids; `direction` says which row matched — see `replyGuard`. */
export interface ThreadMatch {
  ticketId: string;
  /** `outbound`: one of the desk's own Message-IDs (ULID, unguessable); `inbound`: a customer-supplied id */
  direction: "outbound" | "inbound";
}

/**
 * Thrown by `createTicket` / `appendMessage` when the mail's `provider_message_id` is already stored: the store
 * serialises concurrent deliveries of one mail (two webhook ids for one `email_id`) and the loser finds the
 * winner's row. The handler answers with the stored ticket (`route: "stored"`) instead of a second one.
 */
export class InboundAlreadyStoredError extends Error {
  readonly match: StoredInboundMatch;
  constructor(match: StoredInboundMatch) {
    super(`inbound mail already stored on ticket ${match.ticketId}`);
    this.name = "InboundAlreadyStoredError";
    this.match = match;
  }
}

export interface InboundStore extends InboundLedger {
  loadSettings(): Promise<InboundSettings>;
  senderFlags(email: string): Promise<SenderFlags>;
  /** automatic acknowledgements (outbound, `author_kind = system`) sent to the address since `since` — the loop cap */
  countRecentAcknowledgements(email: string, since: Date): Promise<number>;
  findTicketByNumber(number: number): Promise<{ ticketId: string } | null>;
  /** the ticket owning a stored message whose `message_id` / `provider_message_id` is among `ids`; outbound rows win, then the oldest */
  findTicketByMessageIds(ids: string[]): Promise<ThreadMatch | null>;
  /** the inbound row (direction `inbound`) whose `provider_message_id` is the mail's own id — a retried delivery */
  findInboundMessage(providerMessageId: string): Promise<StoredInboundMatch | null>;
  /** the ticket, following a merge one hop; `participants` then include the merged-away ticket's requester and correspondents */
  getTicket(ticketId: string): Promise<InboundTicket | null>;
  resolveRequester(email: string): Promise<RequesterMatch>;
  /** the policy of a new ticket: the organisation's plan first, then the desk default */
  selectSlaPolicy(organizationId: string | null): Promise<SlaPolicyMatch | null>;
  /** an existing ticket's own policy (`sla_policy_id`) for the engine's transition on a reply; null when deleted */
  getSlaPolicy(policyId: string): Promise<SlaPolicyMatch | null>;
  createTicket(input: CreateTicketInput): Promise<{ ticketId: string; number: number; messageRowId: string }>;
  appendMessage(input: AppendMessageInput): Promise<{ messageRowId: string }>;
  insertOutboundSystemMessage(input: OutboundSystemMessageInput): Promise<{ messageRowId: string }>;
  updateDelivery(messageRowId: string, patch: DeliveryPatch): Promise<void>;
}

export interface InboundLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface InboundDeps {
  store: InboundStore;
  /** receiving API for bodies and attachment bytes; null when the event already carries them (fixture, tests) */
  receiving: ResendReceivingClient | null;
  scanner?: AttachmentScanner;
  sendMail?: (input: TicketMailInput) => Promise<TicketMailResult>;
  /** authserv-ids whose `Authentication-Results` count (`SUPPORT_AUTHSERV_ID`); default none — every mail is then unauthenticated */
  trustedAuthservIds?: readonly string[];
  now?: () => Date;
  log?: InboundLog;
}

// ---------------------------------------------------------------------------------------------------
// Ledger payload (reprocessing from the console; docs/18 §"Hardening")
// ---------------------------------------------------------------------------------------------------

export const INBOUND_LEDGER_PAYLOAD_VERSION = 1;
/** headers above this JSON size are dropped from the ledger row (the receiving API restores them on reprocess) */
export const INBOUND_LEDGER_HEADERS_MAX_CHARS = 64_000;

const addressSchema = z.object({ email: z.string().min(3).max(320), name: z.string().max(998).nullable() });

const ledgerPayloadSchema = z.object({
  v: z.literal(INBOUND_LEDGER_PAYLOAD_VERSION),
  provider: z.literal("resend"),
  providerMessageId: z.string().min(1).max(200),
  from: addressSchema,
  to: z.array(addressSchema).max(100),
  cc: z.array(addressSchema).max(100),
  subject: z.string().max(998),
  messageId: z.string().max(998).nullable(),
  inReplyTo: z.string().max(998).nullable(),
  references: z.array(z.string().max(998)).max(200),
  headers: z.record(z.string().max(200), z.string().max(64_000)),
  headersDropped: z.boolean(),
  attachments: z
    .array(
      z.object({
        providerId: z.string().max(200).nullable(),
        fileName: z.string().max(255),
        contentType: z.string().max(120),
        sizeBytes: z.number().int().nonnegative().nullable(),
        contentId: z.string().max(998).nullable(),
        inline: z.boolean(),
      }),
    )
    .max(100),
  receivedAt: z.string().max(40),
});

/**
 * What the ledger row keeps of an `email.received` event: everything the handler needs to run the mail again
 * — ids, addresses, subject, threading ids, headers, attachment names and sizes — and nothing a body could be
 * reconstructed from. `text`, `html` and attachment bytes are never stored; a reprocess fetches them from the
 * receiving API like a first delivery does (`processInboundEmail`).
 */
export type InboundLedgerPayload = z.infer<typeof ledgerPayloadSchema>;

/** The ledger payload of a parsed mail (no bodies, no bytes, no signed download links). */
export function ledgerPayloadOf(email: InboundEmail): InboundLedgerPayload {
  const headersJson = JSON.stringify(email.headers ?? {});
  const headersDropped = headersJson.length > INBOUND_LEDGER_HEADERS_MAX_CHARS;
  const address = (a: InboundAddress): InboundAddress => ({ email: a.email, name: a.name ?? null });
  return {
    v: INBOUND_LEDGER_PAYLOAD_VERSION,
    provider: email.provider,
    providerMessageId: email.providerMessageId,
    from: address(email.from),
    to: email.to.map(address),
    cc: email.cc.map(address),
    subject: email.subject,
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    references: [...email.references],
    headers: headersDropped ? {} : { ...email.headers },
    headersDropped,
    attachments: email.attachments.map((a) => ({ providerId: a.providerId, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes, contentId: a.contentId, inline: a.inline })),
    receivedAt: email.receivedAt.toISOString(),
  };
}

/**
 * The mail of a stored ledger payload for a reprocess (`providerEventId` = the ledger row's own event id, so
 * the ledger treats the run as the retry of that delivery); null when the stored value is not a payload this
 * code wrote (a delivery event's row, a row from before the column, foreign JSON). Bodies come back as null —
 * the handler asks the receiving API — and attachments carry no bytes and no download link.
 */
export function inboundEmailFromLedgerPayload(raw: unknown, providerEventId: string): InboundEmail | null {
  const parsed = ledgerPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const receivedAt = new Date(p.receivedAt);
  if (Number.isNaN(receivedAt.getTime())) return null;
  return {
    provider: p.provider,
    providerEventId,
    providerMessageId: p.providerMessageId,
    from: p.from,
    to: p.to,
    cc: p.cc,
    subject: p.subject,
    messageId: p.messageId,
    inReplyTo: p.inReplyTo,
    references: p.references,
    headers: p.headers,
    text: null,
    html: null,
    attachments: p.attachments.map((a) => ({ ...a, downloadUrl: null })),
    receivedAt,
  };
}

// ---------------------------------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------------------------------

export type InboundAttachmentRejection = AttachmentRejection | "download_failed" | "scanner_rejected";

export interface InboundAttachmentSummary {
  stored: number;
  rejected: Array<{ fileName: string; reason: InboundAttachmentRejection }>;
}

/**
 * Why a new ticket got no automatic acknowledgement (docs/18 §4 step 10): `spam`, the switch (`disabled`), an
 * automatic sender (`auto_reply`), `X-Auto-Response-Suppress` (`suppressed`), the requester's `do-not-email`
 * flag, a known member's address without aligned authentication (`unauthenticated` — never mail a possibly
 * impersonated member), or more than `ACK_MAX_PER_SENDER` acknowledgements to the address within
 * `ACK_WINDOW_MS` (`rate_limited` — an auto-responder that strips every loop header still runs dry).
 */
export type AckSkipReason = "spam" | "disabled" | "auto_reply" | "suppressed" | "do_not_email" | "unauthenticated" | "rate_limited";

export type InboundProcessed = {
  status: "processed";
  ticketId: string;
  ticketNumber: number;
  messageRowId: string;
  created: boolean;
  reopened: boolean;
  spam: boolean;
  acknowledged: boolean;
  ackError: string | null;
  /** new tickets only: why no acknowledgement was attempted; null when one was (or for replies / stored mails) */
  ackSkipped: AckSkipReason | null;
  /** `stored`: the mail was already stored by an earlier delivery attempt — the ids are those of the stored rows, the counts are this attempt's (none) */
  route: InboundRoute["kind"] | "stored";
  via: string | null;
  locale: string;
  localeSource: InboundLocaleSource | null;
  organizationId: string | null;
  attachments: InboundAttachmentSummary;
};

export type InboundOutcome =
  | { status: "duplicate" }
  | { status: "in_progress" }
  | { status: "ignored"; reason: "own_address" }
  | { status: "failed"; error: string }
  | InboundProcessed;

// ---------------------------------------------------------------------------------------------------
// Auto-acknowledgement copy (six locales)
// ---------------------------------------------------------------------------------------------------

interface AckCopy {
  /** `{name}` */
  greeting: string;
  greetingAnonymous: string;
  /** `{number}` */
  body: string;
}

const ACK_COPY: LocalizedCopy<AckCopy> = {
  en: {
    greeting: "Hello {name},",
    greetingAnonymous: "Hello,",
    body: "thank you for your message. We have received it as ticket #{number} and will get back to you as soon as possible.\n\nYou can add details at any time by replying to this e-mail.",
  },
  de: {
    greeting: "Hallo {name},",
    greetingAnonymous: "Guten Tag,",
    body: "vielen Dank für Ihre Nachricht. Wir haben sie als Ticket #{number} erhalten und melden uns so schnell wie möglich bei Ihnen.\n\nSie können jederzeit weitere Angaben ergänzen, indem Sie auf diese E-Mail antworten.",
  },
  fr: {
    greeting: "Bonjour {name},",
    greetingAnonymous: "Bonjour,",
    body: "merci pour votre message. Nous l’avons enregistré sous le ticket n° {number} et nous vous répondrons dans les meilleurs délais.\n\nVous pouvez ajouter des précisions à tout moment en répondant à cet e-mail.",
  },
  es: {
    greeting: "Hola {name}:",
    greetingAnonymous: "Hola:",
    body: "gracias por su mensaje. Lo hemos registrado como ticket n.º {number} y le responderemos lo antes posible.\n\nPuede añadir más información en cualquier momento respondiendo a este correo.",
  },
  it: {
    greeting: "Ciao {name},",
    greetingAnonymous: "Salve,",
    body: "grazie per il messaggio. Lo abbiamo registrato come ticket n. {number} e ti risponderemo il prima possibile.\n\nPuoi aggiungere dettagli in qualsiasi momento rispondendo a questa e-mail.",
  },
  nl: {
    greeting: "Hallo {name},",
    greetingAnonymous: "Hallo,",
    body: "bedankt voor uw bericht. We hebben het geregistreerd als ticket #{number} en nemen zo snel mogelijk contact met u op.\n\nU kunt op elk moment aanvullende informatie sturen door op deze e-mail te antwoorden.",
  },
};

const fill = (s: string, values: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k]! : m));

/** Plain-text body of the acknowledgement in the requester's language (the mail layout adds the footer). */
export function acknowledgementText(locale: string, number: number, requesterName: string | null): string {
  const copy = pick(locale, ACK_COPY);
  const name = (requesterName ?? "").replace(/[\r\n]+/g, " ").trim();
  const greeting = name ? fill(copy.greeting, { name }) : copy.greetingAnonymous;
  return `${greeting}\n\n${fill(copy.body, { number: String(number) })}`;
}

// ---------------------------------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------------------------------

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Sanitised HTML within budget: over budget the inline images go, still over budget the HTML goes (text body stands alone). */
export function limitHtml(sanitized: string, max: number = HTML_BODY_MAX_CHARS): string | null {
  if (sanitized.length <= max) return sanitized;
  const withoutInline = sanitized.replace(/<img src="data:[^"]*"[^>]*>/g, "");
  return withoutInline.length <= max ? withoutInline : null;
}

/** Agent-facing note listing refused attachments — file names and reasons, never contents. */
export function attachmentsNote(rejected: InboundAttachmentSummary["rejected"]): string | null {
  if (!rejected.length) return null;
  const lines = rejected.map((r) => `- ${r.fileName} (${r.reason.replace(/_/g, " ")})`);
  return `${rejected.length} attachment${rejected.length === 1 ? "" : "s"} refused:\n${lines.join("\n")}`;
}

export type ReplyGuard = "stranger" | "unauthenticated";

/**
 * Why a routed reply is refused (null = accepted). A plus-address or subject match is accepted from the
 * requester and the conversation's participants only (`stranger` otherwise) — and only when the `From`
 * address is backed by an authenticated identity (`senderAuthentication`; `unauthenticated` otherwise):
 * ticket numbers are sequential and `From` is forgeable for any domain without a DMARC policy, so the address
 * alone would let anyone drop a message into a victim's ticket. A thread match on one of the desk's **own**
 * Message-IDs (`matched: "outbound"`, ULIDs nobody can guess) proves possession of the conversation and is
 * accepted from anyone (a cc'd colleague replying, a forwarded mail). A thread match on a **customer-supplied**
 * id (`matched: "inbound"` — a Message-ID that may sit in a mailing-list archive or a forwarded mail) proves
 * nothing: it is accepted from the ticket's **requester** only (docs/18 §"Hardening" — thread ids match the
 * desk's own outbound ids, or inbound ids of the same requester; a participant needs the plus address or the
 * subject tag), and only authenticated. Because a reply to a desk mail carries the plus address (Reply-To)
 * *and* the thread ids, `processInboundEmail` falls back to the thread ids when the plus-address / subject
 * match is refused; only then does a refused reply open a new ticket whose `created` event carries
 * `intendedTicketNumber` and `replyGuard`.
 */
export function replyGuard(ticket: Pick<InboundTicket, "requesterEmail" | "participants">, sender: string, via: Extract<InboundRoute, { kind: "reply" }>["via"], authenticated: boolean, matched?: ThreadMatch["direction"]): ReplyGuard | null {
  // only a match the store proved to be one of the desk's own outbound rows is accepted on its own; a thread
  // match of unknown direction is guarded like a customer-supplied id (fail closed)
  if (via === "thread" && matched === "outbound") return null;
  const address = sender.toLowerCase();
  const requester = ticket.requesterEmail.toLowerCase() === address;
  // a customer-supplied thread id: the same requester only — never a participant, never a stranger
  if (via === "thread" && !requester) return "stranger";
  if (!requester && !ticket.participants.includes(address)) return "stranger";
  return authenticated ? null : "unauthenticated";
}

/** `replyGuard` as a boolean. */
export function senderMayReply(ticket: Pick<InboundTicket, "requesterEmail" | "participants">, sender: string, via: Extract<InboundRoute, { kind: "reply" }>["via"], authenticated: boolean, matched?: ThreadMatch["direction"]): boolean {
  return replyGuard(ticket, sender, via, authenticated, matched) === null;
}

/** Outcome for a mail an earlier (or concurrent) delivery already stored: the stored rows, nothing new. */
function alreadyStored(stored: StoredInboundMatch, email: InboundEmail, log: InboundLog): InboundProcessed {
  log.info({ emailId: email.providerMessageId, ticketId: stored.ticketId, messageRowId: stored.messageRowId }, "support.inbound.already_stored");
  return {
    status: "processed",
    ticketId: stored.ticketId,
    ticketNumber: stored.ticketNumber,
    messageRowId: stored.messageRowId,
    created: false,
    reopened: false,
    spam: stored.status === "spam",
    acknowledged: false,
    ackError: null,
    ackSkipped: null,
    route: "stored",
    via: null,
    locale: stored.locale,
    localeSource: null,
    organizationId: stored.organizationId,
    attachments: { stored: 0, rejected: [] },
  };
}

interface AckDecisionInput {
  status: "new" | "spam";
  settings: InboundSettings;
  verdict: { auto: boolean; suppressAutoReply: boolean };
  flags: SenderFlags;
  /** the From address belongs to a known user */
  knownUser: boolean;
  authenticated: boolean;
  sender: string;
  now: Date;
  store: Pick<InboundStore, "countRecentAcknowledgements">;
}

/** The first reason not to acknowledge a new ticket, or null when the acknowledgement may go out (`AckSkipReason`). */
export async function acknowledgementSkipReason(input: AckDecisionInput): Promise<AckSkipReason | null> {
  if (input.status !== "new") return "spam";
  if (!input.settings.autoReplyEnabled) return "disabled";
  if (input.verdict.auto) return "auto_reply";
  if (input.verdict.suppressAutoReply) return "suppressed";
  if (input.flags.doNotEmail) return "do_not_email";
  if (input.knownUser && !input.authenticated) return "unauthenticated";
  const recent = await input.store.countRecentAcknowledgements(input.sender, new Date(input.now.getTime() - ACK_WINDOW_MS));
  if (recent >= ACK_MAX_PER_SENDER) return "rate_limited";
  return null;
}

async function collectAttachments(email: InboundEmail, deps: InboundDeps, scanner: AttachmentScanner, log: InboundLog): Promise<{ stored: StoredAttachmentInput[]; summary: InboundAttachmentSummary }> {
  const screening = screenAttachments(email.attachments);
  const rejected: InboundAttachmentSummary["rejected"] = screening.rejected.map((r) => ({ fileName: r.attachment.fileName, reason: r.reason }));
  const stored: StoredAttachmentInput[] = [];
  for (const meta of screening.accepted) {
    const bytes = await fetchAttachment(email, meta, deps, log);
    if (!bytes) {
      rejected.push({ fileName: meta.fileName, reason: "download_failed" });
      continue;
    }
    if (bytes.length > ATTACHMENT_MAX_BYTES) {
      rejected.push({ fileName: meta.fileName, reason: "too_large" });
      continue;
    }
    const scan = await scanner.scan(bytes, meta);
    if (!scan.clean) {
      log.warn({ emailId: email.providerMessageId, scanner: scanner.name, detail: scan.detail }, "support.inbound.attachment_rejected");
      rejected.push({ fileName: meta.fileName, reason: "scanner_rejected" });
      continue;
    }
    stored.push({ fileName: meta.fileName, contentType: meta.contentType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), content: bytes });
  }
  return { stored, summary: { stored: stored.length, rejected } };
}

async function fetchAttachment(email: InboundEmail, meta: InboundAttachmentMeta, deps: InboundDeps, log: InboundLog): Promise<Buffer | null> {
  if (meta.content) return meta.content;
  if (!deps.receiving || !meta.providerId) return null;
  try {
    const link = await deps.receiving.getAttachment(email.providerMessageId, meta.providerId);
    return await deps.receiving.download(link.download_url, ATTACHMENT_MAX_BYTES);
  } catch (err) {
    log.warn({ emailId: email.providerMessageId, attachmentId: meta.providerId, err: errorMessage(err) }, "support.inbound.attachment_download_failed");
    return null;
  }
}

/**
 * Processes one verified, parsed inbound mail (no ledger — see `handleInboundEvent`). Throws when a required
 * step fails (receiving API, database); the caller records the failure and answers 500 so the provider retries.
 */
export async function processInboundEmail(input: InboundEmail, deps: InboundDeps): Promise<Exclude<InboundOutcome, { status: "duplicate" | "in_progress" | "failed" }>> {
  const { store } = deps;
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? logger;
  const scanner = deps.scanner ?? noopAttachmentScanner;
  const send = deps.sendMail ?? sendTicketMail;

  const settings = await store.loadSettings();
  if (isOwnAddress(input.from.email, settings.mail)) return { status: "ignored", reason: "own_address" };

  // a retried delivery of a mail an earlier attempt already stored (its failure came after the commit):
  // answer with the stored rows — never a second ticket or message for the same e-mail
  const stored = await store.findInboundMessage(input.providerMessageId);
  if (stored) return alreadyStored(stored, input, log);

  let email = input;
  if (email.text == null && email.html == null) {
    if (!deps.receiving) throw new Error("receiving api not configured (RESEND_API_KEY)");
    email = mergeReceivedEmail(email, await deps.receiving.getEmail(email.providerMessageId));
  }

  const verdict = detectAutoReply(email.headers, email.subject);
  const flags = await store.senderFlags(email.from.email);
  const trust = { trustedAuthservIds: deps.trustedAuthservIds ?? [] };
  const spam = spamVerdict(email, { ...trust, blockedSender: flags.blocked });
  const auth = senderAuthentication(email.headers, email.from.email, trust);
  if (auth.authservId && !auth.trusted) {
    // the receiving MTA's verdict is ignored until SUPPORT_AUTHSERV_ID names it (docs/18 §5 step 3) — say so
    log.warn({ emailId: email.providerMessageId, authservId: auth.authservId, trusted: trust.trustedAuthservIds }, "support.inbound.authserv_untrusted");
  }
  let route = await routeInbound(email, settings.mail.inboundDomain, {
    byTicketNumber: (n) => store.findTicketByNumber(n),
    byMessageIds: (ids) => store.findTicketByMessageIds(ids),
  });

  const htmlBody = email.html ? limitHtml(sanitizeHtml(email.html)) : null;
  const textBody = (email.text ?? "").replace(/\r\n?/g, "\n").trim() || (email.html ? htmlToText(email.html) : "");
  const subject = email.subject.trim() || "(no subject)";
  const attachments = await collectAttachments(email, deps, scanner, log);
  const systemNote = attachmentsNote(attachments.summary.rejected);
  const message: StoredMessageInput = {
    fromEmail: email.from.email,
    toEmails: email.to.map((a) => a.email),
    ccEmails: email.cc.map((a) => a.email),
    subject,
    textBody,
    htmlBody,
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    references: email.references,
    providerMessageId: email.providerMessageId,
    createdAt: email.receivedAt,
  };
  const common = {
    autoReply: verdict.auto,
    autoReplyReason: verdict.reason,
    spam: spam.spam,
    spamReasons: spam.reasons,
    authentication: spam.auth,
    senderAuthenticated: auth.aligned,
    senderAuthenticatedVia: auth.via,
    authservId: auth.authservId,
    authservTrusted: auth.trusted,
    attachmentsStored: attachments.summary.stored,
    attachmentsRejected: attachments.summary.rejected,
  };

  let existing: InboundTicket | null = null;
  let intendedTicketNumber: number | null = null;
  let guard: ReplyGuard | null = null;
  if (route.kind === "reply") {
    existing = await store.getTicket(route.ticketId);
    if (existing) {
      guard = replyGuard(existing, email.from.email, route.via, auth.aligned, route.matched);
      if (guard) {
        // the plus address / subject tag alone is refused — but a reply to a desk mail carries both the plus
        // address (its Reply-To) and the thread ids, and one of the desk's own unguessable ids proves possession
        // of the conversation on its own (a relayed requester mail, a forwarded mail): fall back to it before
        // refusing (a customer-supplied id is guarded again and cannot rescue the reply)
        const threadIds = Array.from(new Set([email.inReplyTo, ...email.references].filter((id): id is string => Boolean(id))));
        const byThread = threadIds.length ? await store.findTicketByMessageIds(threadIds) : null;
        const threaded = byThread ? await store.getTicket(byThread.ticketId) : null;
        if (byThread && threaded && replyGuard(threaded, email.from.email, "thread", auth.aligned, byThread.direction) === null) {
          log.info({ ticketId: threaded.id, refusedVia: route.via, guard }, "support.inbound.reply_by_thread");
          route = { kind: "reply", ticketId: byThread.ticketId, via: "thread", matched: byThread.direction };
          existing = threaded;
          guard = null;
        } else {
          log.warn({ ticketId: existing.id, via: route.via, guard }, "support.inbound.reply_refused");
          intendedTicketNumber = existing.number;
          existing = null;
        }
      }
    }
  }

  if (existing) {
    const patch: TicketPatch = { lastCustomerMessageAt: email.receivedAt };
    const events: EventInput[] = [{ kind: "reply", actorKind: "customer", payload: { direction: "inbound", via: route.kind === "reply" ? route.via : null, ...common } }];
    let reopened = false;
    // a spam-verdict reply (DMARC fail, spam flag, blocked sender) is kept for the record but never moves the
    // ticket: a forged "From" must not reopen a solved ticket or restart the clock of a pending one
    const mayChangeStatus = !spam.spam;
    if (mayChangeStatus && (existing.status === "solved" || existing.status === "closed" || existing.status === "pending")) {
      // the SLA engine's transition (docs/18 §10) with the ticket's own policy — the same call the ticket page
      // and the portal make: a reopen clears the stamps and restarts the resolution clock (and the first-response
      // clock while nobody answered) from now, so the worker never flags a stale due date a minute later; leaving
      // `pending` shifts the running due times by the business minutes of the pause and books the wall clock
      const policy = existing.slaPolicyId ? await store.getSlaPolicy(existing.slaPolicyId) : null;
      const transition = statusTransition(policy, existing, "open", now);
      Object.assign(patch, transition.patch);
      if (transition.reopened) {
        patch.reopenCount = existing.reopenCount + 1;
        events.push({ kind: "reopened", actorKind: "customer", payload: { from: existing.status, to: "open", reopenCount: existing.reopenCount + 1 } });
        reopened = true;
      } else {
        events.push({ kind: "status", actorKind: "customer", payload: { from: existing.status, to: "open", reason: "customer_reply" } });
      }
    }
    let messageRowId: string;
    try {
      ({ messageRowId } = await store.appendMessage({ ticketId: existing.id, message, attachments: attachments.stored, patch, events, systemNote, firstCustomerReply: mayChangeStatus }));
    } catch (err) {
      if (err instanceof InboundAlreadyStoredError) return alreadyStored(err.match, email, log);
      throw err;
    }
    return {
      status: "processed",
      ticketId: existing.id,
      ticketNumber: existing.number,
      messageRowId,
      created: false,
      reopened,
      spam: existing.status === "spam",
      acknowledged: false,
      ackError: null,
      ackSkipped: null,
      route: "reply",
      via: route.kind === "reply" ? route.via : null,
      locale: existing.locale,
      localeSource: null,
      organizationId: existing.organizationId,
      attachments: attachments.summary,
    };
  }

  const requester = await store.resolveRequester(email.from.email);
  // a known member's address is linked to its user and organisation only when the From is authenticated: a
  // forged From (a domain without DMARC, no aligned DKIM / SPF) must not open a ticket the impersonated
  // member's whole organisation sees in /app/support — the ticket stays unlinked for an agent to review
  const linkRequester = auth.aligned;
  const requesterUserId = linkRequester ? requester.userId : null;
  const organizationId = linkRequester ? requester.organizationId : null;
  const detected = detectInboundLocale({ storedLocale: requester.locale, headers: email.headers, text: `${subject}\n${textBody}` });
  const status = spam.spam ? "spam" : "new";
  const priority: SupportTicketPriority = "normal";
  const policy = spam.spam ? null : await store.selectSlaPolicy(organizationId);
  // the engine's clock start (docs/18 §10): due dates, the persisted start and the booked targets
  const due = computeClockStart(policy, priority, email.receivedAt);
  const requesterName = email.from.name ?? requester.name;
  const ackSkipped = await acknowledgementSkipReason({ status, settings, verdict, flags, knownUser: requester.userId != null, authenticated: auth.aligned, sender: email.from.email, now, store });
  let created: { ticketId: string; number: number; messageRowId: string };
  try {
    created = await store.createTicket({
      requesterEmail: email.from.email,
      requesterName,
      requesterUserId,
      organizationId,
      subject,
      status,
      priority,
      locale: detected.locale,
      slaPolicyId: policy?.id ?? null,
      firstResponseDueAt: due.firstResponseDueAt,
      resolutionDueAt: due.resolutionDueAt,
      slaClockStartedAt: due.slaClockStartedAt,
      firstResponseTargetMs: due.firstResponseTargetMs,
      resolutionTargetMs: due.resolutionTargetMs,
      message,
      attachments: attachments.stored,
      events: [
        {
          kind: "created",
          actorKind: "customer",
          payload: {
            channel: "email",
            locale: detected.locale,
            localeSource: detected.source,
            organizationMatched: Boolean(organizationId),
            /** the address belongs to a known user, but the unauthenticated From kept the user / organisation off the ticket */
            requesterLinkWithheld: !linkRequester && requester.userId != null,
            membershipCount: requester.membershipCount,
            slaPolicyId: policy?.id ?? null,
            intendedTicketNumber,
            replyGuard: guard,
            ackSkipped,
            ...common,
          },
        },
      ],
      systemNote,
    });
  } catch (err) {
    if (err instanceof InboundAlreadyStoredError) return alreadyStored(err.match, email, log);
    throw err;
  }

  let acknowledged = false;
  let ackError: string | null = null;
  if (ackSkipped === "rate_limited") log.warn({ ticketId: created.ticketId, max: ACK_MAX_PER_SENDER, windowMs: ACK_WINDOW_MS }, "support.inbound.acknowledgement_rate_limited");
  if (ackSkipped === null) {
    // the ticket is committed: a failure from here on is recorded as `ackError`, never thrown — a thrown error
    // would fail the event and make the provider retry a mail that is already stored
    try {
      const messageId = ticketMessageId(created.number, settings.mail);
      const references = Array.from(new Set([...email.references, ...(email.messageId ? [email.messageId] : [])]));
      const textBodyAck = acknowledgementText(detected.locale, created.number, requesterName);
      const row = await store.insertOutboundSystemMessage({
        ticketId: created.ticketId,
        fromEmail: settings.mail.fromAddress,
        toEmails: [email.from.email],
        subject: ticketSubject(created.number, subject),
        textBody: textBodyAck,
        messageId,
        inReplyTo: email.messageId,
        references,
        createdAt: now,
      });
      const result = await send({
        ticket: { id: created.ticketId, number: created.number, subject, requesterEmail: email.from.email, requesterName, locale: detected.locale },
        message: { id: row.messageRowId, textBody: textBodyAck, messageId, inReplyTo: email.messageId, references, kind: "auto" },
        locale: detected.locale,
        settings: settings.mail,
      });
      if (result.ok) {
        acknowledged = true; // the mail is out even if the delivery update below fails
        await store.updateDelivery(row.messageRowId, { deliveryStatus: "sent", providerMessageId: result.id ?? null });
      } else {
        ackError = (result.error ?? "send failed").slice(0, 500);
        log.warn({ ticketId: created.ticketId, transport: result.transport, err: ackError }, "support.inbound.acknowledgement_failed");
        await store.updateDelivery(row.messageRowId, { deliveryStatus: "failed", deliveryError: ackError });
      }
    } catch (err) {
      ackError = errorMessage(err).slice(0, 500);
      log.warn({ ticketId: created.ticketId, acknowledged, err: ackError }, "support.inbound.acknowledgement_failed");
    }
  }

  return {
    status: "processed",
    ticketId: created.ticketId,
    ticketNumber: created.number,
    messageRowId: created.messageRowId,
    created: true,
    reopened: false,
    spam: spam.spam,
    acknowledged,
    ackError,
    ackSkipped,
    route: "new",
    via: null,
    locale: detected.locale,
    localeSource: detected.source,
    organizationId,
    attachments: attachments.summary,
  };
}

/**
 * Ledger-wrapped processing: a delivery already `processed` / `ignored` is acknowledged as a duplicate, one
 * still `received` and younger than `INBOUND_EVENT_STALE_MS` answers `in_progress`, a `failed` or stale one
 * is retried. Never throws — a failure is recorded on the ledger row and returned as `failed`.
 */
export async function handleInboundEvent(email: InboundEmail, deps: InboundDeps, options: { provider?: string } = {}): Promise<InboundOutcome> {
  const { store } = deps;
  const log = deps.log ?? logger;
  const provider = options.provider ?? email.provider;
  // the ledger keeps the parsed event without bodies, so a failed delivery can be reprocessed from the console
  const begin = await store.beginEvent(email.providerEventId, provider, deps.now?.() ?? new Date(), ledgerPayloadOf(email));
  if (begin === "duplicate") return { status: "duplicate" };
  if (begin === "in_progress") return { status: "in_progress" };
  try {
    const outcome = await processInboundEmail(email, deps);
    await store.finishEvent(email.providerEventId, { status: outcome.status === "ignored" ? "ignored" : "processed", ticketId: outcome.status === "processed" ? outcome.ticketId : null }, deps.now?.() ?? new Date());
    log.info(outcome.status === "processed" ? { eventId: email.providerEventId, ticketId: outcome.ticketId, created: outcome.created, spam: outcome.spam, acknowledged: outcome.acknowledged } : { eventId: email.providerEventId, reason: outcome.reason }, "support.inbound.processed");
    return outcome;
  } catch (err) {
    const message = errorMessage(err);
    await store.finishEvent(email.providerEventId, { status: "failed", error: message.slice(0, 1000) }, deps.now?.() ?? new Date()).catch(() => undefined);
    log.error({ eventId: email.providerEventId, err: message }, "support.inbound.failed");
    return { status: "failed", error: message };
  }
}

/**
 * HTTP answer of an outcome (framework-free, shared by the webhook and the fixture route). Non-2xx makes
 * the provider retry: `in_progress` (another delivery is being processed) and `failed` do, everything else
 * is acknowledged. The body carries ids and counts only.
 */
export function inboundOutcomeResponse(outcome: InboundOutcome): { status: number; body: Record<string, unknown> } {
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
      return {
        status: 200,
        body: {
          ok: true,
          ticketId: outcome.ticketId,
          number: outcome.ticketNumber,
          created: outcome.created,
          reopened: outcome.reopened,
          spam: outcome.spam,
          acknowledged: outcome.acknowledged,
          ackSkipped: outcome.ackSkipped,
          route: outcome.route,
          via: outcome.via,
          attachments: { stored: outcome.attachments.stored, rejected: outcome.attachments.rejected.length },
        },
      };
  }
}

// ---------------------------------------------------------------------------------------------------
// Drizzle store (tracksite_worker)
// ---------------------------------------------------------------------------------------------------

const lower = (value: string) => value.trim().toLowerCase();

/** The `support_inbound_events` ledger as `tracksite_worker`; shared by the inbound and delivery stores. */
export function createDrizzleInboundLedger(database: Db): InboundLedger {
  return {
    async beginEvent(providerEventId, provider, now, payload = null) {
      return withWorker(database, async (tx) => {
        const inserted = await tx
          .insert(supportInboundEvents)
          .values({ provider, providerEventId, receivedAt: now, status: "received", payload })
          .onConflictDoNothing({ target: supportInboundEvents.providerEventId })
          .returning({ id: supportInboundEvents.id });
        if (inserted.length) return "new";
        const [existing] = await tx.select({ status: supportInboundEvents.status, receivedAt: supportInboundEvents.receivedAt }).from(supportInboundEvents).where(eq(supportInboundEvents.providerEventId, providerEventId)).limit(1);
        if (!existing) return "new";
        if (existing.status === "processed" || existing.status === "ignored") return "duplicate";
        if (existing.status === "received" && now.getTime() - existing.receivedAt.getTime() < INBOUND_EVENT_STALE_MS) return "in_progress";
        // a retry refreshes the stored payload when it carries one (a row from before the column keeps null)
        await tx
          .update(supportInboundEvents)
          .set({ status: "received", receivedAt: now, processedAt: null, error: null, ...(payload ? { payload } : {}) })
          .where(eq(supportInboundEvents.providerEventId, providerEventId));
        return "retry";
      });
    },
    async finishEvent(providerEventId, patch, now) {
      await withWorker(database, (tx) =>
        tx
          .update(supportInboundEvents)
          .set({ status: patch.status, processedAt: now, ticketId: patch.ticketId ?? null, error: patch.error ?? null })
          .where(eq(supportInboundEvents.providerEventId, providerEventId)),
      );
    },
  };
}

/** The desk's `support_settings.business_hours` (the fallback of a policy without windows); null without a row. */
async function deskBusinessHours(tx: Tx): Promise<SupportBusinessHours | null> {
  const [row] = await tx.select({ businessHours: supportSettings.businessHours }).from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
  return row?.businessHours ?? null;
}

/** The inbound row (direction `inbound`) that already holds the mail's own provider id, with its ticket. */
async function findInboundMessageIn(tx: Tx, providerMessageId: string): Promise<StoredInboundMatch | null> {
  const [row] = await tx
    .select({
      ticketId: supportMessages.ticketId,
      ticketNumber: supportTickets.number,
      messageRowId: supportMessages.id,
      status: supportTickets.status,
      locale: supportTickets.locale,
      organizationId: supportTickets.organizationId,
    })
    .from(supportMessages)
    .innerJoin(supportTickets, eq(supportTickets.id, supportMessages.ticketId))
    .where(and(eq(supportMessages.providerMessageId, providerMessageId), eq(supportMessages.direction, "inbound")))
    .limit(1);
  return row ? { ...row, ticketNumber: Number(row.ticketNumber) } : null;
}

/**
 * Serialises concurrent deliveries of one mail (two webhook ids for the same `email_id`) on the mail's own
 * provider id: a transaction-scoped advisory lock, then a re-check for the row the winner committed. The loser
 * throws `InboundAlreadyStoredError` (rolled back) and the handler answers with the stored ticket. Behind it
 * stands the partial unique index `support_messages_inbound_provider_uq` (migration 0018) — a write that
 * slips past the re-check violates it, and `mapInboundReplayViolation` turns that into the same answer.
 */
async function lockInboundMail(tx: Tx, providerMessageId: string | null): Promise<void> {
  const id = providerMessageId?.trim();
  if (!id) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`support_inbound:${id}`}::text, 0))`);
  const stored = await findInboundMessageIn(tx, id);
  if (stored) throw new InboundAlreadyStoredError(stored);
}

/** The partial unique index of migration 0018: one inbound row per `provider_message_id`. */
export const INBOUND_PROVIDER_UNIQUE_INDEX = "support_messages_inbound_provider_uq";

/** True for the unique violation of that index — the structural replay guard fired (docs/18 §4 step 2). */
export function isInboundReplayViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505" && pgErrorConstraint(error) === INBOUND_PROVIDER_UNIQUE_INDEX;
}

/**
 * Maps the index violation to the stored route: the failed transaction is rolled back already, so the stored
 * row is looked up in a fresh one and thrown as `InboundAlreadyStoredError` (the handler answers with it).
 * Anything else — or a violation whose row cannot be found — is rethrown unchanged.
 */
async function mapInboundReplayViolation(error: unknown, providerMessageId: string | null, lookup: (id: string) => Promise<StoredInboundMatch | null>): Promise<never> {
  const id = providerMessageId?.trim();
  if (id && isInboundReplayViolation(error)) {
    const stored = await lookup(id);
    if (stored) throw new InboundAlreadyStoredError(stored);
  }
  throw error;
}

async function insertMessageWithTrail(tx: Tx, ticketId: string, organizationId: string | null, message: StoredMessageInput, attachments: StoredAttachmentInput[], events: EventInput[], systemNote: string | null): Promise<string> {
  const [row] = await tx
    .insert(supportMessages)
    .values({
      ticketId,
      organizationId,
      direction: "inbound",
      authorKind: "customer",
      fromEmail: message.fromEmail,
      toEmails: message.toEmails,
      ccEmails: message.ccEmails,
      subject: message.subject,
      textBody: message.textBody,
      htmlBody: message.htmlBody,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      providerMessageId: message.providerMessageId,
      deliveryStatus: "na",
      createdAt: message.createdAt,
    })
    .returning({ id: supportMessages.id });
  const messageRowId = row!.id;
  if (attachments.length) {
    await tx.insert(supportAttachments).values(attachments.map((a) => ({ messageId: messageRowId, ticketId, organizationId, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes, sha256: a.sha256, content: a.content })));
  }
  if (systemNote) {
    await tx.insert(supportMessages).values({ ticketId, organizationId, direction: "note", authorKind: "system", textBody: systemNote, deliveryStatus: "na", createdAt: message.createdAt });
  }
  if (events.length) {
    await tx.insert(supportEvents).values(events.map((e) => ({ ticketId, organizationId, actorKind: e.actorKind, kind: e.kind, payload: { ...e.payload, messageId: messageRowId }, createdAt: message.createdAt })));
  }
  return messageRowId;
}

export function createDrizzleInboundStore(database?: Db): InboundStore {
  const dbase = database ?? db();
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withWorker(dbase, fn);
  return {
    ...createDrizzleInboundLedger(dbase),

    async loadSettings() {
      return run(async (tx) => {
        const [row] = await tx.select().from(supportSettings).where(eq(supportSettings.id, 1)).limit(1);
        return { mail: supportMailSettings(row ?? null), autoReplyEnabled: row?.autoReplyEnabled ?? false };
      });
    },

    async senderFlags(email) {
      return run(async (tx) => {
        const [row] = await tx
          .select({
            // only a ticket an agent moved to spam blocks (a `status` event by an agent with `to: spam`): a spam
            // *verdict* of the handler (X-Spam-Flag, DMARC fail) files a spam ticket but must not block the
            // address — the flag header and, for a domain without DMARC, the From are the sender's to forge,
            // so a stranger could otherwise silence any customer address with one mail
            // (the outer columns are qualified by hand: Drizzle renders select-field columns unqualified, and an
            // unqualified `id` inside the subquery would resolve to `support_events.id`)
            blocked: sql<boolean | null>`bool_or(${supportTickets}.status = 'spam' AND EXISTS (SELECT 1 FROM ${supportEvents} e WHERE e.ticket_id = ${supportTickets}.id AND e.kind = 'status' AND e.actor_kind = 'agent' AND e.payload->>'to' = 'spam'))`,
            doNotEmail: sql<boolean | null>`bool_or(${DO_NOT_EMAIL_TAG} = ANY(${supportTickets.tags}))`,
          })
          .from(supportTickets)
          .where(eq(supportTickets.requesterEmail, lower(email)));
        return { blocked: Boolean(row?.blocked), doNotEmail: Boolean(row?.doNotEmail) };
      });
    },

    async findTicketByNumber(number) {
      if (!Number.isSafeInteger(number) || number <= 0) return null;
      return run(async (tx) => {
        const [row] = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.number, number)).limit(1);
        return row ? { ticketId: row.id } : null;
      });
    },

    async countRecentAcknowledgements(email, since) {
      return run(async (tx) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(supportMessages)
          .where(and(eq(supportMessages.direction, "outbound"), eq(supportMessages.authorKind, "system"), gte(supportMessages.createdAt, since), sql`${lower(email)} = ANY(${supportMessages.toEmails})`));
        return Number(row?.count ?? 0);
      });
    },

    async findTicketByMessageIds(ids) {
      const clean = ids.map((id) => id.trim()).filter(Boolean).slice(0, 50);
      if (!clean.length) return null;
      return run(async (tx) => {
        // deterministic when several rows carry one of the ids (a sender re-using somebody else's Message-ID):
        // the desk's own outbound rows (ULID ids) first, then the oldest row — the original conversation wins
        const [row] = await tx
          .select({ ticketId: supportMessages.ticketId, direction: supportMessages.direction })
          .from(supportMessages)
          .where(or(inArray(supportMessages.messageId, clean), inArray(supportMessages.providerMessageId, clean)))
          .orderBy(sql`case when ${supportMessages.direction} = 'outbound' then 0 else 1 end`, asc(supportMessages.createdAt))
          .limit(1);
        // anything but the desk's own outbound row is a customer-supplied id and stays guarded
        return row ? { ticketId: row.ticketId, direction: row.direction === "outbound" ? "outbound" : "inbound" } : null;
      });
    },

    async findInboundMessage(providerMessageId) {
      const id = providerMessageId.trim();
      if (!id) return null;
      return run((tx) => findInboundMessageIn(tx, id));
    },

    async getTicket(ticketId) {
      return run(async (tx) => {
        const load = async (id: string) => {
          const [t] = await tx
            .select({
              id: supportTickets.id,
              number: supportTickets.number,
              status: supportTickets.status,
              subject: supportTickets.subject,
              requesterEmail: supportTickets.requesterEmail,
              requesterName: supportTickets.requesterName,
              organizationId: supportTickets.organizationId,
              locale: supportTickets.locale,
              tags: supportTickets.tags,
              reopenCount: supportTickets.reopenCount,
              priority: supportTickets.priority,
              slaPolicyId: supportTickets.slaPolicyId,
              pausedAt: supportTickets.pausedAt,
              pauseTotalMs: supportTickets.pauseTotalMs,
              firstResponseDueAt: supportTickets.firstResponseDueAt,
              resolutionDueAt: supportTickets.resolutionDueAt,
              firstRespondedAt: supportTickets.firstRespondedAt,
              resolvedAt: supportTickets.resolvedAt,
              closedAt: supportTickets.closedAt,
              mergedIntoId: supportTickets.mergedIntoId,
            })
            .from(supportTickets)
            .where(eq(supportTickets.id, id))
            .limit(1);
          return t ?? null;
        };
        const source = await load(ticketId);
        if (!source) return null;
        // a reply to a merged ticket lands on the ticket it was merged into (one hop); the merged-away ticket's
        // requester and correspondents stay entitled to reply through its own plus address and subject tag
        const target = source.mergedIntoId ? await load(source.mergedIntoId) : null;
        const t = target ?? source;
        const rows = await tx
          .select({ fromEmail: supportMessages.fromEmail, toEmails: supportMessages.toEmails, ccEmails: supportMessages.ccEmails })
          .from(supportMessages)
          .where(and(inArray(supportMessages.ticketId, target ? [source.id, target.id] : [source.id]), ne(supportMessages.direction, "note")))
          .limit(1000);
        const participants = new Set<string>();
        if (target) participants.add(lower(source.requesterEmail));
        for (const r of rows) {
          if (r.fromEmail) participants.add(lower(r.fromEmail));
          for (const e of [...r.toEmails, ...r.ccEmails]) participants.add(lower(e));
        }
        return {
          id: t.id,
          number: Number(t.number),
          status: t.status,
          subject: t.subject,
          requesterEmail: t.requesterEmail,
          requesterName: t.requesterName,
          organizationId: t.organizationId,
          locale: t.locale,
          tags: t.tags,
          reopenCount: t.reopenCount,
          priority: t.priority,
          slaPolicyId: t.slaPolicyId,
          pausedAt: t.pausedAt,
          pauseTotalMs: Number(t.pauseTotalMs),
          firstResponseDueAt: t.firstResponseDueAt,
          resolutionDueAt: t.resolutionDueAt,
          firstRespondedAt: t.firstRespondedAt,
          resolvedAt: t.resolvedAt,
          closedAt: t.closedAt,
          participants: Array.from(participants),
        };
      });
    },

    async resolveRequester(email) {
      return run(async (tx) => {
        const [u] = await tx
          .select({ id: user.id, name: user.name, locale: user.locale })
          .from(user)
          .where(sql`lower(${user.email}) = ${lower(email)}`)
          .limit(1);
        if (!u) return { userId: null, name: null, locale: null, organizationId: null, membershipCount: 0 };
        const rows = await tx.select({ organizationId: member.organizationId }).from(member).where(eq(member.userId, u.id)).limit(50);
        return { userId: u.id, name: u.name, locale: u.locale, organizationId: rows.length === 1 ? rows[0]!.organizationId : null, membershipCount: rows.length };
      });
    },

    async selectSlaPolicy(organizationId) {
      return run(async (tx) => {
        let planId: string | null = null;
        if (organizationId) {
          const [sub] = await tx.select({ planId: subscriptions.planId }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
          planId = sub?.planId ?? null;
        }
        const policies = await tx
          .select({ id: supportSlaPolicies.id, priorities: supportSlaPolicies.priorities, businessHours: supportSlaPolicies.businessHours, planIds: supportSlaPolicies.planIds, isDefault: supportSlaPolicies.isDefault })
          .from(supportSlaPolicies);
        const specific = planId ? policies.find((p) => p.planIds?.includes(planId)) : undefined;
        const chosen = specific ?? policies.find((p) => p.isDefault) ?? null;
        // a policy without windows runs on the desk's hours (docs/18 §11) — the same policy the console applies
        return chosen ? withDeskBusinessHours({ id: chosen.id, priorities: chosen.priorities, businessHours: chosen.businessHours }, await deskBusinessHours(tx)) : null;
      });
    },

    async getSlaPolicy(policyId) {
      return run(async (tx) => {
        const [row] = await tx
          .select({ id: supportSlaPolicies.id, priorities: supportSlaPolicies.priorities, businessHours: supportSlaPolicies.businessHours })
          .from(supportSlaPolicies)
          .where(eq(supportSlaPolicies.id, policyId))
          .limit(1);
        return row ? withDeskBusinessHours(row, await deskBusinessHours(tx)) : null;
      });
    },

    async createTicket(input) {
      return run(async (tx) => {
        await lockInboundMail(tx, input.message.providerMessageId);
        const [ticket] = await tx
          .insert(supportTickets)
          .values({
            organizationId: input.organizationId,
            requesterUserId: input.requesterUserId,
            requesterEmail: lower(input.requesterEmail),
            requesterName: input.requesterName,
            subject: input.subject,
            status: input.status,
            priority: input.priority,
            channel: "email",
            locale: input.locale,
            slaPolicyId: input.slaPolicyId,
            firstResponseDueAt: input.firstResponseDueAt,
            resolutionDueAt: input.resolutionDueAt,
            slaClockStartedAt: input.slaClockStartedAt,
            firstResponseTargetMs: input.firstResponseTargetMs,
            resolutionTargetMs: input.resolutionTargetMs,
            lastCustomerMessageAt: input.message.createdAt,
          })
          .returning({ id: supportTickets.id, number: supportTickets.number });
        const messageRowId = await insertMessageWithTrail(tx, ticket!.id, input.organizationId, input.message, input.attachments, input.events, input.systemNote);
        // desk auto-assignment (round robin among agents online, docs/18 §"Round robin"); spam tickets stay unassigned.
        // Own savepoint: a failure leaves the ticket unassigned and logged, never fails the stored mail (Resend would
        // retry it). The handler records no creation audit (system processing, §4), so a pick's own
        // `support.ticket.auto_assign` audit row — written inside this savepoint — is the audit trail of the assignment
        if (input.status !== "spam")
          await tx.transaction((sp) => autoAssignNewTicket(sp, { ticketId: ticket!.id, organizationId: input.organizationId, source: "inbound" })).catch((e: unknown) => {
            logger.warn({ ticketId: ticket!.id, err: e instanceof Error ? e.message : String(e) }, "support.auto_assign_failed");
          });
        return { ticketId: ticket!.id, number: Number(ticket!.number), messageRowId };
      }).catch((error: unknown) => mapInboundReplayViolation(error, input.message.providerMessageId, (id) => run((tx) => findInboundMessageIn(tx, id))));
    },

    async appendMessage(input) {
      return run(async (tx) => {
        await lockInboundMail(tx, input.message.providerMessageId);
        const [t] = await tx.select({ organizationId: supportTickets.organizationId }).from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1);
        if (!t) throw new Error("ticket vanished");
        const messageRowId = await insertMessageWithTrail(tx, input.ticketId, t.organizationId, input.message, input.attachments, input.events, input.systemNote);
        const { lastCustomerMessageAt, ...rest } = input.patch;
        await tx
          .update(supportTickets)
          .set({ ...rest, lastCustomerMessageAt })
          .where(eq(supportTickets.id, input.ticketId));
        // an agent-created ticket waiting for the customer: this reply starts its SLA clocks — after the
        // transition above (leaving `pending` ended the pause), a no-op for every other ticket
        if (input.firstCustomerReply) await applyFirstCustomerReply(tx, input.ticketId, lastCustomerMessageAt);
        return { messageRowId };
      }).catch((error: unknown) => mapInboundReplayViolation(error, input.message.providerMessageId, (id) => run((tx) => findInboundMessageIn(tx, id))));
    },

    async insertOutboundSystemMessage(input) {
      return run(async (tx) => {
        const [t] = await tx.select({ organizationId: supportTickets.organizationId }).from(supportTickets).where(eq(supportTickets.id, input.ticketId)).limit(1);
        if (!t) throw new Error("ticket vanished");
        const [row] = await tx
          .insert(supportMessages)
          .values({
            ticketId: input.ticketId,
            organizationId: t.organizationId,
            direction: "outbound",
            authorKind: "system",
            fromEmail: input.fromEmail,
            toEmails: input.toEmails,
            subject: input.subject,
            textBody: input.textBody,
            messageId: input.messageId,
            inReplyTo: input.inReplyTo,
            references: input.references,
            deliveryStatus: "queued",
            createdAt: input.createdAt,
          })
          .returning({ id: supportMessages.id });
        await tx.insert(supportEvents).values({ ticketId: input.ticketId, organizationId: t.organizationId, actorKind: "system", kind: "reply", payload: { messageId: row!.id, direction: "outbound", auto: true }, createdAt: input.createdAt });
        return { messageRowId: row!.id };
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
  };
}

/**
 * Production dependencies: the Drizzle store, the receiving client when `RESEND_API_KEY` exists, the no-op
 * scanner, and the trusted authserv-ids from `SUPPORT_AUTHSERV_ID` (`env.ts`, docs/18 §5; unset → every mail is
 * unauthenticated until the operator names Resend's id).
 */
export function defaultInboundDeps(overrides: Partial<InboundDeps> = {}): InboundDeps {
  const key = env().RESEND_API_KEY?.trim();
  return {
    store: createDrizzleInboundStore(),
    receiving: key ? createResendReceivingClient({ apiKey: key }) : null,
    scanner: noopAttachmentScanner,
    sendMail: sendTicketMail,
    trustedAuthservIds: trustedAuthservIdsFromEnv(),
    log: logger,
    ...overrides,
  };
}
