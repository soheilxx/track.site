import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envState: { SUPPORT_INBOUND_DOMAIN?: string; SUPPORT_FROM_ADDRESS?: string } = {};
vi.mock("@/env", () => ({ env: () => envState }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn() } }));
vi.mock("@/server/ops/platform", () => ({ withPlatform: vi.fn() }));

import type { SupportBusinessHours } from "@track-site/db";
import { ACTIVE_LOCALES } from "@/i18n/routing";
import { acknowledgementText } from "./inbound-handler";
import {
  AUTO_REPLY_SAMPLE,
  DAY_KEYS,
  autoReplyText,
  buildAutoReplyMail,
  businessHoursFormFrom,
  businessHoursFromForm,
  businessHoursToForm,
  defaultSupportSettings,
  emptyInboundCounts,
  INBOUND_LEDGER_ERROR_MAX,
  INBOUND_LEDGER_STALE_MS,
  isStaleInboundEvent,
  isValidHostname,
  isValidTimeZone,
  minutesToTime,
  normalizeBusinessHours,
  previewAutoReply,
  settingsDiff,
  shortenLedgerError,
  timeToMinutes,
  timeZoneOptions,
} from "./settings";

beforeEach(() => {
  delete envState.SUPPORT_INBOUND_DOMAIN;
  delete envState.SUPPORT_FROM_ADDRESS;
});

describe("validators", () => {
  it("accepts DNS names and rejects schemes, paths and single labels", () => {
    expect(isValidHostname("support.track.site")).toBe(true);
    expect(isValidHostname("Help.Example.COM")).toBe(true);
    expect(isValidHostname("localhost")).toBe(false);
    expect(isValidHostname("https://support.track.site")).toBe(false);
    expect(isValidHostname("support.track.site/inbox")).toBe(false);
    expect(isValidHostname("-bad.example.com")).toBe(false);
  });
  it("knows IANA time zones and offers suggestions", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(timeZoneOptions()).toContain("Europe/Berlin");
  });
  it("converts times", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(1080)).toBe("18:00");
    expect(minutesToTime(1440)).toBe("24:00");
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("9:05:00")).toBe(545);
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(timeToMinutes("24:01")).toBeNull();
    expect(timeToMinutes("9")).toBeNull();
    expect(timeToMinutes("10:60")).toBeNull();
  });
});

describe("business hours", () => {
  const seeded: SupportBusinessHours = { timezone: "Europe/Berlin", days: { mon: [[540, 1080]], tue: [[540, 1080]], fri: [[540, 720], [780, 1080]] } };
  it("normalises stored hours (bad windows and unknown days dropped, windows sorted)", () => {
    const messy = { timezone: " UTC ", days: { mon: [[600, 900], [540, 560], [700, 600], [1, 2000]], xyz: [[1, 2]] } } as unknown as Parameters<typeof normalizeBusinessHours>[0];
    expect(normalizeBusinessHours(messy)).toEqual({ timezone: "UTC", days: { mon: [[540, 560], [600, 900]] } });
    expect(normalizeBusinessHours(null)).toEqual({ timezone: "Europe/Berlin", days: {} });
  });
  it("maps stored hours to one window per day and reports the rest", () => {
    const { form, extraWindows } = businessHoursToForm(seeded);
    expect(form.timezone).toBe("Europe/Berlin");
    expect(form.days.mon).toEqual({ enabled: true, start: "09:00", end: "18:00" });
    expect(form.days.fri).toEqual({ enabled: true, start: "09:00", end: "12:00" });
    expect(form.days.sat).toEqual({ enabled: false, start: "09:00", end: "18:00" });
    expect(extraWindows).toEqual({ fri: [[780, 1080]] });
    expect(DAY_KEYS).toHaveLength(7);
  });
  it("builds hours from the form and reports errors per day", () => {
    const fields: Record<string, string> = { timezone: "Europe/Berlin", day_mon_enabled: "on", day_mon_start: "08:30", day_mon_end: "17:00", day_tue_enabled: "on", day_tue_start: "18:00", day_tue_end: "09:00", day_wed_enabled: "on", day_wed_start: "x", day_wed_end: "10:00", day_sun_start: "01:00", day_sun_end: "02:00" };
    const form = businessHoursFormFrom((n) => fields[n] ?? "", (n) => fields[n] === "on");
    const parsed = businessHoursFromForm(form);
    expect(parsed.value).toEqual({ timezone: "Europe/Berlin", days: { mon: [[510, 1020]] } });
    expect(parsed.errors).toEqual({ day_tue: "window", day_wed: "time" });
    expect(businessHoursFromForm({ ...form, timezone: "Nowhere/Land" }).errors.timezone).toBe("timezone");
  });
});

