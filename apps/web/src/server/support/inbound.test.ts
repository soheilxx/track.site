import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_MESSAGE,
  decodeEntities,
  detectAutoReply,
  htmlToText,
  isOwnAddress,
  noopAttachmentScanner,
  normalizeHeaders,
  normalizeMessageId,
  parseAddress,
  parseAddressList,
  parseMessageIdList,
  parseResendReceivedEvent,
  routeInbound,
  sanitizeFileName,
  sanitizeHtml,
  screenAttachments,
  signSvix,
  svixHeadersFrom,
  ticketNumberFromRecipients,
  ticketNumberFromSubject,
  verifySvixSignature,
  type RoutingLookups,
} from "./inbound";

const SECRET = `whsec_${Buffer.from("a-very-secret-key-for-tests-0123").toString("base64")}`;
const NOW = new Date("2026-09-08T10:00:00Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

describe("verifySvixSignature", () => {
  const payload = JSON.stringify({ type: "email.received", data: { email_id: "e_1", from: "a@b.co" } });

  it("accepts a correctly signed payload inside the tolerance window", () => {
    const signature = signSvix(payload, "msg_1", nowSeconds - 120, SECRET);
    const result = verifySvixSignature(payload, { id: "msg_1", timestamp: String(nowSeconds - 120), signature }, SECRET, { now: NOW });
    expect(result).toEqual({ ok: true, id: "msg_1", timestamp: new Date((nowSeconds - 120) * 1000) });
  });

  it("accepts a secret without the whsec_ prefix and a list of signatures with one valid entry", () => {
    const bare = SECRET.replace(/^whsec_/, "");
    const good = signSvix(payload, "msg_2", nowSeconds, bare);
    const result = verifySvixSignature(payload, { id: "msg_2", timestamp: String(nowSeconds), signature: `v1,AAAA v1a,zzzz ${good}` }, SECRET, { now: NOW });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a foreign id", () => {
    const signature = signSvix(payload, "msg_3", nowSeconds, SECRET);
    const headers = { id: "msg_3", timestamp: String(nowSeconds), signature };
    expect(verifySvixSignature(`${payload} `, headers, SECRET, { now: NOW })).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifySvixSignature(payload, headers, `whsec_${Buffer.from("other-secret").toString("base64")}`, { now: NOW })).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifySvixSignature(payload, { ...headers, id: "msg_4" }, SECRET, { now: NOW })).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects timestamps outside five minutes in either direction, and malformed ones", () => {
    const old = nowSeconds - 301;
    expect(verifySvixSignature(payload, { id: "m", timestamp: String(old), signature: signSvix(payload, "m", old, SECRET) }, SECRET, { now: NOW })).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    const future = nowSeconds + 301;
    expect(verifySvixSignature(payload, { id: "m", timestamp: String(future), signature: signSvix(payload, "m", future, SECRET) }, SECRET, { now: NOW })).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    const edge = nowSeconds - 300;
    expect(verifySvixSignature(payload, { id: "m", timestamp: String(edge), signature: signSvix(payload, "m", edge, SECRET) }, SECRET, { now: NOW }).ok).toBe(true);
    expect(verifySvixSignature(payload, { id: "m", timestamp: "yesterday", signature: "v1,x" }, SECRET, { now: NOW })).toEqual({ ok: false, reason: "timestamp_invalid" });
  });

  it("rejects missing headers and a missing or empty secret before doing any work", () => {
    expect(verifySvixSignature(payload, { id: null, timestamp: String(nowSeconds), signature: "v1,x" }, SECRET)).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifySvixSignature(payload, { id: "m", timestamp: String(nowSeconds), signature: "v1,x" }, undefined, { now: NOW })).toEqual({ ok: false, reason: "invalid_secret" });
    expect(verifySvixSignature(payload, { id: "m", timestamp: String(nowSeconds), signature: "v1,x" }, "whsec_", { now: NOW })).toEqual({ ok: false, reason: "invalid_secret" });
  });

  it("reads svix-* headers from a Headers object or a plain record, with webhook-* aliases", () => {
    const h = new Headers({ "svix-id": "id", "svix-timestamp": "1", "svix-signature": "v1,a" });
    expect(svixHeadersFrom(h)).toEqual({ id: "id", timestamp: "1", signature: "v1,a" });
    expect(svixHeadersFrom({ "Webhook-Id": "w", "webhook-timestamp": ["2"], "WEBHOOK-SIGNATURE": "v1,b" })).toEqual({ id: "w", timestamp: "2", signature: "v1,b" });
    expect(svixHeadersFrom({})).toEqual({ id: null, timestamp: null, signature: null });
  });
});

