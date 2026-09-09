import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: () => ({}) }));
vi.mock("@/server/db", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, db: () => null }));

import { ACTIVE_LOCALES } from "@/i18n/routing";
import attachmentGet from "./fixtures/resend/attachment-get.json";
import received from "./fixtures/resend/email-received.json";
import receivingGet from "./fixtures/resend/receiving-get.json";
import { parseResendReceivedEvent, type AttachmentScanner, type InboundEmail, type ResendReceivingClient } from "./inbound";
import {
  ACK_MAX_PER_SENDER,
  ACK_WINDOW_MS,
  INBOUND_EVENT_STALE_MS,
  INBOUND_LEDGER_HEADERS_MAX_CHARS,
  INBOUND_PROVIDER_UNIQUE_INDEX,
  InboundAlreadyStoredError,
  acknowledgementText,
  attachmentsNote,
  handleInboundEvent,
  inboundEmailFromLedgerPayload,
  inboundOutcomeResponse,
  isInboundReplayViolation,
  ledgerPayloadOf,
  limitHtml,
  processInboundEmail,
  replyGuard,
  senderMayReply,
  trustedAuthservIdsFromEnv,
  type AppendMessageInput,
  type CreateTicketInput,
  type DeliveryPatch,
  type InboundDeps,
  type InboundLedgerPayload,
  type InboundSettings,
  type InboundStore,
  type InboundTicket,
  type LedgerBegin,
  type LedgerFinish,
  type OutboundSystemMessageInput,
  type RequesterMatch,
  type SenderFlags,
  type SlaPolicyMatch,
  type StoredInboundMatch,
  type ThreadMatch,
} from "./inbound-handler";
import type { TicketMailInput, TicketMailResult } from "./mail";

const NOW = new Date("2026-09-08T10:00:00.000Z"); // Tuesday 12:00 Europe/Berlin
const HOURS = { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], wed: [[540, 1080]], thu: [[540, 1080]], fri: [[540, 1080]] } } as const;
const POLICY: SlaPolicyMatch = { id: "policy-default", priorities: { normal: { first_response_minutes: 480, resolution_minutes: 4320 } }, businessHours: { timezone: HOURS.timezone, days: { ...HOURS.days } as never } };
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };
/** what Resend's MTA writes for a legitimate mail from example.com — the default of `mail()`; `headers: {}` makes a mail unauthenticated */
const AUTH_HEADERS = { "authentication-results": "mx.resend.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass (p=none) header.from=example.com" };
/** the authserv-ids the tests trust (`SUPPORT_AUTHSERV_ID`): the fixture's `mx.resend.com` and the short `mx` of hand-written headers */
const TRUSTED = ["mx.resend.com", "mx"];

interface LedgerRow {
  provider: string;
  status: "received" | "processed" | "ignored" | "failed";
  receivedAt: Date;
  ticketId: string | null;
  error: string | null;
  /** the parsed event without bodies, as `support_inbound_events.payload` would hold it */
  payload: InboundLedgerPayload | null;
}

/** In-memory `InboundStore`: records every write so the tests assert exactly what would reach the database. */
class FakeStore implements InboundStore {
  ledger = new Map<string, LedgerRow>();
  settings: InboundSettings = { mail: { inboundDomain: "support.track.site", fromName: "Track Support", fromAddress: "support@track.site", signatureText: "" }, autoReplyEnabled: true };
  flags = new Map<string, SenderFlags>();
  tickets = new Map<string, InboundTicket>();
  byNumber = new Map<number, string>();
  /** stored message ids → ticket, with the direction of the row (the desk's own outbound ids, customer-supplied inbound ids) */
  byMessageId = new Map<string, ThreadMatch>();
  requesters = new Map<string, RequesterMatch>();
  policy: SlaPolicyMatch | null = POLICY;
  created: CreateTicketInput[] = [];
  appended: AppendMessageInput[] = [];
  outbound: OutboundSystemMessageInput[] = [];
  deliveries: Array<{ messageRowId: string; patch: DeliveryPatch }> = [];
  /** inbound rows by the mail's own provider id, as `support_messages.provider_message_id` would hold them */
  storedInbound = new Map<string, StoredInboundMatch>();
  failCreate = false;
  failOutbound = false;
  failFinishOnce = false;
  failDeliveryUpdateOnce = false;
  /** what the Drizzle store throws when a concurrent delivery of the same mail committed first */
  alreadyStoredOnWrite: StoredInboundMatch | null = null;
  private seq = 0;
  private nextNumber = 1000;

  /** one of the desk's own Message-IDs (an outbound row) */
  seedOutboundId(id: string, ticketId: string) {
    this.byMessageId.set(id, { ticketId, direction: "outbound" });
  }
  /** a customer-supplied Message-ID stored on an inbound row */
  seedInboundId(id: string, ticketId: string) {
    this.byMessageId.set(id, { ticketId, direction: "inbound" });
  }

  seedTicket(partial: Partial<InboundTicket> & { number: number }): InboundTicket {
    const ticket: InboundTicket = {
      id: `ticket-${partial.number}`,
      status: "open",
      subject: "Pixel fires twice",
      requesterEmail: "ada@example.com",
      requesterName: "Ada",
      organizationId: "org-1",
      locale: "en",
      tags: [],
      reopenCount: 0,
      priority: "normal",
      slaPolicyId: null,
      pausedAt: null,
      pauseTotalMs: 0,
      firstResponseDueAt: null,
      resolutionDueAt: null,
      firstRespondedAt: null,
      resolvedAt: null,
      closedAt: null,
      participants: ["ada@example.com", "support@track.site"],
      ...partial,
    };
    this.tickets.set(ticket.id, ticket);
    this.byNumber.set(ticket.number, ticket.id);
    return ticket;
  }