describe("settings diff", () => {
  it("records field changes, the signature as lengths only and the hours as JSON", () => {
    const before = defaultSupportSettings();
    expect(settingsDiff(before, { ...before, businessHours: { timezone: "Europe/Berlin", days: {} } })).toEqual({});
    const diff = settingsDiff(before, { ...before, fromName: "Help", signatureText: "Kind regards\nThe team", autoReplyEnabled: true, businessHours: { timezone: "UTC", days: { mon: [[540, 600]] } } });
    expect(diff).toEqual({
      fromName: { before: "Track Support", after: "Help" },
      autoReplyEnabled: { before: false, after: true },
      signatureText: { changed: true, lengthBefore: 0, lengthAfter: 21 },
      businessHours: { before: { timezone: "Europe/Berlin", days: {} }, after: { timezone: "UTC", days: { mon: [[540, 600]] } } },
    });
    expect(JSON.stringify(diff)).not.toContain("Kind regards");
  });
});

describe("auto-acknowledgement", () => {
  it("greets by name when known, never invents one, and carries no sign-off (the layout adds the footer)", () => {
    const named = autoReplyText({ requesterName: "Ada", number: 1042, locale: "en" });
    expect(named.startsWith("Hello Ada,")).toBe(true);
    expect(named).toContain("ticket #1042");
    expect(named).not.toContain("Kind regards");
    const anonymous = autoReplyText({ requesterName: "  ", number: 7, locale: "de" });
    expect(anonymous.startsWith("Guten Tag,")).toBe(true);
    expect(anonymous).not.toContain("undefined");
  });
  it("is the text the inbound route sends, for every active locale", () => {
    for (const locale of ACTIVE_LOCALES) {
      const text = autoReplyText({ requesterName: "Ada", number: 1, locale });
      expect(text).toBe(acknowledgementText(locale, 1, "Ada"));
      expect(text).toContain("Ada");
      expect(text).toMatch(/1/);
    }
  });
  it("builds an automatic mail with the loop-prevention headers, the stored sender and the reply-to", () => {
    const { mail, messageId } = buildAutoReplyMail({
      ticket: { id: "t", number: 1042, subject: "Pixel fires twice", requesterEmail: "ada@example.com", requesterName: "Ada", locale: "fr" },
      settings: { fromName: "Help Desk", fromAddress: "help@example.com", inboundDomain: "in.example.com", signatureText: "never on auto mails" },
      inReplyTo: "abc@mail.example",
    });
    expect(mail.from).toBe('"Help Desk" <help@example.com>');
    expect(mail.replyTo).toBe("support+t1042@in.example.com");
    expect(mail.subject).toBe("Re: [Track #1042] Pixel fires twice");
    expect(mail.headers).toMatchObject({ "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All", "X-Track-Ticket": "1042" });
    expect(mail.inReplyTo).toBe("<abc@mail.example>");
    expect(mail.text).toContain("Bonjour Ada,");
    expect(mail.text).not.toContain("never on auto mails");
    expect(messageId.endsWith("@in.example.com")).toBe(true);
  });
  it("previews with the sample ticket and the environment overrides", () => {
    envState.SUPPORT_FROM_ADDRESS = "desk@env.example";
    const preview = previewAutoReply({ fromName: "Track Support", fromAddress: "stored@example.com", inboundDomain: "support.track.site" }, "nl");
    expect(preview.from).toBe('"Track Support" <desk@env.example>');
    expect(preview.replyTo).toBe(`support+t${AUTO_REPLY_SAMPLE.number}@support.track.site`);
    expect(preview.text).toContain(`Hallo ${AUTO_REPLY_SAMPLE.requesterName},`);
    expect(preview.sample.number).toBe(AUTO_REPLY_SAMPLE.number);
    expect(preview.locale).toBe("nl");
  });
});

describe("inbound ledger helpers", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  it("flags only a received row older than the stale window", () => {
    const old = new Date(now.getTime() - INBOUND_LEDGER_STALE_MS - 1000).toISOString();
    const fresh = new Date(now.getTime() - 60_000).toISOString();
    expect(isStaleInboundEvent({ status: "received", receivedAt: old }, now)).toBe(true);
    expect(isStaleInboundEvent({ status: "received", receivedAt: fresh }, now)).toBe(false);
    expect(isStaleInboundEvent({ status: "failed", receivedAt: old }, now)).toBe(false);
    expect(isStaleInboundEvent({ status: "processed", receivedAt: old }, now)).toBe(false);
    expect(isStaleInboundEvent({ status: "received", receivedAt: "not a date" }, now)).toBe(false);
  });
  it("shortens the stored error to one line with an ellipsis and drops empty ones", () => {
    expect(shortenLedgerError(null)).toBeNull();
    expect(shortenLedgerError("   \n ")).toBeNull();
    expect(shortenLedgerError("receiving API\n  500  Internal Server Error")).toBe("receiving API 500 Internal Server Error");
    const long = "x".repeat(INBOUND_LEDGER_ERROR_MAX + 50);
    const short = shortenLedgerError(long)!;
    expect(short.length).toBe(INBOUND_LEDGER_ERROR_MAX);
    expect(short.endsWith("…")).toBe(true);
    expect(shortenLedgerError("abcdef", 4)).toBe("abc…");
  });
  it("starts every status at zero", () => {
    expect(emptyInboundCounts()).toEqual({ received: 0, processed: 0, ignored: 0, failed: 0 });
  });
});