describe("addresses and ids", () => {
  it("parses display names and lower-cases addresses", () => {
    expect(parseAddress('"Ada Lovelace" <Ada@Example.com>')).toEqual({ email: "ada@example.com", name: "Ada Lovelace" });
    expect(parseAddress("Ada <ada@example.com>")).toEqual({ email: "ada@example.com", name: "Ada" });
    expect(parseAddress("ADA@example.com")).toEqual({ email: "ada@example.com", name: null });
    expect(parseAddress("not an address")).toBeNull();
    expect(parseAddress("<javascript:alert(1)>")).toBeNull();
  });

  it("splits lists on commas outside quotes and deduplicates", () => {
    const list = parseAddressList('"Smith, Jane" <jane@example.com>, bob@example.com, BOB@example.com, broken');
    expect(list).toEqual([
      { email: "jane@example.com", name: "Smith, Jane" },
      { email: "bob@example.com", name: null },
    ]);
    expect(parseAddressList(["a@x.io", "b@x.io"])).toHaveLength(2);
    expect(parseAddressList(null)).toEqual([]);
  });

  it("normalises message ids and reference lists", () => {
    expect(normalizeMessageId(" <abc@host> ")).toBe("abc@host");
    expect(normalizeMessageId("<>")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
    expect(parseMessageIdList("<a@x> <b@y>\n\t<a@x>")).toEqual(["a@x", "b@y"]);
    expect(parseMessageIdList("a@x, b@y")).toEqual(["a@x", "b@y"]);
    expect(parseMessageIdList(undefined)).toEqual([]);
  });

  it("lower-cases header names and joins repeated headers", () => {
    expect(normalizeHeaders([{ name: "Received", value: "a" }, { name: "received", value: "b" }, { name: "X-Foo", value: "1" }])).toEqual({ received: "a, b", "x-foo": "1" });
    expect(normalizeHeaders({ "Message-ID": "<m@x>", List: ["a", "b"] })).toEqual({ "message-id": "<m@x>", list: "a, b" });
  });
});

describe("parseResendReceivedEvent", () => {
  const event = {
    type: "email.received",
    created_at: "2026-09-08T09:59:00.000Z",
    data: {
      email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      from: "Ada <ada@example.com>",
      to: ["support+t1042@support.track.site"],
      cc: ["Ops <ops@example.com>"],
      subject: "Re: [Track #1042] Pixel fires twice",
      message_id: "<CA+abc@mail.example.com>",
      headers: [
        { name: "In-Reply-To", value: "<t1042.01abc@support.track.site>" },
        { name: "References", value: "<t1042.01abc@support.track.site> <older@x>" },
        { name: "Auto-Submitted", value: "no" },
      ],
      attachments: [
        { id: "att_1", filename: "../../screen shot.png", content_type: "image/png; name=x", size: 1234, content_disposition: "attachment", download_url: "https://example.test/att_1" },
      ],
    },
  };

  it("normalises the payload into an InboundEmail", () => {
    const result = parseResendReceivedEvent(event, "msg_abc");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email.providerEventId).toBe("msg_abc");
    expect(result.email.providerMessageId).toBe(event.data.email_id);
    expect(result.email.from).toEqual({ email: "ada@example.com", name: "Ada" });
    expect(result.email.to.map((a) => a.email)).toEqual(["support+t1042@support.track.site"]);
    expect(result.email.cc[0]).toEqual({ email: "ops@example.com", name: "Ops" });
    expect(result.email.messageId).toBe("CA+abc@mail.example.com");
    expect(result.email.inReplyTo).toBe("t1042.01abc@support.track.site");
    expect(result.email.references).toEqual(["t1042.01abc@support.track.site", "older@x"]);
    expect(result.email.headers["auto-submitted"]).toBe("no");
    expect(result.email.attachments).toEqual([
      { providerId: "att_1", fileName: "screen shot.png", contentType: "image/png", sizeBytes: 1234, contentId: null, inline: false, downloadUrl: "https://example.test/att_1" },
    ]);
    expect(result.email.receivedAt.toISOString()).toBe("2026-09-08T09:59:00.000Z");
    expect(result.email.text).toBeNull();
  });

  it("refuses other event types, invalid payloads and unparsable senders", () => {
    expect(parseResendReceivedEvent({ ...event, type: "email.delivered" }, "x")).toEqual({ ok: false, reason: "unsupported_type", detail: "email.delivered" });
    expect(parseResendReceivedEvent({ type: "email.received", data: { from: "a@b.co" } }, "x")).toMatchObject({ ok: false, reason: "invalid_payload" });
    expect(parseResendReceivedEvent({ type: "email.received", data: { email_id: "e", from: "nobody" } }, "x")).toEqual({ ok: false, reason: "invalid_sender" });
    expect(parseResendReceivedEvent("nope", "x")).toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  it("falls back to the Message-ID header and tolerates missing optional fields", () => {
    const minimal = { type: "email.received", data: { email_id: "e", from: "a@b.co", headers: { "Message-Id": "<hdr@b.co>" } } };
    const result = parseResendReceivedEvent(minimal, "x");
    expect(result.ok && result.email.messageId).toBe("hdr@b.co");
    expect(result.ok && result.email.to).toEqual([]);
    expect(result.ok && result.email.subject).toBe("");
  });
});

describe("routing", () => {
  const DOMAIN = "support.track.site";

  it("finds the ticket number in the plus address on the reply domain only", () => {
    expect(ticketNumberFromRecipients(["support+t1042@support.track.site"], DOMAIN)).toBe(1042);
    expect(ticketNumberFromRecipients([{ email: "help+t7@SUPPORT.track.site", name: null }], DOMAIN)).toBe(7);
    expect(ticketNumberFromRecipients(["support+t1042@other.example"], DOMAIN)).toBeNull();
    expect(ticketNumberFromRecipients(["support@support.track.site"], DOMAIN)).toBeNull();
    expect(ticketNumberFromRecipients(["support+tabc@support.track.site"], DOMAIN)).toBeNull();
    expect(ticketNumberFromRecipients(["support+t1@support.track.site"], "")).toBeNull();
  });

  it("finds the subject tag", () => {
    expect(ticketNumberFromSubject("Re: [Track #1042] Pixel fires twice")).toBe(1042);
    expect(ticketNumberFromSubject("AW: [track #9]")).toBe(9);
    expect(ticketNumberFromSubject("ticket #1042 please")).toBeNull();
    expect(ticketNumberFromSubject(null)).toBeNull();
  });

  const lookups = (known: Record<number, string>, threads: Record<string, string>): RoutingLookups & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      async byTicketNumber(n) {
        calls.push(`number:${n}`);
        return known[n] ? { ticketId: known[n]! } : null;
      },
      async byMessageIds(ids) {
        calls.push(`ids:${ids.join(",")}`);
        const hit = ids.find((id) => threads[id]);
        return hit ? { ticketId: threads[hit]! } : null;
      },
    };
  };
  const base = { to: [], cc: [], inReplyTo: null, references: [], subject: "" };

  it("prefers the plus address, then the thread, then the subject, else a new ticket", async () => {
    const l = lookups({ 1042: "T1" }, { "t1042.x@support.track.site": "T1" });
    expect(await routeInbound({ ...base, to: parseAddressList(["support+t1042@support.track.site"]) }, DOMAIN, l)).toEqual({ kind: "reply", ticketId: "T1", via: "plus_address" });
    expect(await routeInbound({ ...base, inReplyTo: "t1042.x@support.track.site" }, DOMAIN, l)).toEqual({ kind: "reply", ticketId: "T1", via: "thread" });
    expect(await routeInbound({ ...base, references: ["unknown@x", "t1042.x@support.track.site"] }, DOMAIN, l)).toEqual({ kind: "reply", ticketId: "T1", via: "thread" });
    expect(await routeInbound({ ...base, subject: "Re: [Track #1042] hi" }, DOMAIN, l)).toEqual({ kind: "reply", ticketId: "T1", via: "subject" });
    expect(await routeInbound({ ...base, subject: "hello" }, DOMAIN, l)).toEqual({ kind: "new" });
  });

  it("falls through when the addressed ticket does not exist", async () => {
    const l = lookups({}, {});
    expect(await routeInbound({ ...base, cc: parseAddressList(["support+t5@support.track.site"]), subject: "[Track #5] x" }, DOMAIN, l)).toEqual({ kind: "new" });
    expect(l.calls).toEqual(["number:5", "number:5"]);
  });
});