  async beginEvent(providerEventId: string, provider: string, now: Date, payload: InboundLedgerPayload | null = null): Promise<LedgerBegin> {
    const row = this.ledger.get(providerEventId);
    if (!row) {
      this.ledger.set(providerEventId, { provider, status: "received", receivedAt: now, ticketId: null, error: null, payload });
      return "new";
    }
    if (row.status === "processed" || row.status === "ignored") return "duplicate";
    if (row.status === "received" && now.getTime() - row.receivedAt.getTime() < INBOUND_EVENT_STALE_MS) return "in_progress";
    row.status = "received";
    row.receivedAt = now;
    row.error = null;
    if (payload) row.payload = payload;
    return "retry";
  }
  async finishEvent(providerEventId: string, patch: LedgerFinish): Promise<void> {
    if (this.failFinishOnce) {
      this.failFinishOnce = false;
      throw new Error("ledger down");
    }
    const row = this.ledger.get(providerEventId);
    if (!row) throw new Error("no ledger row");
    row.status = patch.status;
    row.ticketId = patch.ticketId ?? null;
    row.error = patch.error ?? null;
  }
  async loadSettings() {
    return this.settings;
  }
  async senderFlags(email: string) {
    return this.flags.get(email) ?? { blocked: false, doNotEmail: false };
  }
  async countRecentAcknowledgements(email: string, since: Date) {
    return this.outbound.filter((o) => o.toEmails.includes(email.toLowerCase()) && o.createdAt.getTime() >= since.getTime()).length;
  }
  async findTicketByNumber(number: number) {
    const id = this.byNumber.get(number);
    return id ? { ticketId: id } : null;
  }
  async findTicketByMessageIds(ids: string[]) {
    // like the Drizzle store: the desk's own outbound rows win over customer-supplied ids
    const hits = ids.map((id) => this.byMessageId.get(id)).filter((hit): hit is ThreadMatch => Boolean(hit));
    return hits.find((hit) => hit.direction === "outbound") ?? hits[0] ?? null;
  }
  async findInboundMessage(providerMessageId: string) {
    return this.storedInbound.get(providerMessageId) ?? null;
  }
  async getTicket(ticketId: string) {
    return this.tickets.get(ticketId) ?? null;
  }
  private remember(ticketId: string, providerMessageId: string | null, messageRowId: string) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket || !providerMessageId) return;
    this.storedInbound.set(providerMessageId, { ticketId, ticketNumber: ticket.number, messageRowId, status: ticket.status, locale: ticket.locale, organizationId: ticket.organizationId });
  }
  async resolveRequester(email: string) {
    return this.requesters.get(email) ?? { userId: null, name: null, locale: null, organizationId: null, membershipCount: 0 };
  }
  async selectSlaPolicy() {
    return this.policy;
  }
  async getSlaPolicy(policyId: string) {
    return this.policy && this.policy.id === policyId ? this.policy : null;
  }
  async createTicket(input: CreateTicketInput) {
    if (this.failCreate) throw new Error("db down");
    if (this.alreadyStoredOnWrite) throw new InboundAlreadyStoredError(this.alreadyStoredOnWrite);
    const number = this.nextNumber++;
    const ticketId = `ticket-${number}`;
    this.created.push(input);
    this.tickets.set(ticketId, {
      id: ticketId,
      number,
      status: input.status,
      subject: input.subject,
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      organizationId: input.organizationId,
      locale: input.locale,
      tags: [],
      reopenCount: 0,
      priority: input.priority,
      slaPolicyId: input.slaPolicyId,
      pausedAt: null,
      pauseTotalMs: 0,
      firstResponseDueAt: input.firstResponseDueAt,
      resolutionDueAt: input.resolutionDueAt,
      firstRespondedAt: null,
      resolvedAt: null,
      closedAt: null,
      participants: [input.requesterEmail],
    });
    this.byNumber.set(number, ticketId);
    if (input.message.messageId) this.seedInboundId(input.message.messageId, ticketId);
    const messageRowId = `msg-${++this.seq}`;
    this.remember(ticketId, input.message.providerMessageId, messageRowId);
    return { ticketId, number, messageRowId };
  }
  async appendMessage(input: AppendMessageInput) {
    if (this.alreadyStoredOnWrite) throw new InboundAlreadyStoredError(this.alreadyStoredOnWrite);
    this.appended.push(input);
    if (input.message.messageId) this.seedInboundId(input.message.messageId, input.ticketId);
    const messageRowId = `msg-${++this.seq}`;
    this.remember(input.ticketId, input.message.providerMessageId, messageRowId);
    return { messageRowId };
  }
  async insertOutboundSystemMessage(input: OutboundSystemMessageInput) {
    if (this.failOutbound) throw new Error("db down");
    this.outbound.push(input);
    this.seedOutboundId(input.messageId, input.ticketId);
    return { messageRowId: `msg-${++this.seq}` };
  }
  async updateDelivery(messageRowId: string, patch: DeliveryPatch) {
    if (this.failDeliveryUpdateOnce) {
      this.failDeliveryUpdateOnce = false;
      throw new Error("connection lost");
    }
    this.deliveries.push({ messageRowId, patch });
  }
}

let counter = 0;
function mail(overrides: Partial<InboundEmail> = {}): InboundEmail {
  counter += 1;
  return {
    provider: "resend",
    providerEventId: `evt-${counter}`,
    providerMessageId: `em-${counter}`,
    from: { email: "ada@example.com", name: "Ada" },
    to: [{ email: "support@support.track.site", name: null }],
    cc: [],
    subject: "Pixel fires twice",
    messageId: `m${counter}@mail.example.com`,
    inReplyTo: null,
    references: [],
    headers: { ...AUTH_HEADERS },
    text: "Hello, we have a problem with the pixel and the events are not sent. Thanks for your help. Kind regards",
    html: null,
    attachments: [],
    receivedAt: NOW,
    ...overrides,
  };
}

const sendMail = vi.fn(async (input: TicketMailInput): Promise<TicketMailResult> => ({ ok: true, transport: "file", id: "resend_ack_1", messageId: input.message.messageId ?? "" }));

function deps(store: InboundStore, extra: Partial<InboundDeps> = {}): InboundDeps {
  return { store, receiving: null, sendMail, now: () => NOW, log: silentLog, trustedAuthservIds: TRUSTED, ...extra };
}

beforeEach(() => {
  sendMail.mockClear();
});

