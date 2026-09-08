import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envState: { SUPPORT_INBOUND_DOMAIN?: string; SUPPORT_FROM_ADDRESS?: string } = {};
vi.mock("@/env", () => ({ env: () => envState }));
const sendMail = vi.fn();
vi.mock("@/server/mail", () => ({ sendMail: (mail: unknown) => sendMail(mail) }));

import { ACTIVE_LOCALES } from "@/i18n/routing";
import { buildTicketMail, formatAddress, sendTicketMail, supportMailSettings, textToHtml, ticketMailCopy, ticketMessageId, ticketReplyTo, ticketSubject, ticketSubjectTag } from "./mail";

const ticket = { id: "t-1", number: 1042, subject: "Pixel fires twice", requesterEmail: "ada@example.com", requesterName: "Ada Lovelace", locale: "en" };
const message = { id: "m-1", textBody: "Hello Ada,\n\nwe fixed it.\n\nCould you check?" };

beforeEach(() => {
  delete envState.SUPPORT_INBOUND_DOMAIN;
  delete envState.SUPPORT_FROM_ADDRESS;
  sendMail.mockReset();
});

describe("settings and addressing", () => {
  it("prefers environment overrides over the stored row and falls back to defaults", () => {
    expect(supportMailSettings(null)).toEqual({ inboundDomain: "support.track.site", fromName: "Track Support", fromAddress: "support@track.site", signatureText: "" });
    expect(supportMailSettings({ inboundDomain: "help.example", fromName: "Help", fromAddress: "help@example", signatureText: " Team " })).toEqual({ inboundDomain: "help.example", fromName: "Help", fromAddress: "help@example", signatureText: "Team" });
    envState.SUPPORT_INBOUND_DOMAIN = "in.example";
    envState.SUPPORT_FROM_ADDRESS = "desk@example";
    expect(supportMailSettings({ inboundDomain: "help.example", fromAddress: "help@example" })).toMatchObject({ inboundDomain: "in.example", fromAddress: "desk@example" });
    envState.SUPPORT_INBOUND_DOMAIN = "   ";
    expect(supportMailSettings({ inboundDomain: "help.example" }).inboundDomain).toBe("help.example");
  });

  it("builds reply-to, message ids and subjects without doubling", () => {
    const settings = { inboundDomain: "support.track.site" };
    expect(ticketReplyTo(1042, settings)).toBe("support+t1042@support.track.site");
    expect(ticketMessageId(1042, settings, "01ABC")).toBe("t1042.01abc@support.track.site");
    expect(ticketMessageId(1, settings)).toMatch(/^t1\.[0-9a-z]{26}@support\.track\.site$/);
    expect(ticketSubjectTag(7)).toBe("[Track #7]");
    expect(ticketSubject(1042, "Pixel fires twice")).toBe("Re: [Track #1042] Pixel fires twice");
    expect(ticketSubject(1042, "Re: [Track #1042] Pixel fires twice")).toBe("Re: [Track #1042] Pixel fires twice");
    expect(ticketSubject(1042, "AW: Re: [track #1042]   Pixel   fires")).toBe("Re: [Track #1042] Pixel fires");
    expect(ticketSubject(1042, "", { reply: false })).toBe("[Track #1042] (no subject)");
  });

  it("formats addresses so a name cannot break the header", () => {
    expect(formatAddress("Ada Lovelace", "ada@example.com")).toBe('"Ada Lovelace" <ada@example.com>');
    expect(formatAddress('Ada "<x>"\r\nBcc: evil@x', "ada@example.com")).toBe('"Ada xBcc: evil@x" <ada@example.com>');
    expect(formatAddress(null, "ada@example.com")).toBe("ada@example.com");
  });

  it("renders text as paragraphs without interpreting markup", () => {
    expect(textToHtml("a <b>\nc\n\nd & e")).toBe("<p>a &lt;b&gt;<br>c</p>\n<p>d &amp; e</p>");
  });

  it("has footer copy for every active locale with the number placeholder", () => {
    for (const locale of ACTIVE_LOCALES) {
      const copy = ticketMailCopy(locale);
      expect(copy.footer, locale).toContain("{number}");
      expect(copy.reference, locale).toContain("{number}");
      expect(copy.transactional.length, locale).toBeGreaterThan(10);
    }
    expect(ticketMailCopy("xx")).toBe(ticketMailCopy("en"));
    expect(ticketMailCopy(null)).toBe(ticketMailCopy("en"));
  });
});

