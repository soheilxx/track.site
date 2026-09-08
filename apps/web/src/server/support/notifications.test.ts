import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envState: { HOST_MARKETING?: string } = {};
vi.mock("@/env", () => ({ env: () => envState }));
vi.mock("@/server/db", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const sendMail = vi.fn();
vi.mock("@/server/mail", () => ({ sendMail: (mail: unknown) => sendMail(mail) }));

import { SUPPORT_NOTIFICATION_KINDS } from "@track-site/db";
import { ACTIVE_LOCALES } from "@/i18n/routing";
import { getMailCopy } from "@/server/mail/templates";
import { NOTIFICATION_KINDS, NOTIFICATION_MAIL_KINDS } from "@/components/ops/shell/notifications/constants";
import {
  buildNotificationMail,
  continueFrom,
  SYNC_OVERLAP_MS,
  deliverNotificationMails,
  extractMentions,
  isNotificationKind,
  mentionPatterns,
  opsOrigin,
  recipientsForEvent,
  ticketPath,
  ticketUrl,
  type FanOutEvent,
  type PendingMail,
} from "./notifications";

const ADA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const CARA = "33333333-3333-4333-8333-333333333333";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";
const TICKET = "55555555-5555-4555-8555-555555555555";
const EVENT = "66666666-6666-4666-8666-666666666666";
const operators = new Set([ADA, BEN, CARA]);
const agents = [
  { id: ADA, name: "Ada Lovelace" },
  { id: BEN, name: "Ben Stone" },
  { id: CARA, name: "Ben Ali" },
];

const event = (over: Partial<FanOutEvent>): FanOutEvent => ({ id: EVENT, ticketId: TICKET, kind: "assignee", actorKind: "agent", actorUserId: BEN, payload: {}, ticketAssigneeUserId: null, ...over });

beforeEach(() => {
  delete envState.HOST_MARKETING;
  sendMail.mockReset();
});

describe("constants", () => {
  it("mirror the database enumeration and name the mailed kinds", () => {
    expect([...NOTIFICATION_KINDS]).toEqual([...SUPPORT_NOTIFICATION_KINDS]);
    expect(NOTIFICATION_MAIL_KINDS).toEqual(["assignment", "customer_reply"]);
    for (const kind of NOTIFICATION_KINDS) expect(isNotificationKind(kind)).toBe(true);
    expect(isNotificationKind("digest")).toBe(false);
  });
});

describe("mentions", () => {
  it("spells a name as typed and without spaces", () => {
    expect(mentionPatterns("  Ada   Lovelace ")).toEqual(["ada lovelace", "adalovelace"]);
    expect(mentionPatterns("Cher")).toEqual(["cher"]);
    expect(mentionPatterns("   ")).toEqual([]);
  });

  it("finds full names case-insensitively, with or without the space, and only at word boundaries", () => {
    expect(extractMentions("ping @Ada Lovelace please", agents)).toEqual([ADA]);
    expect(extractMentions("ping @adalovelace please", agents)).toEqual([ADA]);
    expect(extractMentions("(@ADA LOVELACE)", agents)).toEqual([ADA]);
    expect(extractMentions("mail ada@example.com or ben@example.com about @Ben Stones", agents)).toEqual([]);
    expect(extractMentions("nothing here", agents)).toEqual([]);
    expect(extractMentions("@Ada Lovelace", [])).toEqual([]);
  });

  it("accepts a first name only when it is unambiguous and orders hits by appearance", () => {
    expect(extractMentions("@Ada can you look?", agents)).toEqual([ADA]);
    // two Bens: the bare first name is ambiguous, the full name is not
    expect(extractMentions("@Ben can you look?", agents)).toEqual([]);
    expect(extractMentions("@Ben Ali and @Ada", agents)).toEqual([CARA, ADA]);
    expect(extractMentions("@Adam is not @Ada", agents)).toEqual([ADA]);
  });
});

describe("recipients of a timeline event", () => {
  it("notifies the new assignee, never the assigning agent themselves or a non-operator", () => {
    expect(recipientsForEvent(event({ payload: { from: null, to: ADA } }), operators)).toEqual([{ userId: ADA, kind: "assignment", payload: { from: null } }]);
    expect(recipientsForEvent(event({ payload: { from: ADA, to: BEN }, actorUserId: BEN }), operators)).toEqual([]);
    expect(recipientsForEvent(event({ payload: { from: ADA, to: CUSTOMER } }), operators)).toEqual([]);
    expect(recipientsForEvent(event({ payload: { from: ADA, to: null } }), operators)).toEqual([]);
    expect(recipientsForEvent(event({ payload: { from: BEN, to: ADA } }), operators)[0]?.payload).toEqual({ from: BEN });
  });

  it("routes a customer reply to the ticket's assignee only", () => {
    const reply = event({ kind: "reply", actorKind: "customer", actorUserId: CUSTOMER, payload: { direction: "inbound", via: "plus_address" }, ticketAssigneeUserId: ADA });
    expect(recipientsForEvent(reply, operators)).toEqual([{ userId: ADA, kind: "customer_reply", payload: { via: "plus_address" } }]);
    expect(recipientsForEvent({ ...reply, ticketAssigneeUserId: null }, operators)).toEqual([]);
    expect(recipientsForEvent({ ...reply, actorKind: "agent", actorUserId: BEN }, operators)).toEqual([]);
    expect(recipientsForEvent({ ...reply, actorKind: "system", actorUserId: null, payload: { direction: "outbound", auto: true } }, operators)).toEqual([]);
  });

  it("routes SLA events to the assignee the engine recorded, the fallback assignee and the named recipients", () => {
    const warning = event({ kind: "sla_warning", actorKind: "system", actorUserId: null, payload: { clock: "first_response", due_at: "2026-09-08T10:00:00.000Z", assignee_user_id: ADA }, ticketAssigneeUserId: BEN });
    expect(recipientsForEvent(warning, operators)).toEqual([{ userId: ADA, kind: "sla_warning", payload: { clock: "first_response", dueAt: "2026-09-08T10:00:00.000Z" } }]);
    const breach = event({ kind: "sla_breach", actorKind: "system", actorUserId: null, payload: { clock: "resolution", recipient_user_ids: [ADA, BEN, CUSTOMER, "junk"] }, ticketAssigneeUserId: BEN });
    expect(recipientsForEvent(breach, operators).map((d) => d.userId)).toEqual([BEN, ADA]);
    expect(recipientsForEvent(breach, operators).every((d) => d.kind === "sla_breach" && d.payload.clock === "resolution")).toBe(true);
    expect(recipientsForEvent(event({ kind: "status", payload: { from: "new", to: "open" } }), operators)).toEqual([]);
    expect(recipientsForEvent(event({ kind: "note", payload: {} }), operators)).toEqual([]);
  });
});

describe("links", () => {
  it("builds the console link from HOST_MARKETING and falls back to the production host", () => {
    expect(ticketPath(TICKET)).toBe(`/ops/support/${TICKET}`);
    expect(opsOrigin()).toBe("https://www.track.site");
    envState.HOST_MARKETING = "http://localhost:3000/";
    expect(ticketUrl(TICKET)).toBe(`http://localhost:3000/ops/support/${TICKET}`);
  });
});

const pending = (over: Partial<PendingMail> = {}): PendingMail => ({
  id: "n-1",
  kind: "assignment",
  ticketId: TICKET,
  number: 1042,
  subject: "Pixel fires twice",
  recipient: { id: ADA, email: "ada@example.test", name: "Ada Lovelace", locale: "en" },
  actorName: "Ben Stone",
  requesterName: "Grace Hopper",
  requesterEmail: "grace@example.com",
  ...over,
});

describe("agent mails", () => {
  it("names the assigning agent, the ticket and the link — never a body — and marks itself automatic", () => {
    const mail = buildNotificationMail(pending());
    expect(mail.to).toBe('"Ada Lovelace" <ada@example.test>');
    expect(mail.subject).toBe("[Track #1042] assigned to you: Pixel fires twice");
    expect(mail.text).toContain("Ben Stone assigned support ticket #1042 to you.");
    expect(mail.text).toContain(`https://www.track.site/ops/support/${TICKET}`);
    expect(mail.headers).toEqual({ "X-Track-Ticket": "1042", "Auto-Submitted": "auto-generated" });
    expect(mail.text).not.toMatch(/\{(actor|number|subject|url)\}/);
  });

  it("uses the localized system name for an automatic assignment and the requester for a customer reply", () => {
    const auto = buildNotificationMail(pending({ actorName: null, recipient: { id: ADA, email: "ada@example.test", name: "Ada", locale: "de" } }));
    expect(auto.text).toContain(getMailCopy("de").supportAssigned.system);
    const reply = buildNotificationMail(pending({ kind: "customer_reply", subject: "Line\r\nbreak" }));
    expect(reply.subject).toBe("[Track #1042] new customer reply: Line break");
    expect(reply.text).toContain("Grace Hopper replied on support ticket #1042");
    const anonymous = buildNotificationMail(pending({ kind: "customer_reply", requesterName: null }));
    expect(anonymous.text).toContain("grace@example.com replied");
    const blank = buildNotificationMail(pending({ subject: "   " }));
    expect(blank.subject).toContain("(no subject)");
  });

  it("renders in every active locale with the placeholders filled", () => {
    for (const locale of ACTIVE_LOCALES) {
      for (const kind of ["assignment", "customer_reply"] as const) {
        const mail = buildNotificationMail(pending({ kind, recipient: { id: ADA, email: "ada@example.test", name: "Ada", locale } }));
        expect(mail.subject, `${locale}.${kind}`).toContain("#1042");
        expect(mail.text, `${locale}.${kind}`).toContain("Track");
        expect(`${mail.subject}\n${mail.text}`, `${locale}.${kind}`).not.toMatch(/\{(actor|requester|number|subject|url)\}/);
      }
    }
  });

  it("sends each claimed mail, counts the outcome and records a transport failure through the runner", async () => {
    sendMail.mockResolvedValueOnce({ ok: true, transport: "file" }).mockResolvedValueOnce({ ok: false, transport: "smtp", error: "smtp down" }).mockRejectedValueOnce(new Error("boom"));
    const runs: unknown[] = [];
    const run = (async (fn: (tx: unknown) => Promise<unknown>) => {
      runs.push(fn);
      return fn({ update: () => ({ set: (v: unknown) => ({ where: async () => v }) }) });
    }) as never;
    const result = await deliverNotificationMails([pending({ id: "a" }), pending({ id: "b" }), pending({ id: "c" })], run);
    expect(result).toEqual({ sent: 1, failed: 2 });
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(runs).toHaveLength(2);
  });
});

describe("cursor", () => {
  it("resumes a full batch one millisecond before its last row instead of a whole overlap window behind it", () => {
    const last = new Date("2026-09-08T10:00:00.500Z");
    expect(continueFrom(last).getTime() - SYNC_OVERLAP_MS).toBe(last.getTime() - 1);
  });
});