describe("new tickets", () => {
  it("creates the ticket, links the requester's organisation, applies the SLA policy and acknowledges in the requester's language", async () => {
    const store = new FakeStore();
    store.requesters.set("ada@example.com", { userId: "user-ada", name: "Ada L.", locale: "fr", organizationId: "org-1", membershipCount: 1 });
    const email = mail({ cc: [{ email: "ops@example.com", name: null }], references: ["older@x"] });
    const outcome = await processInboundEmail(email, deps(store));
    expect(outcome).toMatchObject({ status: "processed", ticketId: "ticket-1000", ticketNumber: 1000, created: true, reopened: false, spam: false, acknowledged: true, ackError: null, route: "new", locale: "fr", localeSource: "user", organizationId: "org-1", attachments: { stored: 0, rejected: [] } });
    const created = store.created[0]!;
    expect(created).toMatchObject({ requesterEmail: "ada@example.com", requesterName: "Ada", requesterUserId: "user-ada", organizationId: "org-1", subject: "Pixel fires twice", status: "new", priority: "normal", locale: "fr", slaPolicyId: "policy-default", systemNote: null });
    expect(created.message).toMatchObject({ fromEmail: "ada@example.com", toEmails: ["support@support.track.site"], ccEmails: ["ops@example.com"], htmlBody: null, messageId: email.messageId, providerMessageId: email.providerMessageId, createdAt: NOW });
    expect(created.message.textBody).toContain("pixel");
    // Tuesday 12:00 Berlin + 8 business hours = Wednesday 11:00 Berlin; + 72 business hours = Friday of the following week 12:00 Berlin
    expect(created.firstResponseDueAt?.toISOString()).toBe("2026-09-09T09:00:00.000Z");
    expect(created.resolutionDueAt?.toISOString()).toBe("2026-09-18T10:00:00.000Z");
    // the persisted clock run: started when the mail arrived, the targets booked in business milliseconds
    expect(created).toMatchObject({ slaClockStartedAt: NOW, firstResponseTargetMs: 480 * 60_000, resolutionTargetMs: 4320 * 60_000 });
    expect(created.events).toEqual([{ kind: "created", actorKind: "customer", payload: expect.objectContaining({ channel: "email", locale: "fr", localeSource: "user", organizationMatched: true, requesterLinkWithheld: false, membershipCount: 1, spam: false, autoReply: false, attachmentsStored: 0, ackSkipped: null, senderAuthenticated: true, senderAuthenticatedVia: "dmarc", authservId: "mx.resend.com", authservTrusted: true }) }]);
    for (const event of created.events) expect(JSON.stringify(event.payload)).not.toContain("pixel and the events");
    // the acknowledgement row exists before the send, threads on the customer's message and is marked sent afterwards
    expect(store.outbound).toHaveLength(1);
    const ack = store.outbound[0]!;
    expect(ack).toMatchObject({ ticketId: "ticket-1000", fromEmail: "support@track.site", toEmails: ["ada@example.com"], subject: "Re: [Track #1000] Pixel fires twice", inReplyTo: email.messageId, references: ["older@x", email.messageId] });
    expect(ack.messageId).toMatch(/^t1000\.[0-9a-z]{26}@support\.track\.site$/);
    expect(ack.textBody).toBe("Bonjour Ada,\n\nmerci pour votre message. Nous l’avons enregistré sous le ticket n° 1000 et nous vous répondrons dans les meilleurs délais.\n\nVous pouvez ajouter des précisions à tout moment en répondant à cet e-mail.");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0]![0];
    expect(sent).toMatchObject({ locale: "fr", ticket: { id: "ticket-1000", number: 1000, requesterEmail: "ada@example.com", requesterName: "Ada" }, message: { messageId: ack.messageId, kind: "auto", inReplyTo: email.messageId } });
    expect(store.deliveries).toEqual([{ messageRowId: "msg-2", patch: { deliveryStatus: "sent", providerMessageId: "resend_ack_1" } }]);
  });

  it("falls back to headers, the text and finally English for the locale and skips the organisation when memberships are ambiguous", async () => {
    const store = new FakeStore();
    store.requesters.set("ada@example.com", { userId: "user-ada", name: "Ada", locale: "xx", organizationId: null, membershipCount: 2 });
    const byHeader = await processInboundEmail(mail({ headers: { ...AUTH_HEADERS, "content-language": "it-IT" } }), deps(store));
    expect(byHeader).toMatchObject({ status: "processed", locale: "it", localeSource: "header", organizationId: null });
    expect(store.created[0]).toMatchObject({ organizationId: null, requesterUserId: "user-ada" });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ organizationMatched: false, membershipCount: 2 });
    const byText = await processInboundEmail(mail({ text: "Hallo, wir haben ein Problem mit dem Pixel und die Events werden nicht gesendet. Bitte um Hilfe. Freundliche Grüße" }), deps(store));
    expect(byText).toMatchObject({ locale: "de", localeSource: "text" });
    expect(store.outbound.at(-1)!.textBody).toContain("Ticket #1001");
    const fallback = await processInboundEmail(mail({ text: "ok" }), deps(store));
    expect(fallback).toMatchObject({ locale: "en", localeSource: "default" });
  });

  it("runs the recorded Resend fixture end to end: receiving API, sanitised HTML, screened attachments, German acknowledgement", async () => {
    const store = new FakeStore();
    const downloads: string[] = [];
    const receiving: ResendReceivingClient = {
      async getEmail(id) {
        expect(id).toBe(received.data.email_id);
        return receivingGet;
      },
      async getAttachment(emailId, attachmentId) {
        expect(emailId).toBe(received.data.email_id);
        expect(attachmentId).toBe("att_01");
        return attachmentGet;
      },
      async download(url) {
        downloads.push(url);
        return Buffer.from("PNG-bytes-of-20-chars!".slice(0, 20));
      },
    };
    const parsed = parseResendReceivedEvent(received, "msg_fixture_1");
    if (!parsed.ok) throw new Error("fixture");
    const outcome = await handleInboundEvent(parsed.email, deps(store, { receiving }));
    expect(outcome).toMatchObject({ status: "processed", created: true, locale: "de", localeSource: "header", acknowledged: true, attachments: { stored: 1, rejected: [{ fileName: "export.zip", reason: "type_not_allowed" }] } });
    expect(downloads).toEqual([attachmentGet.download_url]);
    const created = store.created[0]!;
    expect(created.subject).toBe("Pixel feuert doppelt auf der Danke-Seite");
    expect(created.message.htmlBody).toBe("<p>Hallo,</p><p>seit gestern wird das <b>Purchase</b>-Event auf der Danke-Seite doppelt gesendet. Screenshot im Anhang.</p><p>Freundliche Grüße<br>Ada</p>");
    expect(created.message.htmlBody).not.toContain("script");
    expect(created.message.htmlBody).not.toContain("tracker.example");
    expect(created.message.textBody).toContain("Freundliche Grüße");
    expect(created.message).toMatchObject({ messageId: "CAB+ada-1@mail.example.com", providerMessageId: received.data.email_id, ccEmails: ["ops@example.com"] });
    expect(created.attachments).toEqual([expect.objectContaining({ fileName: "screenshot.png", contentType: "image/png", sizeBytes: 20, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })]);
    expect(created.systemNote).toBe("1 attachment refused:\n- export.zip (type not allowed)");
    expect(created.events[0]!.payload).toMatchObject({ authentication: { spf: "pass", dkim: "pass", dmarc: "pass" }, attachmentsStored: 1, attachmentsRejected: [{ fileName: "export.zip", reason: "type_not_allowed" }] });
    expect(store.outbound[0]!.textBody.startsWith("Hallo Ada Lovelace,\n\nvielen Dank für Ihre Nachricht. Wir haben sie als Ticket #1000 erhalten")).toBe(true);
    expect(store.ledger.get("msg_fixture_1")).toMatchObject({ status: "processed", ticketId: "ticket-1000", error: null });
  });

  it("fails honestly when bodies are missing and no receiving API is configured", async () => {
    const store = new FakeStore();
    const outcome = await handleInboundEvent(mail({ text: null, html: null }), deps(store));
    expect(outcome).toEqual({ status: "failed", error: "receiving api not configured (RESEND_API_KEY)" });
    expect(store.ledger.get("evt-" + counter)).toMatchObject({ status: "failed", error: "receiving api not configured (RESEND_API_KEY)" });
    expect(store.created).toHaveLength(0);
  });

  it("links a known member's user and organisation only for an authenticated From: a forged one stays unlinked and gets no acknowledgement", async () => {
    const store = new FakeStore();
    store.requesters.set("ada@example.com", { userId: "user-ada", name: "Ada L.", locale: "de", organizationId: "org-1", membershipCount: 1 });
    // the member's address, but no Authentication-Results (a domain without DMARC, no aligned DKIM / SPF): whoever sent this
    const forged = await processInboundEmail(mail({ headers: {} }), deps(store));
    expect(forged).toMatchObject({ status: "processed", created: true, spam: false, organizationId: null, acknowledged: false, ackError: null, ackSkipped: "unauthenticated", locale: "de", localeSource: "user" });
    expect(store.created[0]).toMatchObject({ requesterEmail: "ada@example.com", requesterUserId: null, organizationId: null, status: "new", slaPolicyId: "policy-default" });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ organizationMatched: false, requesterLinkWithheld: true, membershipCount: 1, senderAuthenticated: false, authservId: null, authservTrusted: false, ackSkipped: "unauthenticated" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.outbound).toHaveLength(0);
    // an aligned DKIM pass is enough to link (domains without DMARC), and the acknowledgement goes out
    const genuine = await processInboundEmail(mail({ headers: { "authentication-results": "mx; dkim=pass header.d=example.com; dmarc=none" } }), deps(store));
    expect(genuine).toMatchObject({ created: true, organizationId: "org-1", acknowledged: true, ackSkipped: null });
    expect(store.created[1]).toMatchObject({ requesterUserId: "user-ada", organizationId: "org-1" });
    expect(store.created[1]!.events[0]!.payload).toMatchObject({ organizationMatched: true, requesterLinkWithheld: false, senderAuthenticatedVia: "dkim", authservId: "mx", authservTrusted: true });
    // an unknown sender without authentication is acknowledged as before — there is nobody to impersonate
    const unknown = await processInboundEmail(mail({ from: { email: "someone@elsewhere.example", name: null }, headers: {} }), deps(store));
    expect(unknown).toMatchObject({ created: true, organizationId: null, acknowledged: true, ackSkipped: null });
    expect(store.created[2]!.events[0]!.payload).toMatchObject({ requesterLinkWithheld: false, membershipCount: 0 });
  });

  it("believes Authentication-Results only under a trusted authserv-id and reports the id it saw", async () => {
    const store = new FakeStore();
    store.requesters.set("ada@example.com", { userId: "user-ada", name: "Ada", locale: null, organizationId: "org-1", membershipCount: 1 });
    const warn = vi.fn();
    // nothing configured (the default of `defaultInboundDeps` until SUPPORT_AUTHSERV_ID names Resend's id): the same header proves nothing
    const unconfigured = await processInboundEmail(mail(), deps(store, { trustedAuthservIds: [], log: { ...silentLog, warn } }));
    expect(unconfigured).toMatchObject({ created: true, organizationId: null, ackSkipped: "unauthenticated" });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ senderAuthenticated: false, authservId: "mx.resend.com", authservTrusted: false, authentication: { spf: null, dkim: null, dmarc: null } });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ authservId: "mx.resend.com", trusted: [] }), "support.inbound.authserv_untrusted");
    // a forged header in front of the MTA's own: the first instance decides, the sender's id is not trusted
    const forgedFirst = await processInboundEmail(mail({ headers: { "authentication-results": "evil.example; dmarc=pass header.from=example.com, mx.resend.com; dmarc=fail header.from=example.com" } }), deps(store));
    expect(forgedFirst).toMatchObject({ created: true, organizationId: null, spam: false });
    expect(store.created[1]!.events[0]!.payload).toMatchObject({ senderAuthenticated: false, authservId: "evil.example", authservTrusted: false });
    // the MTA's own verdict in front of a forged one: the verdict stands and the forged instance is unreachable
    const forgedBehind = await processInboundEmail(mail({ headers: { "authentication-results": "mx.resend.com; dmarc=fail header.from=example.com, mx.resend.com; dmarc=pass header.from=example.com" } }), deps(store));
    expect(forgedBehind).toMatchObject({ created: true, spam: true, organizationId: null });
    expect(store.created[2]!.events[0]!.payload).toMatchObject({ spamReasons: ["dmarc fail"], senderAuthenticated: false, authservId: "mx.resend.com", authservTrusted: true });
    // a forged ARC-Authentication-Results under the trusted id — alone, or next to the MTA's honest `dmarc=none` — is never read:
    // ARC sets survive every hop (RFC 8617 §5.1), so the stripping that makes the pinned instance trustworthy does not cover them
    const forgedArc = { "arc-authentication-results": "i=1; mx.resend.com; dmarc=pass header.from=example.com; dkim=pass header.d=example.com" };
    const arcAlone = await processInboundEmail(mail({ headers: { ...forgedArc } }), deps(store, { log: { ...silentLog, warn } }));
    expect(arcAlone).toMatchObject({ created: true, organizationId: null, spam: false, ackSkipped: "unauthenticated" });
    expect(store.created[3]!.events[0]!.payload).toMatchObject({ senderAuthenticated: false, authservId: null, authservTrusted: false, requesterLinkWithheld: true, authentication: { spf: null, dkim: null, dmarc: null } });
    const arcBehindHonest = await processInboundEmail(mail({ headers: { "authentication-results": "mx.resend.com; dmarc=none header.from=example.com", ...forgedArc } }), deps(store));
    expect(arcBehindHonest).toMatchObject({ created: true, organizationId: null, spam: false, ackSkipped: "unauthenticated" });
    expect(store.created[4]!.events[0]!.payload).toMatchObject({ senderAuthenticated: false, authservId: "mx.resend.com", authservTrusted: true, authentication: { spf: null, dkim: null, dmarc: "none" } });
    expect(warn).toHaveBeenCalledTimes(1); // only the unconfigured case above warned — a forged ARC header alone is not an untrusted id
    expect(trustedAuthservIdsFromEnv("MX.resend.com, other.example ;x")).toEqual(["mx.resend.com", "other.example", "x"]);
    expect(trustedAuthservIdsFromEnv(undefined)).toEqual([]);
    expect(trustedAuthservIdsFromEnv("  ")).toEqual([]);
  });

  it("caps automatic acknowledgements per sender: the fourth new ticket within a day gets none, a day later one again", async () => {
    const store = new FakeStore();
    for (let i = 0; i < ACK_MAX_PER_SENDER; i++) {
      const outcome = await processInboundEmail(mail(), deps(store, { now: () => new Date(NOW.getTime() + i * 60_000) }));
      expect(outcome).toMatchObject({ created: true, acknowledged: true, ackSkipped: null });
    }
    const warn = vi.fn();
    const capped = await processInboundEmail(mail(), deps(store, { now: () => new Date(NOW.getTime() + ACK_MAX_PER_SENDER * 60_000), log: { ...silentLog, warn } }));
    expect(capped).toMatchObject({ status: "processed", created: true, spam: false, acknowledged: false, ackError: null, ackSkipped: "rate_limited" });
    expect(store.created.at(-1)!.events[0]!.payload).toMatchObject({ ackSkipped: "rate_limited" });
    expect(store.created).toHaveLength(ACK_MAX_PER_SENDER + 1);
    expect(sendMail).toHaveBeenCalledTimes(ACK_MAX_PER_SENDER);
    expect(store.outbound).toHaveLength(ACK_MAX_PER_SENDER);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ max: ACK_MAX_PER_SENDER, windowMs: ACK_WINDOW_MS }), "support.inbound.acknowledgement_rate_limited");
    // another sender is not affected; the window slides
    expect(await processInboundEmail(mail({ from: { email: "bob@example.com", name: null } }), deps(store))).toMatchObject({ acknowledged: true, ackSkipped: null });
    expect(await processInboundEmail(mail(), deps(store, { now: () => new Date(NOW.getTime() + ACK_WINDOW_MS + 1) }))).toMatchObject({ acknowledged: true, ackSkipped: null });
  });
});

