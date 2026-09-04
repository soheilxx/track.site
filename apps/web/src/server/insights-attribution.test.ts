import { describe, expect, it } from "vitest";
import { audienceSegments } from "./insights-audiences";
import {
  AD_SERVER_REFERRER_PATTERN,
  acceptedClickIds,
  buildDestinations,
  captureRate,
  configFromBundle,
  consentGapEstimate,
  fillDays,
  forwardingVerdict,
  parseRange,
  summarizeClickIds,
  vendorOf,
  verdictTone,
  windowFor,
  type ClickIdRow,
  type DestinationInput,
  type ForwardingRow,
} from "./insights-attribution";

const row = (over: Partial<ClickIdRow> = {}): ClickIdRow => ({
  param: "gclid",
  events: 10,
  values: 4,
  originUrl: 4,
  originStorage: 5,
  originServer: 0,
  originInherited: 1,
  withoutConsent: 0,
  firstSeen: new Date("2026-09-01T10:00:00Z"),
  lastSeen: new Date("2026-09-03T10:00:00Z"),
  ttlMinSeconds: 90 * 86_400,
  ttlMaxSeconds: 90 * 86_400,
  medianSpanSeconds: 5_400,
  maxSpanSeconds: 172_800,
  ...over,
});

const destination = (over: Partial<DestinationInput> = {}): DestinationInput => ({
  id: "d1",
  name: "Google Ads",
  connectorType: "google_ads",
  status: "connected",
  testMode: false,
  pausedAt: null,
  ...over,
});

describe("attribution health — window and vocabulary", () => {
  it("parses the range parameter defensively (30 days is default and maximum)", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(["7"])).toBe(7);
    expect(parseRange("30")).toBe(30);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });

  it("builds the window from now backwards", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const w = windowFor(7, now);
    expect(w.to.toISOString()).toBe(now.toISOString());
    expect(w.from.toISOString()).toBe("2026-08-28T12:00:00.000Z");
  });

  it("maps click ids to their vendor family and destinations to the ids they may receive", () => {
    expect(vendorOf("gclid")).toBe("google");
    expect(vendorOf("fbclid")).toBe("meta");
    expect(vendorOf("li_fat_id")).toBe("linkedin");
    expect(vendorOf("nope")).toBe("other");
    expect(acceptedClickIds("google_ads")).toEqual(["gclid", "gbraid", "wbraid"]);
    expect(acceptedClickIds("meta")).toEqual(["fbclid"]);
    expect(acceptedClickIds("webhook")).toEqual([]);
    expect(acceptedClickIds("unknown_connector")).toEqual([]);
  });

  it("only treats ad-server hosts as paid referrers — never google.com or facebook.com themselves", () => {
    const re = new RegExp(AD_SERVER_REFERRER_PATTERN, "i");
    expect(re.test("https://www.googleadservices.com/pagead/aclk?x=1")).toBe(true);
    expect(re.test("https://ad.doubleclick.net/ddm/clk/1")).toBe(true);
    expect(re.test("https://www.google.com/")).toBe(false);
    expect(re.test("https://l.facebook.com/l.php")).toBe(false);
    expect(re.test("https://example.com/?ref=doubleclick.net")).toBe(false);
  });
});

