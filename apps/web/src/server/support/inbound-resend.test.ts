import { describe, expect, it, vi } from "vitest";
import { ACTIVE_LOCALES } from "@/i18n/routing";
import attachmentGet from "./fixtures/resend/attachment-get.json";
import bounced from "./fixtures/resend/email-bounced.json";
import complained from "./fixtures/resend/email-complained.json";
import delivered from "./fixtures/resend/email-delivered.json";
import failed from "./fixtures/resend/email-failed.json";
import received from "./fixtures/resend/email-received.json";
import receivingGet from "./fixtures/resend/receiving-get.json";
import {
  AttachmentTooLargeError,
  RESEND_DELIVERY_EVENT_TYPES,
  ResendApiError,
  createResendReceivingClient,
  deliveryStatusForEvent,
  detectInboundLocale,
  domainsAlign,
  guessLocaleFromText,
  isDeliveryEventType,
  localeFromLanguageTag,
  mergeReceivedEmail,
  nextDeliveryStatus,
  parseAuthenticationResults,
  parseAuthenticationResultsInstance,
  parseResendDeliveryEvent,
  parseResendReceivedEvent,
  senderAuthentication,
  spamVerdict,
  trustedAuthenticationResults,
} from "./inbound";

/** Task T3 additions to inbound.ts: receiving API, spam heuristics, locale detection, delivery events. */

function parsedFixture() {
  const parsed = parseResendReceivedEvent(received, "msg_fixture_1");
  if (!parsed.ok) throw new Error(`fixture does not parse: ${parsed.reason}`);
  return parsed.email;
}

describe("mergeReceivedEmail", () => {
  it("fills bodies, headers, threading ids and attachment sizes from the receiving API", () => {
    const event = parsedFixture();
    expect(event.text).toBeNull();
    expect(event.html).toBeNull();
    expect(event.attachments.map((a) => a.sizeBytes)).toEqual([null, null]);
    const merged = mergeReceivedEmail(event, receivingGet);
    expect(merged.text).toContain("doppelt gesendet");
    expect(merged.html).toContain("<script>");
    expect(merged.headers["content-language"]).toBe("de-DE");
    expect(merged.headers["authentication-results"]).toContain("dmarc=pass");
    expect(merged.messageId).toBe("CAB+ada-1@mail.example.com");
    expect(merged.cc).toEqual([{ email: "ops@example.com", name: "Ops" }]);
    expect(merged.subject).toBe("Pixel feuert doppelt auf der Danke-Seite");
    expect(merged.attachments).toEqual([
      expect.objectContaining({ providerId: "att_01", fileName: "screenshot.png", contentType: "image/png", sizeBytes: 20 }),
      expect.objectContaining({ providerId: "att_02", fileName: "export.zip", contentType: "application/zip", sizeBytes: 1024 }),
    ]);
    // the event is not mutated
    expect(event.attachments[0]!.sizeBytes).toBeNull();
  });

  it("keeps event values, reads threading headers from the detail and appends attachments the event did not list", () => {
    const event = { ...parsedFixture(), subject: "Event subject", messageId: "event@x", attachments: [] };
    const merged = mergeReceivedEmail(event, {
      ...receivingGet,
      subject: "Detail subject",
      message_id: "<detail@x>",
      headers: { "In-Reply-To": "<t1042.abc@support.track.site>", References: "<older@x> <t1042.abc@support.track.site>" },
      attachments: [{ id: "att_09", filename: "../notes.txt", size: 5, content_type: "text/plain; charset=utf-8", content_id: "c9", content_disposition: "inline" }],
    });
    expect(merged.subject).toBe("Event subject");
    expect(merged.messageId).toBe("event@x");
    expect(merged.inReplyTo).toBe("t1042.abc@support.track.site");
    expect(merged.references).toEqual(["older@x", "t1042.abc@support.track.site"]);
    expect(merged.attachments).toEqual([{ providerId: "att_09", fileName: "notes.txt", contentType: "text/plain", sizeBytes: 5, contentId: "c9", inline: true, downloadUrl: null }]);
  });
});