describe("replies", () => {
  it("appends to the addressed ticket and reopens a solved one with a fresh resolution clock, without acknowledging", async () => {
    const store = new FakeStore();
    // answered and solved under the default policy; the stale due time lies in the past — the reopen must not leave it there
    store.seedTicket({ number: 1042, status: "solved", reopenCount: 1, locale: "de", slaPolicyId: "policy-default", firstRespondedAt: new Date(NOW.getTime() - 86_400_000), resolvedAt: new Date(NOW.getTime() - 3_600_000), resolutionDueAt: new Date(NOW.getTime() - 7_200_000) });
    const email = mail({ to: [{ email: "support+t1042@support.track.site", name: null }], subject: "Re: [Track #1042] Pixel fires twice" });
    const outcome = await processInboundEmail(email, deps(store));
    expect(outcome).toMatchObject({ status: "processed", ticketId: "ticket-1042", ticketNumber: 1042, created: false, reopened: true, acknowledged: false, route: "reply", via: "plus_address", locale: "de", organizationId: "org-1" });
    expect(store.created).toHaveLength(0);
    const appended = store.appended[0]!;
    expect(appended.ticketId).toBe("ticket-1042");
    // the engine's reopen: stamps cleared, the resolution clock restarted from now (Tuesday 12:00 Berlin + 4320 business
    // minutes) — and the persisted run moves to the reopening with the resolution target booked again
    expect(appended.patch).toEqual({ lastCustomerMessageAt: NOW, status: "open", reopenCount: 2, resolvedAt: null, closedAt: null, pausedAt: null, breachedResolution: false, resolutionDueAt: new Date("2026-09-18T10:00:00.000Z"), resolutionTargetMs: 4320 * 60_000, slaClockStartedAt: NOW });
    expect(appended.events.map((e) => e.kind)).toEqual(["reply", "reopened"]);
    expect(appended.events[1]!.payload).toEqual({ from: "solved", to: "open", reopenCount: 2 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.outbound).toHaveLength(0);
  });

  it("un-pauses a pending ticket by the business minutes of the pause and leaves open, new, on-hold and spam tickets alone", async () => {
    const store = new FakeStore();
    // paused Tuesday 11:00 Berlin, answered 12:00: sixty business minutes — the running due times move by exactly that
    store.seedTicket({ number: 1, status: "pending", pausedAt: new Date(NOW.getTime() - 3_600_000), pauseTotalMs: 500, slaPolicyId: "policy-default", firstResponseDueAt: new Date(NOW.getTime() + 3_600_000), resolutionDueAt: new Date(NOW.getTime() + 5 * 3_600_000) });
    await processInboundEmail(mail({ to: [{ email: "support+t1@support.track.site", name: null }] }), deps(store));
    expect(store.appended[0]!.patch).toEqual({ lastCustomerMessageAt: NOW, status: "open", pauseTotalMs: 3_600_500, pausedAt: null, firstResponseDueAt: new Date(NOW.getTime() + 2 * 3_600_000), resolutionDueAt: new Date(NOW.getTime() + 6 * 3_600_000) });
    expect(store.appended[0]!.events.map((e) => e.kind)).toEqual(["reply", "status"]);
    // a genuine customer reply may start the clocks of an agent-created ticket (the store applies the hook after the patch)
    expect(store.appended[0]!.firstCustomerReply).toBe(true);
    for (const [number, status] of [[2, "open"], [3, "new"], [4, "on_hold"], [5, "spam"]] as const) {
      store.seedTicket({ number, status });
      const outcome = await processInboundEmail(mail({ to: [{ email: `support+t${number}@support.track.site`, name: null }] }), deps(store));
      expect(store.appended.at(-1)!.patch, status).toEqual({ lastCustomerMessageAt: NOW });
      expect(store.appended.at(-1)!.events.map((e) => e.kind), status).toEqual(["reply"]);
      expect(outcome).toMatchObject({ created: false, reopened: false, spam: status === "spam", acknowledged: false });
    }
  });

  it("appends a spam-verdict reply (via the thread id) without reopening a solved ticket or un-pausing a pending one", async () => {
    const store = new FakeStore();
    store.seedTicket({ number: 11, status: "solved", reopenCount: 1 });
    store.seedTicket({ number: 12, status: "pending", pausedAt: new Date(NOW.getTime() - 60_000), pauseTotalMs: 0 });
    store.seedOutboundId("t11.abc@support.track.site", "ticket-11");
    store.seedOutboundId("t12.abc@support.track.site", "ticket-12");
    const forged = { "authentication-results": "mx; spf=fail; dkim=fail; dmarc=fail" };
    const solved = await processInboundEmail(mail({ headers: forged, inReplyTo: "t11.abc@support.track.site" }), deps(store));
    expect(solved).toMatchObject({ status: "processed", created: false, reopened: false, route: "reply", via: "thread", ticketId: "ticket-11" });
    expect(store.appended[0]!.patch).toEqual({ lastCustomerMessageAt: NOW });
    expect(store.appended[0]!.events.map((e) => e.kind)).toEqual(["reply"]);
    expect(store.appended[0]!.events[0]!.payload).toMatchObject({ spam: true, spamReasons: ["dmarc fail"], senderAuthenticated: false, senderAuthenticatedVia: null });
    // a spam-verdict reply never starts the clocks of an agent-created ticket either
    expect(store.appended[0]!.firstCustomerReply).toBe(false);
    const pending = await processInboundEmail(mail({ headers: forged, references: ["t12.abc@support.track.site"] }), deps(store));
    expect(pending).toMatchObject({ created: false, reopened: false, ticketId: "ticket-12" });
    expect(store.appended[1]!.patch).toEqual({ lastCustomerMessageAt: NOW });
    expect(sendMail).not.toHaveBeenCalled();
    // the same forged mail to the plus address is not a reply at all: a new spam ticket that names the intended one
    const plus = await processInboundEmail(mail({ headers: forged, to: [{ email: "support+t11@support.track.site", name: null }] }), deps(store));
    expect(plus).toMatchObject({ created: true, spam: true, route: "new", ticketNumber: 1000 });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 11, replyGuard: "unauthenticated", spam: true });
    expect(store.appended).toHaveLength(2);
  });

  it("threads on In-Reply-To / References and the subject tag, following a merged ticket", async () => {
    const store = new FakeStore();
    store.seedTicket({ number: 7 });
    store.seedOutboundId("t7.abc@support.track.site", "ticket-7");
    const byThread = await processInboundEmail(mail({ from: { email: "someone-else@example.com", name: null }, references: ["unknown@x", "t7.abc@support.track.site"] }), deps(store));
    expect(byThread).toMatchObject({ route: "reply", via: "thread", ticketId: "ticket-7" });
    const bySubject = await processInboundEmail(mail({ subject: "AW: [Track #7] Pixel" }), deps(store));
    expect(bySubject).toMatchObject({ route: "reply", via: "subject", ticketId: "ticket-7" });
  });

  it("matches a customer-supplied Message-ID for the same requester only (authenticated); the desk's own ids need nothing", async () => {
    const store = new FakeStore();
    store.seedTicket({ number: 1042, participants: ["ada@example.com", "ops@example.com"] });
    // Ada's original Message-ID sits on an inbound row — and in every mailbox and archive that mail reached
    store.seedInboundId("CAB+ada-1@mail.example.com", "ticket-1042");
    const stranger = await processInboundEmail(mail({ from: { email: "mallory@evil.example", name: null }, headers: { "authentication-results": "mx; dmarc=pass header.from=evil.example" }, references: ["CAB+ada-1@mail.example.com"] }), deps(store));
    expect(stranger).toMatchObject({ created: true, route: "new", ticketNumber: 1000 });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 1042, replyGuard: "stranger", senderAuthenticated: true });
    const unauthenticated = await processInboundEmail(mail({ headers: {}, inReplyTo: "CAB+ada-1@mail.example.com" }), deps(store));
    expect(unauthenticated).toMatchObject({ created: true, route: "new" });
    expect(store.created[1]!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 1042, replyGuard: "unauthenticated" });
    expect(store.appended).toHaveLength(0);
    // the cc'd colleague, authenticated: a participant, but not the requester — the customer's id alone is not enough
    // (docs/18 §"Hardening": thread ids match the desk's own ids or inbound ids of the same requester); the plus address still works for them
    const colleague = await processInboundEmail(mail({ from: { email: "ops@example.com", name: "Ops" }, inReplyTo: "CAB+ada-1@mail.example.com" }), deps(store));
    expect(colleague).toMatchObject({ created: true, route: "new" });
    expect(store.created[2]!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 1042, replyGuard: "stranger", senderAuthenticated: true });
    const colleagueByPlus = await processInboundEmail(mail({ from: { email: "ops@example.com", name: "Ops" }, to: [{ email: "support+t1042@support.track.site", name: null }] }), deps(store));
    expect(colleagueByPlus).toMatchObject({ created: false, route: "reply", via: "plus_address", ticketId: "ticket-1042" });
    // the requester herself, authenticated: accepted through her own id
    const requester = await processInboundEmail(mail({ inReplyTo: "CAB+ada-1@mail.example.com" }), deps(store));
    expect(requester).toMatchObject({ created: false, route: "reply", via: "thread", ticketId: "ticket-1042" });
    // the desk's own id proves possession: the same stranger, unauthenticated, is accepted
    store.seedOutboundId("t1042.abc@support.track.site", "ticket-1042");
    const byDeskId = await processInboundEmail(mail({ from: { email: "mallory@evil.example", name: null }, headers: {}, references: ["CAB+ada-1@mail.example.com", "t1042.abc@support.track.site"] }), deps(store));
    expect(byDeskId).toMatchObject({ created: false, route: "reply", via: "thread", ticketId: "ticket-1042" });
    expect(store.appended).toHaveLength(3);
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "thread", false, "outbound")).toBeNull();
    // a thread match of unknown direction is not proven to be the desk's own id: guarded (fail closed)
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "thread", false)).toBe("stranger");
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "thread", true, "inbound")).toBe("stranger");
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: ["ops@example.com"] }, "ops@example.com", "thread", true, "inbound")).toBe("stranger");
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: ["ops@example.com"] }, "ops@example.com", "plus_address", true)).toBeNull();
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "ada@example.com", "thread", false, "inbound")).toBe("unauthenticated");
    expect(replyGuard({ requesterEmail: "Ada@Example.com", participants: [] }, "ada@example.com", "thread", true, "inbound")).toBeNull();
    expect(senderMayReply({ requesterEmail: "ada@example.com", participants: [] }, "ada@example.com", "thread", true, "inbound")).toBe(true);
  });

  it("refuses a plus-address or subject reply from a stranger and opens a new ticket instead, but accepts participants", async () => {
    const store = new FakeStore();
    store.seedTicket({ number: 1042, participants: ["ada@example.com", "ops@example.com"] });
    const stranger = await processInboundEmail(mail({ from: { email: "mallory@evil.example", name: null }, headers: { "authentication-results": "mx; dmarc=pass header.from=evil.example" }, to: [{ email: "support+t1042@support.track.site", name: null }] }), deps(store));
    expect(stranger).toMatchObject({ status: "processed", created: true, route: "new", ticketNumber: 1000 });
    expect(store.appended).toHaveLength(0);
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 1042, replyGuard: "stranger", senderAuthenticated: true, senderAuthenticatedVia: "dmarc" });
    const participant = await processInboundEmail(mail({ from: { email: "ops@example.com", name: "Ops" }, subject: "Re: [Track #1042] Pixel" }), deps(store));
    expect(participant).toMatchObject({ created: false, route: "reply", via: "subject", ticketId: "ticket-1042" });
    expect(senderMayReply({ requesterEmail: "Ada@Example.com", participants: [] }, "ada@example.com", "plus_address", true)).toBe(true);
    expect(senderMayReply({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "thread", false, "outbound")).toBe(true);
    expect(senderMayReply({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "thread", false)).toBe(false);
    expect(senderMayReply({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "subject", true)).toBe(false);
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "x@y.z", "subject", true)).toBe("stranger");
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "ada@example.com", "plus_address", false)).toBe("unauthenticated");
    expect(replyGuard({ requesterEmail: "ada@example.com", participants: [] }, "ada@example.com", "plus_address", true)).toBeNull();
  });

  it("refuses a plus-address or subject reply whose From is not backed by an aligned SPF / DKIM / DMARC pass", async () => {
    const store = new FakeStore();
    store.seedTicket({ number: 1042 });
    // the requester's address, but no Authentication-Results at all (forged From on a domain without DMARC → dmarc=none)
    const unauthenticated: Array<Record<string, string>> = [{}, { "authentication-results": "mx; spf=none; dkim=none; dmarc=none" }, { "authentication-results": "mx; spf=pass smtp.mailfrom=evil.example; dkim=pass header.d=evil.example; dmarc=none" }];
    for (const headers of unauthenticated) {
      const refused = await processInboundEmail(mail({ headers, to: [{ email: "support+t1042@support.track.site", name: null }] }), deps(store));
      expect(refused).toMatchObject({ created: true, route: "new", spam: false });
      expect(store.created.at(-1)!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 1042, replyGuard: "unauthenticated", senderAuthenticated: false });
    }
    expect(store.appended).toHaveLength(0);
    // aligned DKIM or SPF alone is enough (domains without a DMARC record); the thread id needs nothing
    const byDkim = await processInboundEmail(mail({ headers: { "authentication-results": "mx; dkim=pass header.d=example.com; dmarc=none" }, to: [{ email: "support+t1042@support.track.site", name: null }] }), deps(store));
    expect(byDkim).toMatchObject({ created: false, route: "reply", via: "plus_address" });
    expect(store.appended.at(-1)!.events[0]!.payload).toMatchObject({ senderAuthenticated: true, senderAuthenticatedVia: "dkim" });
    const bySpf = await processInboundEmail(mail({ headers: { "authentication-results": "mx; spf=pass smtp.mailfrom=bounce@mail.example.com" }, subject: "Re: [Track #1042] Pixel" }), deps(store));
    expect(bySpf).toMatchObject({ created: false, route: "reply", via: "subject" });
    store.seedOutboundId("t1042.abc@support.track.site", "ticket-1042");
    const byThread = await processInboundEmail(mail({ headers: {}, inReplyTo: "t1042.abc@support.track.site" }), deps(store));
    expect(byThread).toMatchObject({ created: false, route: "reply", via: "thread" });
    expect(store.appended).toHaveLength(3);
  });

  it("falls back to the thread id when the plus address or subject tag is refused: a reply to a desk mail carries both", async () => {
    const store = new FakeStore();
    store.seedTicket({ number: 1042 });
    store.seedOutboundId("t1042.abc@support.track.site", "ticket-1042");
    // the requester through a relay that broke SPF and DKIM — Reply-To (plus address) and In-Reply-To both present
    const relayed = await processInboundEmail(mail({ headers: {}, to: [{ email: "support+t1042@support.track.site", name: null }], inReplyTo: "t1042.abc@support.track.site" }), deps(store));
    expect(relayed).toMatchObject({ created: false, route: "reply", via: "thread", ticketId: "ticket-1042" });
    expect(store.appended.at(-1)!.events[0]!.payload).toMatchObject({ via: "thread", senderAuthenticated: false });
    // a forwarded desk mail answered by a stranger: the thread id proves possession, the subject tag alone would not
    const forwarded = await processInboundEmail(mail({ from: { email: "colleague@other.example", name: null }, headers: { "authentication-results": "mx; dmarc=pass header.from=other.example" }, subject: "Fwd: [Track #1042] Pixel", references: ["t1042.abc@support.track.site"] }), deps(store));
    expect(forwarded).toMatchObject({ created: false, route: "reply", via: "thread", ticketId: "ticket-1042" });
    // without a thread id the refusal stands
    const refused = await processInboundEmail(mail({ headers: {}, to: [{ email: "support+t1042@support.track.site", name: null }], inReplyTo: "unknown@elsewhere.example" }), deps(store));
    expect(refused).toMatchObject({ created: true, route: "new" });
    expect(store.created.at(-1)!.events[0]!.payload).toMatchObject({ intendedTicketNumber: 1042, replyGuard: "unauthenticated" });
    expect(store.appended).toHaveLength(2);
  });
});