describe("buildTicketMail", () => {
  it("builds a complete agent reply with threading headers, footer and signature", () => {
    const { mail, messageId } = buildTicketMail({
      ticket,
      message: { ...message, inReplyTo: "CA+abc@mail.example.com", references: ["older@x"], agentName: "Sam", ccEmails: ["ops@example.com"] },
      settings: { signatureText: "Track Support Team" },
    });
    expect(messageId).toMatch(/^t1042\.[0-9a-z]{26}@support\.track\.site$/);
    expect(mail.messageId).toBe(`<${messageId}>`);
    expect(mail.to).toBe('"Ada Lovelace" <ada@example.com>');
    expect(mail.cc).toEqual(["ops@example.com"]);
    expect(mail.from).toBe('"Track Support" <support@track.site>');
    expect(mail.replyTo).toBe("support+t1042@support.track.site");
    expect(mail.subject).toBe("Re: [Track #1042] Pixel fires twice");
    expect(mail.inReplyTo).toBe("<CA+abc@mail.example.com>");
    expect(mail.references).toEqual(["<older@x>", "<CA+abc@mail.example.com>"]);
    expect(mail.headers).toEqual({ "X-Track-Ticket": "1042" });
    expect(mail.text).toBe("Hello Ada,\n\nwe fixed it.\n\nCould you check?\n\nKind regards\nSam\nTrack Support Team\n\n—\nThis e-mail belongs to ticket #1042. Reply to this e-mail to add to the conversation — keep the subject as it is.\nYou receive this message because you contacted Track Support.");
    expect(mail.html).toContain("<p>Hello Ada,</p>");
    expect(mail.html).toContain("<p>Kind regards<br>Sam<br>Track Support Team</p>");
    expect(mail.html).toContain("ticket #1042");
    expect(mail.html).not.toContain("unsubscribe");
    expect(mail.text.toLowerCase()).not.toContain("unsubscribe");
    expect(mail.attachments).toBeUndefined();
  });

  it("keeps a provided message id, uses sanitised html and the ticket locale", () => {
    const { mail, messageId } = buildTicketMail({
      ticket: { ...ticket, locale: "de", requesterName: null },
      message: { ...message, messageId: "t1042.fixed@support.track.site", htmlBody: "<p>Hallo <b>Ada</b></p>" },
    });
    expect(messageId).toBe("t1042.fixed@support.track.site");
    expect(mail.to).toBe("ada@example.com");
    expect(mail.html).toContain("<p>Hallo <b>Ada</b></p>");
    expect(mail.text).toContain("Diese E-Mail gehört zu Ticket #1042");
    expect(mail.inReplyTo).toBeUndefined();
    expect(mail.references).toBeUndefined();
  });

  it("marks automatic messages so other desks do not answer them and skips the signature", () => {
    const { mail } = buildTicketMail({ ticket, message: { ...message, kind: "auto", agentName: "Sam" }, settings: { signatureText: "Team" }, locale: "fr" });
    expect(mail.headers).toEqual({ "X-Track-Ticket": "1042", "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" });
    expect(mail.text).not.toContain("Sam");
    expect(mail.text).toContain("ticket n° 1042");
  });

  it("passes attachments through and honours environment sender overrides", () => {
    envState.SUPPORT_FROM_ADDRESS = "desk@example.test";
    envState.SUPPORT_INBOUND_DOMAIN = "in.example.test";
    const attachments = [{ filename: "report.pdf", content: Buffer.from("%PDF"), contentType: "application/pdf" }];
    const { mail, messageId } = buildTicketMail({ ticket, message: { ...message, attachments }, settings: { fromName: "Help Desk" } });
    expect(mail.from).toBe('"Help Desk" <desk@example.test>');
    expect(mail.replyTo).toBe("support+t1042@in.example.test");
    expect(messageId.endsWith("@in.example.test")).toBe(true);
    expect(mail.attachments).toBe(attachments);
  });
});

describe("sendTicketMail", () => {
  it("returns the transport result together with the message id", async () => {
    sendMail.mockResolvedValueOnce({ ok: true, transport: "file", id: "/tmp/x.json" });
    const result = await sendTicketMail({ ticket, message });
    expect(result).toMatchObject({ ok: true, transport: "file", id: "/tmp/x.json" });
    expect(result.messageId).toMatch(/^t1042\./);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ replyTo: "support+t1042@support.track.site" });
  });

  it("never throws on a transport failure", async () => {
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    const result = await sendTicketMail({ ticket, message });
    expect(result).toMatchObject({ ok: false, transport: "none", error: "smtp down" });
    expect(result.messageId).toBeTruthy();
  });
});