describe("createResendReceivingClient", () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response((typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body)) as BodyInit, { status, headers });
  const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/emails/receiving/4ef9a417-02e9-4d39-ad75-9611e0fcc33c")) return respond(receivingGet);
    if (url.endsWith("/attachments/att_01")) return respond(attachmentGet);
    if (url.endsWith("/attachments/missing")) return respond({ message: "not found" }, 404);
    if (url.endsWith("/emails/receiving/broken")) return respond({ nope: true });
    if (url.startsWith("https://files.resend.test/big-declared")) return respond(new Uint8Array(3), 200, { "content-length": "99999999" });
    if (url.startsWith("https://files.resend.test/big-actual")) return respond(new Uint8Array(64), 200);
    if (url.startsWith("https://files.resend.test/")) return respond(new Uint8Array([1, 2, 3, 4]), 200, { "content-length": "4" });
    return respond({}, 500);
  }) as unknown as typeof fetch;
  const client = createResendReceivingClient({ apiKey: "re_test_key", fetch: fakeFetch, baseUrl: "https://api.resend.test/" });

  it("calls the receiving endpoints with the bearer key and validates the answers", async () => {
    const detail = await client.getEmail("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect(detail.text).toContain("Danke-Seite");
    const last = calls.at(-1)!;
    expect(last.url).toBe("https://api.resend.test/emails/receiving/4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect((last.init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const link = await client.getAttachment("4ef9a417-02e9-4d39-ad75-9611e0fcc33c", "att_01");
    expect(link.download_url).toBe(attachmentGet.download_url);
    expect(calls.at(-1)!.url).toBe("https://api.resend.test/emails/receiving/4ef9a417-02e9-4d39-ad75-9611e0fcc33c/attachments/att_01");
  });

  it("turns HTTP errors and unexpected payloads into ResendApiError without the key in the message", async () => {
    await expect(client.getAttachment("x", "missing")).rejects.toMatchObject({ name: "ResendApiError", status: 404 });
    await expect(client.getEmail("broken")).rejects.toBeInstanceOf(ResendApiError);
    const err = await client.getAttachment("x", "missing").then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err?.message).not.toContain("re_test_key");
  });

  it("downloads https links only and refuses bodies above the limit before and after buffering", async () => {
    await expect(client.download("http://files.resend.test/a", 1000)).rejects.toThrow(/https/);
    await expect(client.download("https://files.resend.test/big-declared", 1000)).rejects.toBeInstanceOf(AttachmentTooLargeError);
    await expect(client.download("https://files.resend.test/big-actual", 10)).rejects.toBeInstanceOf(AttachmentTooLargeError);
    const bytes = await client.download("https://files.resend.test/ok", 1000);
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect((calls.at(-1)!.init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });
});

describe("authentication results, pinned to the receiving MTA's authserv-id", () => {
  const TRUST = { trustedAuthservIds: ["mx.resend.com"] };
  const h = (value: string) => ({ "authentication-results": value });

  it("parses the first instance only: authserv-id, clauses with properties, comments and quoted strings honoured", () => {
    expect(parseAuthenticationResultsInstance('mx.resend.com 1; spf=pass (sender ip; ok) smtp.mailfrom=a.example; dkim=pass header.d="a.example"; dmarc=pass (p=none, sp=none) header.from=a.example')).toEqual({
      authservId: "mx.resend.com",
      clauses: [
        { method: "spf", result: "pass", props: { "smtp.mailfrom": "a.example" } },
        { method: "dkim", result: "pass", props: { "header.d": "a.example" } },
        { method: "dmarc", result: "pass", props: { "header.from": "a.example" } },
      ],
    });
    // ARC instance tag, no-result, an instance without an authserv-id, nothing
    expect(parseAuthenticationResultsInstance("i=1; MX.Resend.com; dkim=fail header.d=a.example")).toMatchObject({ authservId: "mx.resend.com", clauses: [{ method: "dkim", result: "fail" }] });
    expect(parseAuthenticationResultsInstance("mx.resend.com; none")).toEqual({ authservId: "mx.resend.com", clauses: [] });
    expect(parseAuthenticationResultsInstance("dmarc=pass header.from=victim.example")).toBeNull();
    expect(parseAuthenticationResultsInstance("")).toBeNull();
    expect(parseAuthenticationResultsInstance(null)).toBeNull();
    // a collapsed header (the receiving API joins repeated headers): the scan stops where a second instance begins —
    // at an unquoted comma, or at a segment that is no `method=result` clause
    expect(parseAuthenticationResultsInstance("mx.resend.com; dmarc=none header.from=a.example, evil.example; dmarc=pass header.from=a.example")).toEqual({ authservId: "mx.resend.com", clauses: [{ method: "dmarc", result: "none", props: { "header.from": "a.example" } }] });
    expect(parseAuthenticationResultsInstance("mx.resend.com; dmarc=none header.from=a.example; evil.example; dmarc=pass header.from=a.example")).toEqual({ authservId: "mx.resend.com", clauses: [{ method: "dmarc", result: "none", props: { "header.from": "a.example" } }] });
    // a comma or semicolon inside a comment or a quoted value is not a boundary
    expect(parseAuthenticationResultsInstance('mx.resend.com; dkim=pass (a, b; c) header.d="x, y; z"; dmarc=pass')).toEqual({
      authservId: "mx.resend.com",
      clauses: [
        { method: "dkim", result: "pass", props: { "header.d": "x, y; z" } },
        { method: "dmarc", result: "pass", props: {} },
      ],
    });
  });

  it("believes the first instance only when its authserv-id is trusted, and reports the id it saw", () => {
    expect(trustedAuthenticationResults(h("mx.resend.com; dmarc=pass"), TRUST)).toMatchObject({ trusted: true, authservId: "mx.resend.com", source: "authentication-results" });
    expect(trustedAuthenticationResults(h("MX.Resend.COM; dmarc=pass"), { trustedAuthservIds: [" mx.resend.com "] })).toMatchObject({ trusted: true });
    expect(trustedAuthenticationResults(h("mx.other.example; dmarc=pass"), TRUST)).toEqual({ instance: null, authservId: "mx.other.example", trusted: false, source: null });
    // a forged instance in front of the real one hides the real one: the desk then knows nothing (fail closed)
    expect(trustedAuthenticationResults(h("evil.example; dmarc=pass header.from=a.example, mx.resend.com; dmarc=fail"), TRUST)).toMatchObject({ trusted: false, authservId: "evil.example" });
    // a forged instance behind the real one cannot reach into it, not even with an embedded fake boundary
    expect(trustedAuthenticationResults(h("mx.resend.com; dmarc=none, mx.resend.com; dmarc=pass header.from=a.example"), TRUST).instance?.clauses).toEqual([{ method: "dmarc", result: "none", props: {} }]);
    // nothing configured → nothing trusted; no header → nothing seen
    expect(trustedAuthenticationResults(h("mx.resend.com; dmarc=pass"), { trustedAuthservIds: [] })).toMatchObject({ trusted: false, authservId: "mx.resend.com" });
    expect(trustedAuthenticationResults({}, TRUST)).toEqual({ instance: null, authservId: null, trusted: false, source: null });
  });

  it("never reads ARC-Authentication-Results — not alone, not behind a foreign or an honest Authentication-Results", () => {
    // ARC sets survive every hop by design (RFC 8617 §5.1), so the RFC 8601 §5 stripping that makes the pinned instance a
    // verdict about this delivery does not cover them: a forged one under the configured id would arrive intact
    const forgedArc = { "arc-authentication-results": "i=1; mx.resend.com; dmarc=pass header.from=a.example; dkim=pass header.d=a.example" };
    expect(trustedAuthenticationResults(forgedArc, TRUST)).toEqual({ instance: null, authservId: null, trusted: false, source: null });
    expect(trustedAuthenticationResults({ ...h("evil.example; dmarc=pass"), ...forgedArc }, TRUST)).toEqual({ instance: null, authservId: "evil.example", trusted: false, source: null });
    expect(trustedAuthenticationResults({ ...h("mx.resend.com; dmarc=none"), ...forgedArc }, TRUST)).toMatchObject({ trusted: true, source: "authentication-results", instance: { clauses: [{ method: "dmarc", result: "none", props: {} }] } });
    expect(parseAuthenticationResults(forgedArc, TRUST)).toEqual({ spf: null, dkim: null, dmarc: null });
    expect(spamVerdict({ headers: { "arc-authentication-results": "i=1; mx.resend.com; dmarc=fail" } }, TRUST)).toMatchObject({ spam: false, auth: { spf: null, dkim: null, dmarc: null } });
  });

  it("reads SPF / DKIM / DMARC from the trusted instance only — never from Received-SPF or a foreign header", () => {
    expect(parseAuthenticationResults(h("mx.resend.com; spf=pass smtp.mailfrom=a; dkim=pass header.d=a; dmarc=pass (p=none)"), TRUST)).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass" });
    expect(parseAuthenticationResults({ "arc-authentication-results": "i=1; mx.resend.com; dkim=fail; dmarc=fail" }, TRUST)).toEqual({ spf: null, dkim: null, dmarc: null });
    expect(parseAuthenticationResults(h("mx.other.example; spf=fail; dkim=fail; dmarc=fail"), TRUST)).toEqual({ spf: null, dkim: null, dmarc: null });
    expect(parseAuthenticationResults({ "received-spf": "Fail (mx: domain does not designate)" }, TRUST)).toEqual({ spf: null, dkim: null, dmarc: null });
    expect(parseAuthenticationResults({}, TRUST)).toEqual({ spf: null, dkim: null, dmarc: null });
  });

  it("is conservative: DMARC fail, SPF plus DKIM fail, spam flags or a blocked sender — not SPF alone, not an untrusted verdict", () => {
    const v = (value: string) => ({ headers: h(`mx.resend.com; ${value}`) });
    expect(spamVerdict(v("spf=pass; dkim=pass; dmarc=pass"), TRUST).spam).toBe(false);
    expect(spamVerdict(v("spf=fail; dkim=pass; dmarc=pass"), TRUST).spam).toBe(false);
    expect(spamVerdict(v("spf=fail; dkim=fail"), TRUST)).toMatchObject({ spam: true, reasons: ["spf and dkim fail"] });
    expect(spamVerdict(v("spf=pass; dkim=pass; dmarc=fail"), TRUST)).toMatchObject({ spam: true, reasons: ["dmarc fail"] });
    expect(spamVerdict({ headers: h("mx.other.example; dmarc=fail") }, TRUST)).toMatchObject({ spam: false, auth: { spf: null, dkim: null, dmarc: null } });
    expect(spamVerdict({ headers: { "x-spam-flag": "YES" } }, TRUST)).toMatchObject({ spam: true, reasons: ["spam flag header"] });
    expect(spamVerdict({ headers: { "x-spam-status": "Yes, score=9.1" } }, TRUST).spam).toBe(true);
    expect(spamVerdict({ headers: {} }, { ...TRUST, blockedSender: true })).toMatchObject({ spam: true, reasons: ["blocked sender"] });
    expect(spamVerdict({ headers: {} }, TRUST).spam).toBe(false);
  });

  it("backs the From address only with DMARC or an aligned DKIM / SPF pass of the trusted instance — never a foreign or bare pass, never without it", () => {
    const seen = { authservId: "mx.resend.com", trusted: true };
    const a = (value: string) => h(`mx.resend.com; ${value}`);
    expect(senderAuthentication(mergeReceivedEmail(parsedFixture(), receivingGet).headers, "ada@example.com", TRUST)).toEqual({ aligned: true, via: "dmarc", ...seen });
    expect(senderAuthentication(a("spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass (p=none) header.from=example.com"), "Ada@Example.COM", TRUST)).toEqual({ aligned: true, via: "dmarc", ...seen });
    expect(senderAuthentication(a("dkim=pass header.d=mail.example.com; dmarc=none"), "ada@example.com", TRUST)).toEqual({ aligned: true, via: "dkim", ...seen });
    expect(senderAuthentication(a("dkim=pass header.i=@example.com"), "ada@corp.example.com", TRUST)).toEqual({ aligned: true, via: "dkim", ...seen });
    expect(senderAuthentication(a("spf=pass smtp.mailfrom=bounce@example.com; dmarc=none"), "ada@example.com", TRUST)).toEqual({ aligned: true, via: "spf", ...seen });
    expect(senderAuthentication(a("spf=pass smtp.mailfrom=bounce@example.com; dkim=pass header.d=example.com"), "ada@example.com", TRUST)).toEqual({ aligned: true, via: "dkim", ...seen });
    // a forged ARC-Authentication-Results under the trusted id authenticates nobody — alone, or next to the MTA's honest `dmarc=none`
    const forgedArc = { "arc-authentication-results": "i=1; mx.resend.com; dmarc=pass header.from=example.com; dkim=pass header.d=example.com" };
    expect(senderAuthentication(forgedArc, "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, authservId: null, trusted: false });
    expect(senderAuthentication({ ...a("dmarc=none header.from=example.com"), ...forgedArc }, "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    // a pass on somebody else's domain, a bare pass, a DMARC pass evaluated for another From, a fail: nothing is known about From
    expect(senderAuthentication(a("spf=pass smtp.mailfrom=evil.example; dkim=pass header.d=evil.example; dmarc=none"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    expect(senderAuthentication(a("dkim=pass header.d=notexample.com"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    expect(senderAuthentication(a("spf=pass; dkim=pass"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    expect(senderAuthentication(a("dmarc=pass header.from=evil.example"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    expect(senderAuthentication(a("dmarc=fail header.from=example.com; dkim=fail header.d=example.com; spf=softfail smtp.mailfrom=example.com"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    // a fail next to a pass inside the trusted instance outranks it
    expect(senderAuthentication(a("dkim=pass header.d=example.com; dmarc=fail header.from=example.com"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    // a foreign header — in front of the real one, or alone, or with nothing configured — authenticates nobody; the id seen is reported
    expect(senderAuthentication(h("forged.example; dmarc=pass header.from=example.com, mx.resend.com; dmarc=fail header.from=example.com"), "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, authservId: "forged.example", trusted: false });
    expect(senderAuthentication(h("mx.resend.com; dmarc=pass header.from=example.com"), "ada@example.com", { trustedAuthservIds: [] })).toEqual({ aligned: false, via: null, authservId: "mx.resend.com", trusted: false });
    expect(senderAuthentication({ "received-spf": "pass (mx: domain designates) envelope-from=ada@example.com" }, "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, authservId: null, trusted: false });
    expect(senderAuthentication({}, "ada@example.com", TRUST)).toEqual({ aligned: false, via: null, authservId: null, trusted: false });
    expect(senderAuthentication(a("dmarc=pass"), "not-an-address", TRUST)).toEqual({ aligned: false, via: null, ...seen });
    expect(domainsAlign("Example.com", "mail.example.com")).toBe(true);
    expect(domainsAlign("ada@example.com.", "@EXAMPLE.com")).toBe(true);
    expect(domainsAlign("example.co.uk", "evil.co.uk")).toBe(false);
    expect(domainsAlign("notexample.com", "example.com")).toBe(false);
    expect(domainsAlign("", "example.com")).toBe(false);
  });
});

describe("locale detection", () => {
  it("maps language tags to programme locales", () => {
    expect(localeFromLanguageTag("de-DE, en;q=0.8")).toBe("de");
    expect(localeFromLanguageTag("zh-CN, fr;q=0.5")).toBe("fr");
    expect(localeFromLanguageTag("pt_BR")).toBeNull();
    expect(localeFromLanguageTag("")).toBeNull();
    expect(localeFromLanguageTag(null)).toBeNull();
  });

  it("guesses the language of a mail body in the six programme languages, and stays silent when unsure", () => {
    const samples: Record<string, string> = {
      en: "Hello, we have a problem with the pixel and the events are not sent. Thanks for your help. Kind regards",
      de: "Hallo, wir haben ein Problem mit dem Pixel und die Events werden nicht gesendet. Bitte um Hilfe. Freundliche Grüße",
      fr: "Bonjour, nous avons un problème avec le pixel, les événements ne sont pas envoyés. Merci pour votre aide. Cordialement",
      es: "Hola, tenemos un problema con el píxel y los eventos no se envían. Gracias por su ayuda. Saludos",
      it: "Buongiorno, abbiamo un problema con il pixel e gli eventi non vengono inviati. Grazie per l'aiuto. Cordiali saluti",
      nl: "Hoi, wij hebben een probleem met de pixel en de events worden niet verzonden. Alvast bedankt voor de hulp. Met vriendelijke groet",
    };
    for (const locale of ACTIVE_LOCALES) expect(guessLocaleFromText(samples[locale]), locale).toBe(locale);
    expect(guessLocaleFromText("ok")).toBeNull();
    expect(guessLocaleFromText("Danke")).toBeNull();
    expect(guessLocaleFromText("")).toBeNull();
    expect(guessLocaleFromText(null)).toBeNull();
  });

  it("prefers the stored user locale, then language headers, then the text, then English", () => {
    const text = "Hallo, wir haben ein Problem mit dem Pixel und die Events werden nicht gesendet. Bitte um Hilfe. Freundliche Grüße";
    expect(detectInboundLocale({ storedLocale: "fr", headers: { "content-language": "de" }, text })).toEqual({ locale: "fr", source: "user" });
    expect(detectInboundLocale({ storedLocale: "xx", headers: { "content-language": "es-ES" }, text })).toEqual({ locale: "es", source: "header" });
    expect(detectInboundLocale({ headers: { "accept-language": "it-IT,en;q=0.5" }, text })).toEqual({ locale: "it", source: "header" });
    expect(detectInboundLocale({ headers: {}, text })).toEqual({ locale: "de", source: "text" });
    expect(detectInboundLocale({ headers: {}, text: "ok" })).toEqual({ locale: "en", source: "default" });
  });
});

describe("delivery events", () => {
  it("recognises the delivery event types", () => {
    for (const type of RESEND_DELIVERY_EVENT_TYPES) expect(isDeliveryEventType(type)).toBe(true);
    expect(isDeliveryEventType("email.received")).toBe(false);
    expect(isDeliveryEventType(null)).toBe(false);
  });

  it("parses the recorded payloads into delivery events with a short detail", () => {
    const d = parseResendDeliveryEvent(delivered, "msg_d");
    expect(d).toEqual({
      ok: true,
      event: { provider: "resend", providerEventId: "msg_d", type: "email.delivered", emailId: "9c2f7f0e-5b3a-4c2e-9d1a-0f3b2a1c4d5e", messageId: "t1042.01j7abc@support.track.site", to: ["ada@example.com"], createdAt: new Date("2026-09-08T10:01:10.000Z"), detail: null },
    });
    const b = parseResendDeliveryEvent(bounced, "msg_b");
    expect(b.ok && b.event.detail).toBe("Permanent/General: The recipient's email address does not exist.");
    const c = parseResendDeliveryEvent(complained, "msg_c");
    expect(c.ok && c.event.detail).toBe("complaint");
    const f = parseResendDeliveryEvent(failed, "msg_f");
    expect(f.ok && f.event.detail).toBe("Sending domain is not verified");
    expect(parseResendDeliveryEvent(received, "x")).toEqual({ ok: false, reason: "unsupported_type", detail: "email.received" });
    expect(parseResendDeliveryEvent({ type: "email.delivered", data: {} }, "x")).toMatchObject({ ok: false, reason: "invalid_payload" });
    expect(parseResendDeliveryEvent("nope", "x")).toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  it("maps types to statuses and never moves a delivery state backwards", () => {
    expect(deliveryStatusForEvent("email.sent")).toBe("sent");
    expect(deliveryStatusForEvent("email.delivered")).toBe("delivered");
    expect(deliveryStatusForEvent("email.bounced")).toBe("bounced");
    expect(deliveryStatusForEvent("email.complained")).toBe("complained");
    expect(deliveryStatusForEvent("email.failed")).toBe("failed");
    expect(deliveryStatusForEvent("email.suppressed")).toBe("failed");
    expect(deliveryStatusForEvent("email.delivery_delayed")).toBeNull();
    expect(nextDeliveryStatus("queued", "sent")).toBe("sent");
    expect(nextDeliveryStatus("delivered", "sent")).toBe("delivered");
    expect(nextDeliveryStatus("sent", "delivered")).toBe("delivered");
    expect(nextDeliveryStatus("bounced", "delivered")).toBe("bounced");
    expect(nextDeliveryStatus("delivered", "complained")).toBe("complained");
    expect(nextDeliveryStatus("complained", "bounced")).toBe("complained");
    expect(nextDeliveryStatus("na", "failed")).toBe("failed");
  });
});
