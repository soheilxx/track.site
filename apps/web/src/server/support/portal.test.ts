import { beforeEach, describe, expect, it, vi } from "vitest";

// the loaders' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/session", () => ({ withOrg: vi.fn() }));
const envState: { HOST_MARKETING?: string; SUPPORT_INBOUND_DOMAIN?: string; SUPPORT_FROM_ADDRESS?: string } = { HOST_MARKETING: "https://www.track.site/" };
vi.mock("@/env", () => ({ env: () => envState }));
const searchKnowledge = vi.fn();
vi.mock("@/lib/knowledge", () => ({ searchKnowledge: (...args: unknown[]) => searchKnowledge(...args) }));
const sendMail = vi.fn();
vi.mock("@/server/mail", () => ({ sendMail: (mail: unknown) => sendMail(mail) }));

import { ACTIVE_LOCALES } from "@/i18n/routing";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_MESSAGE } from "@/components/app/support/constants";
import {
  acknowledgementText,
  attachmentDisposition,
  customerCanMarkSolved,
  customerCanRate,
  customerCanReply,
  customerEventPayload,
  formTicketSubject,
  isUuid,
  knowledgeHref,
  knowledgeQueryFrom,
  parsePortalView,
  screenUploads,
  sendTicketAcknowledgement,
  statusAfterCustomerReply,
  suggestKnowledge,
  threadingFor,
  type PortalSettings,
} from "./portal";
import { supportMailSettings } from "./mail";

beforeEach(() => {
  searchKnowledge.mockReset();
  sendMail.mockReset();
  envState.HOST_MARKETING = "https://www.track.site/";
});

