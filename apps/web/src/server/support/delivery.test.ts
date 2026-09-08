import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envState: { RESEND_WEBHOOK_SECRET?: string; RESEND_DELIVERY_WEBHOOK_SECRET?: string } = {};
vi.mock("@/env", () => ({ env: () => envState }));
vi.mock("@/server/db", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }, db: () => null }));

import type { SupportDeliveryStatus } from "@track-site/db";
import bounced from "./fixtures/resend/email-bounced.json";
import complained from "./fixtures/resend/email-complained.json";
import delivered from "./fixtures/resend/email-delivered.json";
import failed from "./fixtures/resend/email-failed.json";
import { deliveryOutcomeResponse, deliveryWebhookSecret, handleDeliveryEvent, processDeliveryEvent, type DeliveryMessage, type DeliveryStore } from "./delivery";
import { parseResendDeliveryEvent, type DeliveryEvent } from "./inbound";
import { INBOUND_EVENT_STALE_MS, type DeliveryPatch, type LedgerBegin, type LedgerFinish } from "./inbound-handler";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };
const EMAIL_ID = "9c2f7f0e-5b3a-4c2e-9d1a-0f3b2a1c4d5e";

class FakeDeliveryStore implements DeliveryStore {
  ledger = new Map<string, { status: string; receivedAt: Date; ticketId: string | null; error: string | null }>();
  messages = new Map<string, DeliveryMessage>();
  updates: Array<{ messageRowId: string; patch: DeliveryPatch }> = [];
  tagged: Array<{ requesterEmail: string; context: Record<string, unknown> }> = [];
  alreadyTagged = false;
  failUpdate = false;

  seed(status: SupportDeliveryStatus = "sent"): DeliveryMessage {
    const message: DeliveryMessage = { messageRowId: "msg-ack", ticketId: "ticket-1042", organizationId: "org-1", deliveryStatus: status, requesterEmail: "ada@example.com" };
    this.messages.set(EMAIL_ID, message);
    return message;
  }
  async beginEvent(id: string, _provider: string, now: Date): Promise<LedgerBegin> {
    const row = this.ledger.get(id);
    if (!row) {
      this.ledger.set(id, { status: "received", receivedAt: now, ticketId: null, error: null });
      return "new";
    }
    if (row.status === "processed" || row.status === "ignored") return "duplicate";
    if (row.status === "received" && now.getTime() - row.receivedAt.getTime() < INBOUND_EVENT_STALE_MS) return "in_progress";
    return "retry";
  }
  async finishEvent(id: string, patch: LedgerFinish): Promise<void> {
    const row = this.ledger.get(id)!;
    row.status = patch.status;
    row.ticketId = patch.ticketId ?? null;
    row.error = patch.error ?? null;
  }
  async findMessageByProviderId(emailId: string) {
    return this.messages.get(emailId) ?? null;
  }
  async updateDelivery(messageRowId: string, patch: DeliveryPatch) {
    if (this.failUpdate) throw new Error("db down");
    this.updates.push({ messageRowId, patch });
    const message = [...this.messages.values()].find((m) => m.messageRowId === messageRowId);
    if (message) message.deliveryStatus = patch.deliveryStatus;
  }
  async markDoNotEmail(requesterEmail: string, context: Record<string, unknown>) {
    this.tagged.push({ requesterEmail, context });
    return { ticketsTagged: this.alreadyTagged ? 0 : 2 };
  }
}

const event = (json: unknown, id: string): DeliveryEvent => {
  const parsed = parseResendDeliveryEvent(json, id);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.event;
};
const deps = (store: DeliveryStore) => ({ store, now: () => NOW, log: silentLog });

afterEach(() => {
  delete envState.RESEND_WEBHOOK_SECRET;
  delete envState.RESEND_DELIVERY_WEBHOOK_SECRET;
});