describe("detectAutoReply", () => {
  it("flags RFC 3834 and vendor auto-reply headers", () => {
    expect(detectAutoReply({ "auto-submitted": "auto-replied" }, "Re: hi")).toMatchObject({ auto: true, suppressAutoReply: true });
    expect(detectAutoReply({ "auto-submitted": "no" }, "Re: hi")).toMatchObject({ auto: false, suppressAutoReply: false });
    expect(detectAutoReply({ precedence: "bulk" }, "")).toMatchObject({ auto: true });
    expect(detectAutoReply({ precedence: "junk" }, "")).toMatchObject({ auto: true });
    expect(detectAutoReply({ precedence: "list" }, "")).toMatchObject({ auto: true });
    expect(detectAutoReply({ "x-autoreply": "yes" }, "")).toMatchObject({ auto: true });
    expect(detectAutoReply({ "x-autorespond": "1" }, "")).toMatchObject({ auto: true });
    expect(detectAutoReply({ "list-unsubscribe": "<mailto:x>" }, "")).toMatchObject({ auto: true });
    expect(detectAutoReply({ "content-type": 'multipart/report; report-type=delivery-status; boundary="x"' }, "")).toMatchObject({ auto: true, reason: "delivery status notification" });
  });

  it("recognises out-of-office subjects in the programme languages", () => {
    for (const subject of ["Automatic reply: your ticket", "Automatische Antwort: Ihre Anfrage", "Réponse automatique : ticket", "Respuesta automática", "Risposta automatica", "Automatisch antwoord", "Out of Office", "Abwesenheitsnotiz"]) {
      expect(detectAutoReply({}, subject).auto, subject).toBe(true);
    }
    expect(detectAutoReply({}, "Re: automatic pixel replies?").auto).toBe(false);
  });

  it("keeps a human mail that only asks for suppression", () => {
    expect(detectAutoReply({ "x-auto-response-suppress": "All" }, "Re: hi")).toEqual({ auto: false, suppressAutoReply: true, reason: "x-auto-response-suppress: all" });
    expect(detectAutoReply({}, "Re: hi")).toEqual({ auto: false, suppressAutoReply: false, reason: null });
  });

  it("detects the desk's own addresses", () => {
    const settings = { fromAddress: "support@track.site", inboundDomain: "support.track.site" };
    expect(isOwnAddress("Support@Track.site", settings)).toBe(true);
    expect(isOwnAddress("support+t1@support.track.site", settings)).toBe(true);
    expect(isOwnAddress("ada@example.com", settings)).toBe(false);
    expect(isOwnAddress("x@track.site", settings)).toBe(false);
  });
});