describe("loop guard, spam and acknowledgement rules", () => {
  it("stores automatic messages but never answers them", async () => {
    const store = new FakeStore();
    const outcome = await processInboundEmail(mail({ headers: { "auto-submitted": "auto-replied" }, subject: "Automatic reply: out of office" }), deps(store));
    expect(outcome).toMatchObject({ status: "processed", created: true, acknowledged: false, spam: false, ackSkipped: "auto_reply" });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ autoReply: true, autoReplyReason: "auto-submitted: auto-replied", ackSkipped: "auto_reply" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("suppresses the acknowledgement for X-Auto-Response-Suppress, do-not-email senders and while the switch is off", async () => {
    const store = new FakeStore();
    const suppressed = await processInboundEmail(mail({ headers: { "x-auto-response-suppress": "All" } }), deps(store));
    store.flags.set("ada@example.com", { blocked: false, doNotEmail: true });
    const doNotEmail = await processInboundEmail(mail(), deps(store));
    store.flags.delete("ada@example.com");
    store.settings = { ...store.settings, autoReplyEnabled: false };
    const disabled = await processInboundEmail(mail(), deps(store));
    expect([suppressed, doNotEmail, disabled].map((o) => (o.status === "processed" ? o.ackSkipped : o.status))).toEqual(["suppressed", "do_not_email", "disabled"]);
    expect(store.created).toHaveLength(3);
    expect(store.created.every((c) => c.status === "new")).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.outbound).toHaveLength(0);
  });

  it("files spam as a spam ticket without SLA clock or acknowledgement", async () => {
    const store = new FakeStore();
    store.flags.set("spammer@example.net", { blocked: true, doNotEmail: false });
    const blocked = await processInboundEmail(mail({ from: { email: "spammer@example.net", name: null } }), deps(store));
    expect(blocked).toMatchObject({ status: "processed", created: true, spam: true, acknowledged: false, ackSkipped: "spam" });
    expect(store.created[0]).toMatchObject({ status: "spam", slaPolicyId: null, firstResponseDueAt: null, resolutionDueAt: null });
    expect(store.created[0]!.events[0]!.payload).toMatchObject({ spam: true, spamReasons: ["blocked sender"] });
    const dmarc = await processInboundEmail(mail({ headers: { "authentication-results": "mx; spf=fail; dkim=fail; dmarc=fail" } }), deps(store));
    expect(dmarc).toMatchObject({ spam: true });
    expect(store.created[1]!.events[0]!.payload).toMatchObject({ spamReasons: ["dmarc fail"] });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("drops mail from the desk's own sender and reply domain", async () => {
    const store = new FakeStore();
    const own = await handleInboundEvent(mail({ from: { email: "support+t1@support.track.site", name: null } }), deps(store));
    expect(own).toEqual({ status: "ignored", reason: "own_address" });
    expect(store.ledger.get(`evt-${counter}`)).toMatchObject({ status: "ignored", ticketId: null });
    const sender = await processInboundEmail(mail({ from: { email: "Support@track.site", name: null } }), deps(store));
    expect(sender).toEqual({ status: "ignored", reason: "own_address" });
    expect(store.created).toHaveLength(0);
  });

  it("records a failed acknowledgement transport on the message instead of throwing", async () => {
    const store = new FakeStore();
    sendMail.mockResolvedValueOnce({ ok: false, transport: "smtp", error: "smtp down", messageId: "x" });
    const outcome = await processInboundEmail(mail(), deps(store));
    expect(outcome).toMatchObject({ status: "processed", created: true, acknowledged: false, ackError: "smtp down" });
    expect(store.deliveries).toEqual([{ messageRowId: "msg-2", patch: { deliveryStatus: "failed", deliveryError: "smtp down" } }]);
  });

  it("keeps a committed ticket when the acknowledgement's own writes fail: recorded as ackError, never thrown", async () => {
    const store = new FakeStore();
    store.failOutbound = true;
    const outcome = await handleInboundEvent(mail(), deps(store));
    expect(outcome).toMatchObject({ status: "processed", created: true, acknowledged: false, ackError: "db down" });
    expect(store.created).toHaveLength(1);
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.ledger.get("evt-" + counter)).toMatchObject({ status: "processed", ticketId: "ticket-1000", error: null });
    // the mail went out, only the delivery update was lost: the outcome says so
    store.failOutbound = false;
    store.failDeliveryUpdateOnce = true;
    const sent = await processInboundEmail(mail(), deps(store));
    expect(sent).toMatchObject({ status: "processed", created: true, acknowledged: true, ackError: "connection lost" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(store.deliveries).toHaveLength(0);
  });
});

describe("attachments", () => {
  const scanner: AttachmentScanner = {
    name: "test-scanner",
    async scan(_content, meta) {
      return meta.fileName === "virus.pdf" ? { clean: false, detail: "EICAR" } : { clean: true, detail: "clean" };
    },
  };

  it("screens by type, size and count, downloads through the receiving API, hashes, scans and notes the refused ones", async () => {
    const store = new FakeStore();
    const receiving: ResendReceivingClient = {
      async getEmail() {
        throw new Error("not needed");
      },
      async getAttachment(_emailId, id) {
        if (id === "gone") throw new Error("404");
        return { id, download_url: `https://files.resend.test/${id}` };
      },
      async download(url) {
        return Buffer.from(`bytes:${url}`);
      },
    };
    const png = { providerId: null, fileName: "a.png", contentType: "image/png", sizeBytes: 3, contentId: null, inline: false, downloadUrl: null, content: Buffer.from("abc") };
    const email = mail({
      attachments: [
        png,
        { ...png, providerId: "remote", fileName: "b.pdf", contentType: "application/pdf", sizeBytes: 100, content: null },
        { ...png, providerId: "gone", fileName: "c.pdf", contentType: "application/pdf", sizeBytes: 100, content: null },
        { ...png, fileName: "virus.pdf", contentType: "application/pdf", sizeBytes: 10, content: Buffer.from("X5O!P%@AP") },
        { ...png, fileName: "tool.exe", contentType: "application/x-msdownload" },
        { ...png, fileName: "huge.png", sizeBytes: 6 * 1024 * 1024, content: null },
        { ...png, providerId: null, fileName: "no-bytes.png", sizeBytes: 5, content: null },
      ],
    });
    const outcome = await processInboundEmail(email, deps(store, { receiving, scanner }));
    expect(outcome).toMatchObject({
      status: "processed",
      attachments: {
        stored: 2,
        rejected: [
          { fileName: "tool.exe", reason: "type_not_allowed" },
          { fileName: "huge.png", reason: "too_large" },
          { fileName: "c.pdf", reason: "download_failed" },
          { fileName: "virus.pdf", reason: "scanner_rejected" },
          { fileName: "no-bytes.png", reason: "download_failed" },
        ],
      },
    });
    const stored = store.created[0]!.attachments;
    expect(stored.map((a) => [a.fileName, a.sizeBytes])).toEqual([
      ["a.png", 3],
      ["b.pdf", "bytes:https://files.resend.test/remote".length],
    ]);
    expect(stored[0]!.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(store.created[0]!.systemNote).toBe("5 attachments refused:\n- tool.exe (type not allowed)\n- huge.png (too large)\n- c.pdf (download failed)\n- virus.pdf (scanner rejected)\n- no-bytes.png (download failed)");
  });

  it("formats the note and the html budget helpers", () => {
    expect(attachmentsNote([])).toBeNull();
    expect(attachmentsNote([{ fileName: "x.zip", reason: "type_not_allowed" }])).toBe("1 attachment refused:\n- x.zip (type not allowed)");
    const inline = '<p>a</p><img src="data:image/png;base64,AAAA" alt=""><p>b</p>';
    expect(limitHtml(inline, 1000)).toBe(inline);
    expect(limitHtml(inline, 40)).toBe("<p>a</p><p>b</p>");
    expect(limitHtml(inline, 10)).toBeNull();
  });
});

describe("ledger", () => {
  it("acknowledges duplicates, reports in-progress deliveries and retries failed or stale ones", async () => {
    const store = new FakeStore();
    const email = mail();
    const first = await handleInboundEvent(email, deps(store));
    expect(first).toMatchObject({ status: "processed", created: true });
    expect(await handleInboundEvent(email, deps(store))).toEqual({ status: "duplicate" });
    expect(store.created).toHaveLength(1);
    // a delivery still being processed by another instance
    const inFlight = mail();
    await store.beginEvent(inFlight.providerEventId, "resend", NOW);
    expect(await handleInboundEvent(inFlight, deps(store))).toEqual({ status: "in_progress" });
    // stale: reprocessed
    expect(await handleInboundEvent(inFlight, deps(store, { now: () => new Date(NOW.getTime() + INBOUND_EVENT_STALE_MS + 1) }))).toMatchObject({ status: "processed" });
    // failed: recorded on the ledger, retried later
    store.failCreate = true;
    const failing = mail();
    expect(await handleInboundEvent(failing, deps(store))).toEqual({ status: "failed", error: "db down" });
    expect(store.ledger.get(failing.providerEventId)).toMatchObject({ status: "failed", error: "db down" });
    store.failCreate = false;
    expect(await handleInboundEvent(failing, deps(store))).toMatchObject({ status: "processed", created: true });
    expect(store.ledger.get(failing.providerEventId)).toMatchObject({ status: "processed", error: null });
  });

  it("never stores a mail twice: a retry after a failure behind the commit answers with the stored ticket", async () => {
    const store = new FakeStore();
    const email = mail();
    store.failFinishOnce = true; // the ticket and its acknowledgement are committed, then the ledger update fails
    expect(await handleInboundEvent(email, deps(store))).toEqual({ status: "failed", error: "ledger down" });
    expect(store.created).toHaveLength(1);
    expect(store.ledger.get(email.providerEventId)).toMatchObject({ status: "failed", error: "ledger down" });
    // Resend retries the same delivery
    const retry = await handleInboundEvent(email, deps(store));
    expect(retry).toMatchObject({ status: "processed", created: false, reopened: false, route: "stored", via: null, ticketId: "ticket-1000", ticketNumber: 1000, messageRowId: "msg-1", acknowledged: false, ackError: null, locale: "en", organizationId: null, attachments: { stored: 0, rejected: [] } });
    expect(store.created).toHaveLength(1);
    expect(store.appended).toHaveLength(0);
    expect(store.outbound).toHaveLength(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(store.ledger.get(email.providerEventId)).toMatchObject({ status: "processed", ticketId: "ticket-1000", error: null });
    // the same e-mail under a fresh delivery id (a re-sent webhook) is a replay as well, also for a stored reply
    expect(await handleInboundEvent({ ...email, providerEventId: "evt-resent" }, deps(store))).toMatchObject({ status: "processed", route: "stored", ticketId: "ticket-1000" });
    store.seedTicket({ number: 7, status: "spam" });
    const reply = mail({ to: [{ email: "support+t7@support.track.site", name: null }] });
    expect(await processInboundEmail(reply, deps(store))).toMatchObject({ route: "reply", created: false, ticketId: "ticket-7" });
    expect(await processInboundEmail(reply, deps(store))).toMatchObject({ route: "stored", created: false, ticketId: "ticket-7", ticketNumber: 7, spam: true });
    expect(store.appended).toHaveLength(1);
    expect(inboundOutcomeResponse(retry)).toMatchObject({ status: 200, body: { ok: true, created: false, route: "stored", number: 1000 } });
  });

  it("answers a concurrent delivery of the same mail with the stored ticket when the store reports it already stored", async () => {
    const store = new FakeStore();
    // the Drizzle store serialises both deliveries on the mail's provider id; the loser sees the winner's row inside its transaction
    store.alreadyStoredOnWrite = { ticketId: "ticket-1000", ticketNumber: 1000, messageRowId: "msg-1", status: "new", locale: "en", organizationId: "org-1" };
    const email = mail();
    const created = await handleInboundEvent(email, deps(store));
    expect(created).toMatchObject({ status: "processed", created: false, route: "stored", ticketId: "ticket-1000", ticketNumber: 1000, messageRowId: "msg-1", acknowledged: false, ackSkipped: null, organizationId: "org-1" });
    expect(store.created).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.ledger.get(email.providerEventId)).toMatchObject({ status: "processed", ticketId: "ticket-1000" });
    // the same for a reply
    store.seedTicket({ number: 7 });
    store.alreadyStoredOnWrite = { ticketId: "ticket-7", ticketNumber: 7, messageRowId: "msg-9", status: "open", locale: "en", organizationId: "org-1" };
    const appended = await processInboundEmail(mail({ to: [{ email: "support+t7@support.track.site", name: null }] }), deps(store));
    expect(appended).toMatchObject({ created: false, route: "stored", ticketId: "ticket-7", messageRowId: "msg-9" });
    expect(store.appended).toHaveLength(0);
  });

  it("maps outcomes to webhook answers with ids and counts only", () => {
    expect(inboundOutcomeResponse({ status: "duplicate" })).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(inboundOutcomeResponse({ status: "in_progress" }).status).toBe(409);
    expect(inboundOutcomeResponse({ status: "ignored", reason: "own_address" })).toEqual({ status: 200, body: { ok: true, ignored: true, reason: "own_address" } });
    expect(inboundOutcomeResponse({ status: "failed", error: "secret detail" })).toEqual({ status: 500, body: { ok: false, code: "PROCESSING_FAILED" } });
    const processed = inboundOutcomeResponse({ status: "processed", ticketId: "t", ticketNumber: 1, messageRowId: "m", created: true, reopened: false, spam: false, acknowledged: false, ackError: null, ackSkipped: "rate_limited", route: "new", via: null, locale: "en", localeSource: "default", organizationId: null, attachments: { stored: 1, rejected: [{ fileName: "x", reason: "too_large" }] } });
    expect(processed).toEqual({ status: 200, body: { ok: true, ticketId: "t", number: 1, created: true, reopened: false, spam: false, acknowledged: false, ackSkipped: "rate_limited", route: "new", via: null, attachments: { stored: 1, rejected: 1 } } });
  });
});

describe("ledger payload and the structural replay guard (hardening)", () => {
  it("keeps the parsed event on the ledger row without bodies, bytes or signed links, and rebuilds the mail for a reprocess", async () => {
    const store = new FakeStore();
    const email = mail({
      cc: [{ email: "ops@example.com", name: "Ops" }],
      references: ["older@x"],
      html: "<p>secret body</p>",
      attachments: [{ providerId: "att-1", fileName: "a.png", contentType: "image/png", sizeBytes: 3, contentId: null, inline: false, downloadUrl: "https://signed.example/a.png?token=1", content: Buffer.from("PNG") }],
    });
    await handleInboundEvent(email, deps(store));
    const payload = store.ledger.get(email.providerEventId)!.payload!;
    expect(payload).toMatchObject({ v: 1, provider: "resend", providerMessageId: email.providerMessageId, from: { email: "ada@example.com", name: "Ada" }, cc: [{ email: "ops@example.com", name: "Ops" }], subject: "Pixel fires twice", messageId: email.messageId, references: ["older@x"], headersDropped: false, receivedAt: NOW.toISOString() });
    expect(payload.attachments).toEqual([{ providerId: "att-1", fileName: "a.png", contentType: "image/png", sizeBytes: 3, contentId: null, inline: false }]);
    const json = JSON.stringify(payload);
    for (const never of ["secret body", "pixel and the events", "PNG", "signed.example", "token=1", "text", "html", "content"]) expect(json).not.toContain(`"${never}"`);
    expect(json).not.toContain("secret body");
    expect(json).not.toContain("signed.example");
    // a reprocess rebuilds the mail under the ledger row's own event id: bodies null (the receiving API fills them), no bytes, no link
    const rebuilt = inboundEmailFromLedgerPayload(payload, email.providerEventId)!;
    expect(rebuilt).toMatchObject({ providerEventId: email.providerEventId, providerMessageId: email.providerMessageId, from: email.from, to: email.to, cc: [{ email: "ops@example.com", name: "Ops" }], subject: email.subject, messageId: email.messageId, inReplyTo: null, references: ["older@x"], headers: email.headers, text: null, html: null, receivedAt: NOW });
    expect(rebuilt.attachments).toEqual([{ providerId: "att-1", fileName: "a.png", contentType: "image/png", sizeBytes: 3, contentId: null, inline: false, downloadUrl: null }]);
    expect(ledgerPayloadOf(rebuilt)).toEqual(payload);
    // the rebuilt mail runs through the pipeline like a first delivery: already stored → the stored route, never a second ticket
    expect(await handleInboundEvent(rebuilt, deps(store))).toMatchObject({ status: "duplicate" });
    store.ledger.get(email.providerEventId)!.status = "failed";
    expect(await handleInboundEvent(rebuilt, deps(store))).toMatchObject({ status: "processed", route: "stored", ticketId: "ticket-1000" });
    expect(store.created).toHaveLength(1);
    // foreign JSON, a delivery event's row (no payload) or a broken date is not a payload
    expect(inboundEmailFromLedgerPayload(null, "evt")).toBeNull();
    expect(inboundEmailFromLedgerPayload({ v: 2 }, "evt")).toBeNull();
    expect(inboundEmailFromLedgerPayload({ ...payload, receivedAt: "yesterday" }, "evt")).toBeNull();
    expect(inboundEmailFromLedgerPayload({ ...payload, from: { email: "x" } }, "evt")).toBeNull();
  });

  it("drops oversized headers from the ledger row and says so", () => {
    const huge = mail({ headers: { "x-big": "y".repeat(INBOUND_LEDGER_HEADERS_MAX_CHARS + 1) } });
    const payload = ledgerPayloadOf(huge);
    expect(payload.headers).toEqual({});
    expect(payload.headersDropped).toBe(true);
    expect(inboundEmailFromLedgerPayload(payload, "evt")?.headers).toEqual({});
  });

  it("refreshes the stored payload on a retry and keeps it for a delivery without one", async () => {
    const store = new FakeStore();
    const email = mail();
    store.failCreate = true;
    await handleInboundEvent(email, deps(store));
    expect(store.ledger.get(email.providerEventId)).toMatchObject({ status: "failed", payload: expect.objectContaining({ providerMessageId: email.providerMessageId }) });
    // the ledger interface takes no payload for delivery events (the delivery handler) — the row keeps what it has
    expect(await store.beginEvent(email.providerEventId, "resend", NOW)).toBe("retry");
    expect(store.ledger.get(email.providerEventId)!.payload).toMatchObject({ providerMessageId: email.providerMessageId });
  });

  it("recognises the unique violation of the partial index on inbound provider ids, wrapped or not", () => {
    const violation = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505", constraint: INBOUND_PROVIDER_UNIQUE_INDEX });
    expect(isInboundReplayViolation(violation)).toBe(true);
    // drizzle wraps the driver error in `cause`
    expect(isInboundReplayViolation(Object.assign(new Error("Failed query"), { cause: violation }))).toBe(true);
    expect(isInboundReplayViolation(Object.assign(new Error("other unique"), { code: "23505", constraint: "support_tickets_number_uq" }))).toBe(false);
    expect(isInboundReplayViolation(Object.assign(new Error("deadlock"), { code: "40P01", constraint: INBOUND_PROVIDER_UNIQUE_INDEX }))).toBe(false);
    expect(isInboundReplayViolation(new Error("plain"))).toBe(false);
    expect(isInboundReplayViolation(null)).toBe(false);
    expect(INBOUND_PROVIDER_UNIQUE_INDEX).toBe("support_messages_inbound_provider_uq");
  });
});

describe("acknowledgement copy", () => {
  it("greets by name or generically in every active locale and names the ticket number", () => {
    for (const locale of ACTIVE_LOCALES) {
      const named = acknowledgementText(locale, 1042, "Ada");
      expect(named, locale).toContain("Ada");
      expect(named, locale).toContain("1042");
      const anonymous = acknowledgementText(locale, 1042, null);
      expect(anonymous, locale).not.toContain("Ada");
      expect(anonymous, locale).toContain("1042");
      expect(anonymous.split("\n\n").length, locale).toBeGreaterThanOrEqual(2);
    }
    expect(acknowledgementText("xx", 1, "Ada")).toBe(acknowledgementText("en", 1, "Ada"));
    expect(acknowledgementText("en", 1, "Ada\r\nBcc: x")).toContain("Hello Ada Bcc: x,");
  });
});