describe("list views and ids", () => {
  it("reads the view from the URL and defaults to open", () => {
    expect(parsePortalView({})).toBe("open");
    expect(parsePortalView({ view: "solved" })).toBe("solved");
    expect(parsePortalView({ view: ["all", "open"] })).toBe("all");
    expect(parsePortalView({ view: "spam" })).toBe("open");
  });

  it("accepts only strict 8-4-4-4-12 uuids", () => {
    expect(isUuid("a0000000-0000-4000-8000-000000000501")).toBe(true);
    expect(isUuid("A0000000-0000-4000-8000-000000000501")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("a0000000-0000-4000-8000-00000000050")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("customer rules", () => {
  const ticket = (status: string, extra: Partial<{ mergedIntoId: string | null; satisfaction: { score: 1 | 2 | 3 | 4 | 5; answered_at: string } | null }> = {}) =>
    ({ status: status as never, mergedIntoId: null, satisfaction: null, ...extra });

  it("allows replies on every visible, unmerged ticket", () => {
    for (const status of ["new", "open", "pending", "on_hold", "solved", "closed"]) expect(customerCanReply(ticket(status)), status).toBe(true);
    expect(customerCanReply(ticket("spam"))).toBe(false);
    expect(customerCanReply(ticket("open", { mergedIntoId: "other" }))).toBe(false);
  });

  it("offers mark-as-solved while the ticket is open from the customer's point of view", () => {
    for (const status of ["new", "open", "pending", "on_hold"]) expect(customerCanMarkSolved(ticket(status)), status).toBe(true);
    for (const status of ["solved", "closed", "spam"]) expect(customerCanMarkSolved(ticket(status)), status).toBe(false);
    expect(customerCanMarkSolved(ticket("open", { mergedIntoId: "other" }))).toBe(false);
  });

  it("asks for satisfaction once, after solving, only while surveys are on", () => {
    expect(customerCanRate(ticket("solved"), true)).toBe(true);
    expect(customerCanRate(ticket("closed"), true)).toBe(true);
    expect(customerCanRate(ticket("open"), true)).toBe(false);
    expect(customerCanRate(ticket("solved"), false)).toBe(false);
    expect(customerCanRate(ticket("solved", { satisfaction: { score: 4, answered_at: "2026-09-08T10:00:00.000Z" } }), true)).toBe(false);
    expect(customerCanRate(ticket("solved", { mergedIntoId: "other" }), true)).toBe(false);
  });

  it("derives the status after a customer message", () => {
    expect(statusAfterCustomerReply("new")).toEqual({ status: "new", reopened: false });
    expect(statusAfterCustomerReply("open")).toEqual({ status: "open", reopened: false });
    expect(statusAfterCustomerReply("pending")).toEqual({ status: "open", reopened: false });
    expect(statusAfterCustomerReply("on_hold")).toEqual({ status: "on_hold", reopened: false });
    expect(statusAfterCustomerReply("solved")).toEqual({ status: "open", reopened: true });
    expect(statusAfterCustomerReply("closed")).toEqual({ status: "open", reopened: true });
  });

  it("keeps only scalar, whitelisted event payload fields", () => {
    expect(customerEventPayload({ from: "open", to: "solved", note: "secret", assignee_user_id: "u1", tags_add: ["x"] })).toEqual({ from: "open", to: "solved" });
    expect(customerEventPayload({ score: 4, comment: "hidden" })).toEqual({ score: 4 });
    expect(customerEventPayload({ channel: "form", into_number: 1042 })).toEqual({ channel: "form", intoNumber: 1042 });
    expect(customerEventPayload({ score: "5", from: 1 })).toEqual({});
    expect(customerEventPayload(null)).toEqual({});
    expect(customerEventPayload("x")).toEqual({});
  });
});

describe("contact-form subjects", () => {
  it("prefers the topic, then the first line cut at a word boundary", () => {
    expect(formTicketSubject("support", "Shopify integration", "Pixel fires twice")).toBe("Shopify integration");
    expect(formTicketSubject("support", "  ", "\n\nPixel fires twice\nMore details")).toBe("Pixel fires twice");
    const long = "The purchase event of our shop is delivered twice to Meta whenever a customer refreshes the thank-you page after checkout";
    const subject = formTicketSubject("contact", null, long);
    expect(subject.length).toBeLessThanOrEqual(81);
    expect(subject.endsWith("…")).toBe(true);
    expect(subject).toBe("The purchase event of our shop is delivered twice to Meta whenever a customer…");
    expect(formTicketSubject("demo", undefined, "   ")).toBe("Demo request");
    expect(formTicketSubject("contact", undefined, "")).toBe("Contact request");
    expect(formTicketSubject("support", undefined, "")).toBe("Support request");
  });

  it("caps a very long topic at the subject limit", () => {
    expect(formTicketSubject("contact", "x".repeat(300), "m").length).toBe(200);
  });
});

describe("uploads", () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

  it("drops empty selections, sanitises names and applies the limits", () => {
    // the empty file input of a portal form: a nameless zero-byte part, or a zero-byte `File` named "blob" once the server action runtime decoded it
    const screening = screenUploads([file("", "application/octet-stream", 0), file("blob", "application/octet-stream", 0), "text", file("../evil name.png", "image/png"), file("run.exe", "application/x-msdownload"), file("big.pdf", "application/pdf", ATTACHMENT_MAX_BYTES + 1)]);
    expect(screening.accepted.map((a) => a.fileName)).toEqual(["evil name.png"]);
    expect(screening.accepted[0]?.contentType).toBe("image/png");
    expect(screening.rejected).toEqual([
      { fileName: "run.exe", reason: "type_not_allowed" },
      { fileName: "big.pdf", reason: "too_large" },
    ]);
  });

  it("refuses the sixth file", () => {
    const files = Array.from({ length: ATTACHMENT_MAX_PER_MESSAGE + 1 }, (_, i) => file(`f${i}.txt`, "text/plain"));
    const screening = screenUploads(files);
    expect(screening.accepted).toHaveLength(ATTACHMENT_MAX_PER_MESSAGE);
    expect(screening.rejected).toEqual([{ fileName: `f${ATTACHMENT_MAX_PER_MESSAGE}.txt`, reason: "too_many" }]);
  });

  it("strips a charset parameter from the content type", () => {
    expect(screenUploads([file("a.csv", "text/csv; charset=utf-8")]).accepted[0]?.contentType).toBe("text/csv");
  });

  it("builds a header-safe content disposition", () => {
    expect(attachmentDisposition("report.pdf")).toBe("attachment; filename=\"report.pdf\"; filename*=UTF-8''report.pdf");
    expect(attachmentDisposition('Ümläut "quoted"\\.png')).toBe("attachment; filename=\"_ml_ut _quoted__.png\"; filename*=UTF-8''%C3%9Cml%C3%A4ut%20%22quoted%22%5C.png");
    expect(attachmentDisposition("")).toBe("attachment; filename=\"attachment\"; filename*=UTF-8''%01");
  });
});

describe("knowledge suggestions", () => {
  it("turns free text into a bounded, deduplicated query", () => {
    expect(knowledgeQueryFrom("Pixel fires twice! twice on the thank-you page")).toBe("pixel fires twice the thank-you page");
    expect(knowledgeQueryFrom("a an of")).toBe("");
    expect(knowledgeQueryFrom("one two three four five six seven eight nine ten")).toBe("one two three four five six seven eight");
    expect(knowledgeQueryFrom("--server-side-- tracking")).toBe("server-side tracking");
  });

  it("links to the public article on the marketing host in the reader's language", () => {
    expect(knowledgeHref("de", "server-side-tracking")).toBe("https://www.track.site/de/tracking-knowledge/server-side-tracking");
    envState.HOST_MARKETING = "http://localhost:3000";
    expect(knowledgeHref("en", "x")).toBe("http://localhost:3000/en/tracking-knowledge/x");
    delete envState.HOST_MARKETING;
    expect(knowledgeHref("fr", "y")).toBe("https://www.track.site/fr/tracking-knowledge/y");
  });

  it("searches the published articles of the locale and maps the hits", async () => {
    searchKnowledge.mockResolvedValue({ hits: [{ translationGroupId: "g1", title: "T1", description: "D1", slug: "s1", readingMinutes: 4 }, { translationGroupId: "g2", title: "T2", description: "D2", slug: "s2", readingMinutes: 6 }], total: 2, corpus: 10, facets: {} });
    const out = await suggestKnowledge("de", "Pixel fires twice", 1);
    expect(searchKnowledge).toHaveBeenCalledWith("de", { q: "pixel fires twice" });
    expect(out).toEqual([{ id: "g1", title: "T1", description: "D1", href: "https://www.track.site/de/tracking-knowledge/s1", readingMinutes: 4 }]);
    expect(await suggestKnowledge("en", "an")).toEqual([]);
    expect(searchKnowledge).toHaveBeenCalledTimes(1);
    await suggestKnowledge("xx", "pixel twice");
    expect(searchKnowledge).toHaveBeenLastCalledWith("en", { q: "pixel twice" });
  });
});

describe("mail", () => {
  it("has an acknowledgement text in every active locale with the ticket number and subject", () => {
    for (const locale of ACTIVE_LOCALES) {
      const text = acknowledgementText(locale, { number: 1042, subject: "Pixel fires twice" });
      expect(text, locale).toContain("1042");
      expect(text, locale).toContain("Pixel fires twice");
    }
    expect(acknowledgementText("xx", { number: 1, subject: "s" })).toBe(acknowledgementText("en", { number: 1, subject: "s" }));
  });

  it("threads an agent reply on the customer's last message and references the whole thread", () => {
    const t = threadingFor([
      { direction: "outbound", messageId: "a@x", createdAt: new Date("2026-09-08T10:00:00Z") },
      { direction: "inbound", messageId: "b@x", createdAt: new Date("2026-09-08T11:00:00Z") },
      { direction: "inbound", messageId: null, createdAt: new Date("2026-09-08T12:00:00Z") },
      { direction: "note", messageId: null, createdAt: new Date("2026-09-08T12:30:00Z") },
      { direction: "inbound", messageId: "c@x", createdAt: new Date("2026-09-08T09:00:00Z") },
    ]);
    expect(t).toEqual({ inReplyTo: "b@x", references: ["c@x", "a@x", "b@x"] });
    expect(threadingFor([])).toEqual({ inReplyTo: null, references: [] });
  });

  it("sends the acknowledgement only while the desk has it switched on", async () => {
    const ticket = { id: "t-1", number: 1042, subject: "Pixel fires twice", requesterEmail: "ada@example.com", requesterName: "Ada", locale: "de" };
    const settings: PortalSettings = { csatEnabled: true, autoReplyEnabled: false, mail: supportMailSettings(null) };
    expect(await sendTicketAcknowledgement(ticket, settings)).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
    sendMail.mockResolvedValue({ ok: true, transport: "file", id: "f" });
    const result = await sendTicketAcknowledgement(ticket, { ...settings, autoReplyEnabled: true });
    expect(result?.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]![0] as { to: string; subject: string; text: string; headers: Record<string, string>; replyTo: string };
    expect(mail.to).toBe('"Ada" <ada@example.com>');
    expect(mail.subject).toBe("Re: [Track #1042] Pixel fires twice");
    expect(mail.headers["Auto-Submitted"]).toBe("auto-replied");
    expect(mail.replyTo).toBe("support+t1042@support.track.site");
    expect(mail.text).toContain("Ticket #1042");
    expect(mail.text).not.toContain("Kind regards");
  });
});