describe("processDeliveryEvent", () => {
  it("moves a sent acknowledgement to delivered and clears an earlier error", async () => {
    const store = new FakeDeliveryStore();
    store.seed("sent");
    const outcome = await processDeliveryEvent(event(delivered, "msg_d"), deps(store));
    expect(outcome).toEqual({ status: "processed", messageRowId: "msg-ack", ticketId: "ticket-1042", from: "sent", to: "delivered", doNotEmail: false, ticketsTagged: 0 });
    expect(store.updates).toEqual([{ messageRowId: "msg-ack", patch: { deliveryStatus: "delivered", deliveryError: null } }]);
    expect(store.tagged).toHaveLength(0);
  });

  it("records bounces and failures with their reason and ignores out-of-order or unknown events", async () => {
    const store = new FakeDeliveryStore();
    store.seed("sent");
    await processDeliveryEvent(event(bounced, "msg_b"), deps(store));
    expect(store.updates.at(-1)).toEqual({ messageRowId: "msg-ack", patch: { deliveryStatus: "bounced", deliveryError: "Permanent/General: The recipient's email address does not exist." } });
    expect(await processDeliveryEvent(event(delivered, "msg_late"), deps(store))).toEqual({ status: "ignored", reason: "no_status_change" });
    expect(store.updates).toHaveLength(1);
    store.seed("queued");
    await processDeliveryEvent(event(failed, "msg_f"), deps(store));
    expect(store.updates.at(-1)).toEqual({ messageRowId: "msg-ack", patch: { deliveryStatus: "failed", deliveryError: "Sending domain is not verified" } });
    expect(await processDeliveryEvent({ ...event(delivered, "msg_x"), emailId: "unknown-id" }, deps(store))).toEqual({ status: "ignored", reason: "no_message" });
    expect(await processDeliveryEvent({ ...event(delivered, "msg_delay"), type: "email.delivery_delayed" }, deps(store))).toEqual({ status: "ignored", reason: "no_status_change" });
  });

  it("flags the requester do-not-email on a complaint, even when the status already says so", async () => {
    const store = new FakeDeliveryStore();
    store.seed("delivered");
    const first = await processDeliveryEvent(event(complained, "msg_c1"), deps(store));
    expect(first).toEqual({ status: "processed", messageRowId: "msg-ack", ticketId: "ticket-1042", from: "delivered", to: "complained", doNotEmail: true, ticketsTagged: 2 });
    expect(store.updates.at(-1)).toEqual({ messageRowId: "msg-ack", patch: { deliveryStatus: "complained", deliveryError: "complaint" } });
    expect(store.tagged).toEqual([{ requesterEmail: "ada@example.com", context: { ticketId: "ticket-1042", organizationId: "org-1", messageRowId: "msg-ack", emailId: EMAIL_ID, providerEventId: "msg_c1" } }]);
    store.alreadyTagged = true;
    const again = await processDeliveryEvent(event(complained, "msg_c2"), deps(store));
    expect(again).toMatchObject({ status: "processed", from: "complained", to: "complained", doNotEmail: true, ticketsTagged: 0 });
    expect(store.updates).toHaveLength(1);
  });
});

describe("handleDeliveryEvent", () => {
  it("keeps the ledger: duplicate, in-progress, failure with the error recorded", async () => {
    const store = new FakeDeliveryStore();
    store.seed("sent");
    const e = event(delivered, "msg_once");
    expect(await handleDeliveryEvent(e, deps(store))).toMatchObject({ status: "processed" });
    expect(store.ledger.get("msg_once")).toMatchObject({ status: "processed", ticketId: "ticket-1042" });
    expect(await handleDeliveryEvent(e, deps(store))).toEqual({ status: "duplicate" });
    await store.beginEvent("msg_flight", "resend", NOW);
    expect(await handleDeliveryEvent({ ...e, providerEventId: "msg_flight" }, deps(store))).toEqual({ status: "in_progress" });
    store.seed("sent");
    store.failUpdate = true;
    expect(await handleDeliveryEvent({ ...e, providerEventId: "msg_fail" }, deps(store))).toEqual({ status: "failed", error: "db down" });
    expect(store.ledger.get("msg_fail")).toMatchObject({ status: "failed", error: "db down" });
    const ignored = await handleDeliveryEvent({ ...e, providerEventId: "msg_none", emailId: "nope" }, deps(store));
    expect(ignored).toEqual({ status: "ignored", reason: "no_message" });
    expect(store.ledger.get("msg_none")).toMatchObject({ status: "ignored", ticketId: null });
  });

  it("maps outcomes to webhook answers", () => {
    expect(deliveryOutcomeResponse({ status: "duplicate" })).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(deliveryOutcomeResponse({ status: "in_progress" }).status).toBe(409);
    expect(deliveryOutcomeResponse({ status: "ignored", reason: "no_message" })).toEqual({ status: 200, body: { ok: true, ignored: true, reason: "no_message" } });
    expect(deliveryOutcomeResponse({ status: "failed", error: "x" })).toEqual({ status: 500, body: { ok: false, code: "PROCESSING_FAILED" } });
    expect(deliveryOutcomeResponse({ status: "processed", messageRowId: "m", ticketId: "t", from: "sent", to: "delivered", doNotEmail: false, ticketsTagged: 0 })).toEqual({ status: 200, body: { ok: true, ticketId: "t", messageId: "m", from: "sent", to: "delivered", doNotEmail: false, ticketsTagged: 0 } });
  });

  it("uses the dedicated delivery secret (validated env), else the shared inbound secret, else refuses", () => {
    expect(deliveryWebhookSecret()).toBeNull();
    envState.RESEND_WEBHOOK_SECRET = "whsec_shared";
    expect(deliveryWebhookSecret()).toBe("whsec_shared");
    envState.RESEND_DELIVERY_WEBHOOK_SECRET = "   ";
    expect(deliveryWebhookSecret()).toBe("whsec_shared");
    envState.RESEND_DELIVERY_WEBHOOK_SECRET = " whsec_own ";
    expect(deliveryWebhookSecret()).toBe("whsec_own");
    process.env.RESEND_DELIVERY_WEBHOOK_SECRET = "whsec_raw_process_env"; // only the validated schema counts
    delete envState.RESEND_DELIVERY_WEBHOOK_SECRET;
    expect(deliveryWebhookSecret()).toBe("whsec_shared");
    delete process.env.RESEND_DELIVERY_WEBHOOK_SECRET;
  });
});