describe("sanitizeHtml", () => {
  it("keeps formatting and drops scripts, styles, handlers and comments", () => {
    const dirty = '<p onclick="x()">Hello <b>world</b><script>alert(1)</script><style>p{}</style><!-- c --> <span style="color:red" class="x">ok</span></p>';
    expect(sanitizeHtml(dirty)).toBe("<p>Hello <b>world</b> <span>ok</span></p>");
  });

  it("drops the content of dangerous containers even when unclosed", () => {
    expect(sanitizeHtml("<p>a</p><iframe src=x>inside</iframe><p>b</p>")).toBe("<p>a</p><p>b</p>");
    expect(sanitizeHtml("<p>a</p><script>never closed <p>gone</p>")).toBe("<p>a</p>");
    expect(sanitizeHtml('<form action="x"><input name="a"><button>Go</button>text</form>')).toBe("text");
  });

  it("allows only safe link schemes and adds rel/target", () => {
    expect(sanitizeHtml('<a href="https://example.com/x?a=1&b=2" title="t">link</a>')).toBe('<a href="https://example.com/x?a=1&amp;b=2" title="t" rel="noopener noreferrer nofollow" target="_blank">link</a>');
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="mailto:a@b.co">m</a>')).toContain('href="mailto:a@b.co"');
    expect(sanitizeHtml('<a href="data:text/html,x">d</a>')).toBe("<a>d</a>");
  });

  it("strips remote images by default and keeps inline cid/data images", () => {
    expect(sanitizeHtml('<img src="https://t.example/pixel.gif" alt="">')).toBe("");
    expect(sanitizeHtml('<img src="https://t.example/a.png" alt="Chart">')).toBe("[Chart]");
    expect(sanitizeHtml('<img src="cid:part1" alt="inline">')).toBe('<img src="cid:part1" alt="inline">');
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toBe('<img src="data:image/png;base64,AAAA" alt="">');
    expect(sanitizeHtml('<img src="data:text/html;base64,AAAA">')).toBe("");
    expect(sanitizeHtml('<img src="https://t.example/a.png">', { allowRemoteImages: true })).toBe('<img src="https://t.example/a.png" alt="">');
  });

  it("escapes text, closes unbalanced markup and drops stray closing tags", () => {
    expect(sanitizeHtml("a < b & c > d &amp; &lt;")).toBe("a &lt; b &amp; c &gt; d &amp; &lt;");
    expect(sanitizeHtml("<p><b>bold<i>both</p>")).toBe("<p><b>bold<i>both</i></b></p>");
    expect(sanitizeHtml("</p></div>text</b>")).toBe("text");
    expect(sanitizeHtml("<p>x</p></html></body>")).toBe("<p>x</p>");
  });

  it("keeps table attributes within limits and drops unknown tags but not their text", () => {
    expect(sanitizeHtml('<table><tr><td colspan="2" rowspan="x">c</td><th scope="col">h</th></tr></table>')).toBe('<table><tr><td colspan="2">c</td><th scope="col">h</th></tr></table>');
    expect(sanitizeHtml("<custom-tag>t</custom-tag><center>c</center><font color=red>f</font>")).toBe("tcf");
    expect(sanitizeHtml("<svg onload=alert(1)><circle/></svg><p>after</p>")).toBe("<p>after</p>");
    expect(sanitizeHtml("<math><mi>x</mi></math>ok")).toBe("ok");
  });

  it("decodes entities safely", () => {
    expect(decodeEntities("&#106;&#x61;&amp;&nbsp;&unknown;")).toBe("ja&\u00a0&unknown;");
    expect(decodeEntities("&#0;&#1114112;")).toBe("");
  });

  it("turns html into readable text", () => {
    expect(htmlToText("<p>Hello <b>world</b></p><ul><li>one</li><li>two &amp; three</li></ul><script>x</script>")).toBe("Hello world\n- one\n- two & three");
    expect(htmlToText("line<br>break<div>block</div>")).toBe("line\nbreak\nblock");
  });
});