describe("attribution health — observed facts", () => {
  it("summarises click ids with origin shares, lifetimes in days and spans in hours, ordered by volume", () => {
    const out = summarizeClickIds([
      row({
        param: "fbclid",
        events: 3,
        originUrl: 3,
        originStorage: 0,
        originInherited: 0,
        ttlMinSeconds: 30 * 86_400,
        ttlMaxSeconds: 90 * 86_400,
        medianSpanSeconds: null,
        maxSpanSeconds: null,
      }),
      row(),
    ]);
    expect(out.map((r) => r.param)).toEqual(["gclid", "fbclid"]);
    const gclid = out[0]!;
    expect(gclid.vendor).toBe("google");
    expect(gclid.ttlDays).toEqual({ min: 90, max: 90 });
    expect(gclid.origins).toEqual([
      { origin: "url", count: 4, share: 0.4 },
      { origin: "storage", count: 5, share: 0.5 },
      { origin: "inherited", count: 1, share: 0.1 },
    ]);
    expect(gclid.medianSpanHours).toBe(1.5);
    expect(gclid.maxSpanHours).toBe(48);
    const fbclid = out[1]!;
    expect(fbclid.ttlDays).toEqual({ min: 30, max: 90 });
    expect(fbclid.medianSpanHours).toBeNull();
    expect(fbclid.origins).toEqual([{ origin: "url", count: 3, share: 1 }]);
  });

  it("keeps the capture rate null when nothing is measurable and caps it at 100 %", () => {
    expect(captureRate({ marketing: 0, withClickIds: 0 })).toBeNull();
    expect(captureRate({ marketing: 200, withClickIds: 50 })).toBe(0.25);
    expect(captureRate({ marketing: 10, withClickIds: 12 })).toBe(1);
  });

  it("reads the capture configuration from a published bundle and falls back to the platform defaults", () => {
    expect(
      configFromBundle({ consent: { click_ids: { capture: false, ttl_days: 30 } } }, 4),
    ).toEqual({ source: "published", version: 4, capture: false, ttlDays: 30 });
    expect(configFromBundle(null, null)).toEqual({
      source: "default",
      version: null,
      capture: true,
      ttlDays: 90,
    });
    expect(configFromBundle({ consent: {} }, 2)).toEqual({
      source: "default",
      version: 2,
      capture: true,
      ttlDays: 90,
    });
  });

  it("fills missing days of the window with zeros (UTC days, continuous axis)", () => {
    const from = new Date("2026-09-01T09:30:00Z");
    const to = new Date("2026-09-04T09:30:00Z");
    const out = fillDays(
      [{ day: "2026-09-02", total: 5, marketing: 3, withClickIds: 1 }],
      from,
      to,
    );
    expect(out.map((d) => d.day)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(out[1]).toEqual({ day: "2026-09-02", total: 5, marketing: 3, withClickIds: 1 });
    expect(out[0]).toEqual({ day: "2026-09-01", total: 0, marketing: 0, withClickIds: 0 });
  });
});

describe("attribution health — modelled hints stay null without evidence", () => {
  it("extrapolates the consent gap only from an observed capture rate", () => {
    expect(consentGapEstimate({ total: 1000, marketing: 0, withClickIds: 0 })).toBeNull();
    expect(consentGapEstimate({ total: 1000, marketing: 600, withClickIds: 0 })).toBeNull();
    expect(consentGapEstimate({ total: 600, marketing: 600, withClickIds: 60 })).toBeNull();
    expect(consentGapEstimate({ total: 1000, marketing: 600, withClickIds: 60 })).toBe(40);
  });
});

describe("attribution health — forwarding per destination", () => {
  const fwd = (over: Partial<ForwardingRow> = {}): ForwardingRow => ({
    integrationId: "d1",
    param: "gclid",
    eligible: 10,
    delivered: 10,
    failed: 0,
    pending: 0,
    notRouted: 0,
    expiredAtDelivery: 0,
    lastDeliveredAt: new Date("2026-09-03T10:00:00Z"),
    ...over,
  });

  it("derives the verdict from the destination state and the delivery record", () => {
    const active = destination();
    expect(
      forwardingVerdict(active, [], {
        eligible: 0,
        deliveredWithId: 0,
        failed: 0,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("unsupported");
    expect(
      forwardingVerdict(destination({ status: "draft" }), ["gclid"], {
        eligible: 5,
        deliveredWithId: 5,
        failed: 0,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("inactive");
    expect(
      forwardingVerdict(destination({ pausedAt: new Date() }), ["gclid"], {
        eligible: 5,
        deliveredWithId: 5,
        failed: 0,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("inactive");
    expect(
      forwardingVerdict(active, ["gclid"], {
        eligible: 0,
        deliveredWithId: 0,
        failed: 0,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("no_eligible");
    expect(
      forwardingVerdict(active, ["gclid"], {
        eligible: 5,
        deliveredWithId: 5,
        failed: 0,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("forwarding");
    expect(
      forwardingVerdict(active, ["gclid"], {
        eligible: 5,
        deliveredWithId: 3,
        failed: 2,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("partial");
    expect(
      forwardingVerdict(active, ["gclid"], {
        eligible: 5,
        deliveredWithId: 4,
        failed: 0,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 1,
      }),
    ).toBe("partial");
    expect(
      forwardingVerdict(active, ["gclid"], {
        eligible: 5,
        deliveredWithId: 0,
        failed: 5,
        pending: 0,
        notRouted: 0,
        expiredAtDelivery: 0,
      }),
    ).toBe("failing");
    expect(
      forwardingVerdict(active, ["gclid"], {
        eligible: 5,
        deliveredWithId: 0,
        failed: 0,
        pending: 0,
        notRouted: 5,
        expiredAtDelivery: 0,
      }),
    ).toBe("not_delivered");
    expect(verdictTone("forwarding")).toBe("ok");
    expect(verdictTone("failing")).toBe("bad");
    expect(verdictTone("not_delivered")).toBe("warn");
    expect(verdictTone("unsupported")).toBe("neutral");
  });

  it("joins destinations with their rows, ignores ids the destination may not receive and counts expired ids as not forwarded", () => {
    const out = buildDestinations(
      [
        destination(),
        destination({ id: "d2", name: "Meta", connectorType: "meta" }),
        destination({ id: "d3", name: "Hook", connectorType: "webhook" }),
      ],
      [
        fwd({ eligible: 10, delivered: 8, failed: 1, notRouted: 1, expiredAtDelivery: 2 }),
        fwd({ param: "fbclid", integrationId: "d1", eligible: 99, delivered: 99 }),
        fwd({
          integrationId: "d2",
          param: "fbclid",
          eligible: 4,
          delivered: 0,
          failed: 4,
          lastDeliveredAt: null,
        }),
      ],
    );
    expect(out.map((d) => [d.name, d.verdict])).toEqual([
      ["Meta", "failing"],
      ["Google Ads", "partial"],
      ["Hook", "unsupported"],
    ]);
    const google = out.find((d) => d.id === "d1")!;
    expect(google.eligible).toBe(10);
    expect(google.deliveredWithId).toBe(6);
    expect(google.expiredAtDelivery).toBe(2);
    expect(google.failed).toBe(1);
    expect(google.notRouted).toBe(1);
    expect(google.lastForwardedAt?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(google.perParam).toEqual([
      { param: "gclid", eligible: 10, deliveredWithId: 6, failed: 1 },
      { param: "gbraid", eligible: 0, deliveredWithId: 0, failed: 0 },
      { param: "wbraid", eligible: 0, deliveredWithId: 0, failed: 0 },
    ]);
    const meta = out.find((d) => d.id === "d2")!;
    expect(meta.lastForwardedAt).toBeNull();
    expect(meta.accepts).toEqual(["fbclid"]);
  });
});

describe("audiences — consent-aware segments", () => {
  it("counts subjects per segment from consented events only and reports what was excluded", () => {
    const out = audienceSegments([
      { name: "purchase", subject: "u1", marketing: true, value: 250 },
      { name: "purchase", subject: "u2", marketing: true, value: 20 },
      { name: "purchase", subject: "u3", marketing: false, value: 900 },
      { name: "add_to_cart", subject: "u2", marketing: true, value: null },
      { name: "add_to_cart", subject: "u4", marketing: true, value: null },
      { name: "begin_checkout", subject: "u5", marketing: true, value: null },
      { name: "generate_lead", subject: null, marketing: true, value: null },
      { name: "sign_up", subject: "u6", marketing: true, value: null },
    ]);
    expect(Object.fromEntries(out.segments.map((s) => [s.key, s.size]))).toEqual({
      buyers: 2,
      highValue: 1,
      abandoners: 2,
      leads: 0,
      signups: 1,
    });
    expect(out.withoutConsent).toBe(1);
    expect(out.withoutIdentity).toBe(1);
    expect(out.considered).toBe(8);
  });
});