describe("attachments", () => {
  const ok = (name: string, type = "image/png", size: number | null = 100) => ({ fileName: name, contentType: type, sizeBytes: size });

  it("applies count, size and type limits in order", () => {
    const list = [
      ok("a.png"),
      ok("b.pdf", "application/pdf"),
      ok("c.exe", "application/x-msdownload"),
      ok("d.png", "image/png", ATTACHMENT_MAX_BYTES + 1),
      ok("e.png", "image/png", null),
      ok("f.png"),
      ok("g.png"),
      ok("h.png"),
      ok("i.png"),
      ok("j.html", "text/html"),
    ];
    const { accepted, rejected } = screenAttachments(list);
    expect(accepted.map((a) => a.fileName)).toEqual(["a.png", "b.pdf", "f.png", "g.png", "h.png"]);
    expect(accepted).toHaveLength(ATTACHMENT_MAX_PER_MESSAGE);
    expect(rejected.map((r) => [r.attachment.fileName, r.reason])).toEqual([
      ["c.exe", "type_not_allowed"],
      ["d.png", "too_large"],
      ["e.png", "size_unknown"],
      ["i.png", "too_many"],
      ["j.html", "type_not_allowed"],
    ]);
    expect(screenAttachments([ok("x.png", "IMAGE/PNG; name=x", ATTACHMENT_MAX_BYTES)]).accepted).toHaveLength(1);
  });

  it("sanitises file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\x\\report.pdf")).toBe("report.pdf");
    expect(sanitizeFileName(".hidden")).toBe("hidden");
    expect(sanitizeFileName("bad<>:\"|?*name\u0000.png")).toBe("badname.png");
    expect(sanitizeFileName("")).toBe("attachment");
    expect(sanitizeFileName(null)).toBe("attachment");
    expect(sanitizeFileName(`${"a".repeat(300)}.png`).length).toBeLessThanOrEqual(200);
    expect(sanitizeFileName(`${"a".repeat(300)}.png`).endsWith(".png")).toBe(true);
  });

  it("ships a no-op scanner that says so", async () => {
    expect(noopAttachmentScanner.name).toBe("none");
    await expect(noopAttachmentScanner.scan(Buffer.from("x"), ok("a.png"))).resolves.toEqual({ clean: true, detail: "not scanned" });
  });
});
