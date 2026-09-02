// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consentModeFlags, normalizeConsent } from "./consent.ts";
import { verifySigned } from "./config.ts";
import { Tracker, extractCommerce, sanitizeProps } from "./tracker.ts";
import type { BundleView } from "./types.ts";
import { canonicalJson, scrubUrl, ulid } from "./util.ts";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

function bundle(over: Partial<BundleView> = {}): BundleView {
  return {
    schema_version: "1",
    site: { tracking_id: "A7K2Q9", environment: "production" },
    version: 3,
    settings: { auto_page_view: true, spa_tracking: true, cookie_domain: null, session_timeout_min: 30, kill_switch: false, allowed_hosts: [], url_allow_params: [], url_block_params: [], batch: { max_events: 20, flush_ms: 50 }, debug: false },
    consent: { policy_version: "v1", purposes: ["necessary", "analytics", "marketing", "personalization"], default_region_mode: "strict_opt_in", cmp: { provider: "api", settings: {} }, consent_mode: { enabled: true, mode: "basic" }, click_ids: { capture: true, ttl_days: 90 }, respect_gpc: true },
    events: [
      { name: "page_view", enabled: true, critical: false, trigger: { type: "page", path_pattern: null } },
      { name: "add_to_cart", enabled: true, critical: true, trigger: { type: "selector", selector: "[data-track-add]", dom_event: "click" } },
      { name: "purchase", enabled: true, critical: true, trigger: { type: "data_layer", key: "purchase" } },
    ],
    destinations: [],
    ...over,
  };
}

async function signedFixture(b: BundleView) {
  const { generateKeyPairSync, sign, createHash } = await import("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const canonical = canonicalJson(b);
  const signature = sign(null, Buffer.from(canonical), privateKey).toString("base64");
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return {
    signed: { payload: b, digest: createHash("sha256").update(canonical).digest("hex"), keyId: "cfg-v1", algorithm: "ed25519", signature },
    raw: spki.subarray(spki.length - 32).toString("base64"),
  };
}

function fetchStub(fixture: Awaited<ReturnType<typeof signedFixture>>, posts: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/c/A7K2Q9")) return new Response(JSON.stringify({ tracking_id: "A7K2Q9", version: 3, bundle_url: "https://cdn.test/v1/c/A7K2Q9/3.json", digest: fixture.signed.digest, key_id: "cfg-v1", kill_switch: false }), { status: 200 });
    if (url.endsWith("/3.json")) return new Response(JSON.stringify({ signed: fixture.signed, browser: fixture.signed.payload }), { status: 200 });
    if (url.endsWith("/v1/e")) {
      posts.push(String(init?.body));
      return new Response("{}", { status: 202 });
    }
    return new Response("nf", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("util", () => {
  it("ulid + scrub + canonical json", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const r = scrubUrl("https://shop.test/p?utm_source=x&fbclid=f1&email=a@b.de&token=t&q=1#h");
    expect(r.url).toBe("https://shop.test/p?utm_source=x&q=1");
    expect(r.clickIds).toEqual({ fbclid: "f1" });
    expect(canonicalJson({ b: 1, a: [2, { z: 1, y: 2 }] })).toBe('{"a":[2,{"y":2,"z":1}],"b":1}');
  });
  it("consent normalization and consent mode", () => {
    expect(normalizeConsent({ analytics: true }, "api", "v1", null)?.granted).toEqual(["necessary", "analytics"]);
    expect(normalizeConsent(["marketing"], "api", "v1", null)?.granted).toEqual(["necessary", "marketing"]);
    expect(normalizeConsent("garbage", "api", "v1", null)).toBeNull();
    expect(consentModeFlags({ granted: ["necessary", "analytics"], source: "api", policy_version: "v1", ts: 1, region: null, gpc: null })).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" });
    expect(consentModeFlags({ granted: ["necessary", "analytics", "marketing"], source: "api", policy_version: "v1", ts: 1, region: null, gpc: true }).ad_storage).toBe("denied");
  });
  it("extracts commerce and sanitizes props", () => {
    const p: Record<string, unknown> = { value: "12.5", currency: "eur", items: [{ id: "sku1", price: "3", quantity: 2 }], color: "red", password: "x" };
    const c = extractCommerce(p);
    expect(c).toMatchObject({ value: 12.5, currency: "EUR", items: [{ item_id: "sku1", price: 3, quantity: 2 }] });
    expect(sanitizeProps(p)).toEqual({ color: "red" });
  });
});

describe("signature verification (fail closed)", () => {
  it("accepts valid signatures and rejects tampering / unknown keys", async () => {
    const f = await signedFixture(bundle());
    expect(await verifySigned(f.signed, { "cfg-v1": f.raw })).toBe(true);
    expect(await verifySigned({ ...f.signed, payload: { ...bundle(), version: 4 } }, { "cfg-v1": f.raw })).toBe(false);
    expect(await verifySigned(f.signed, { other: f.raw })).toBe(false);
  });
});

describe("tracker", () => {
  let posts: string[] = [];
  beforeEach(() => {
    posts = [];
    document.cookie = "_ts_id=; Max-Age=-1; Path=/";
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState({}, "", "/start");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing before consent and stores nothing, then sends after consent", async () => {
    const f = await signedFixture(bundle());
    const fetchImpl = fetchStub(f, posts);
    const t = new Tracker({ siteId: "A7K2Q9", ingestUrl: "https://ingest.test", cdnUrl: "https://cdn.test", publicKeys: { "cfg-v1": f.raw }, version: "1.0.0" }, fetchImpl);
    await t.init();
    expect(t.state.ready).toBe(true);
    t.event("add_to_cart", { value: 1 });
    await new Promise((r) => setTimeout(r, 80));
    expect(posts).toHaveLength(0);
    expect(document.cookie).not.toContain("_ts_id");
    expect(localStorage.getItem("_ts_id")).toBeNull();

    t.consentApi({ analytics: true });
    t.page({ manual: true });
    await new Promise((r) => setTimeout(r, 120));
    expect(posts).toHaveLength(1);
    const batch = JSON.parse(posts[0]!);
    expect(batch.site_id).toBe("A7K2Q9");
    expect(batch.events[0].name).toBe("page_view");
    expect(batch.events[0].ids.anonymous_id).toMatch(/^[0-9A-Z]{26}$/);
    expect(batch.events[0].consent.granted).toEqual(["necessary", "analytics"]);
    expect(batch.events[0].click_ids).toBeUndefined();
    expect(document.cookie).toContain("_ts_id=");
    t.destroy();
  });

  it("withdrawal clears identifiers and pending events; SPA navigation and selector triggers work", async () => {
    const f = await signedFixture(bundle());
    const fetchImpl = fetchStub(f, posts);
    const t = new Tracker({ siteId: "A7K2Q9", ingestUrl: "https://ingest.test", cdnUrl: "https://cdn.test", publicKeys: { "cfg-v1": f.raw }, version: "1.0.0" }, fetchImpl);
    await t.init();
    t.consentApi({ analytics: true, marketing: true });
    history.pushState({}, "", "/next?fbclid=zz");
    await new Promise((r) => setTimeout(r, 10));
    const btn = document.createElement("button");
    btn.setAttribute("data-track-add", "1");
    btn.setAttribute("data-track-sku", "S1");
    document.body.appendChild(btn);
    btn.click();
    (window as unknown as { dataLayer: unknown[] }).dataLayer.push({ event: "purchase", ecommerce: { transaction_id: "T1", value: 10, currency: "EUR", items: [{ item_id: "S1", quantity: 1 }] } });
    await new Promise((r) => setTimeout(r, 120));
    const all = posts.flatMap((p) => JSON.parse(p).events as Array<{ name: string; props?: Record<string, unknown>; commerce?: Record<string, unknown>; click_ids?: Record<string, string>; page: { url: string } }>);
    const names = all.map((e) => e.name);
    expect(names).toContain("page_view");
    expect(names).toContain("add_to_cart");
    expect(names).toContain("purchase");
    const nav = all.find((e) => e.name === "page_view" && e.page.url.includes("/next"));
    expect(nav?.click_ids).toEqual({ fbclid: "zz" });
    expect(nav?.page.url).not.toContain("fbclid");
    expect(all.find((e) => e.name === "add_to_cart")?.props).toMatchObject({ tag: "button", sku: "S1" });
    expect(all.find((e) => e.name === "purchase")?.commerce).toMatchObject({ transaction_id: "T1", value: 10 });

    t.consentApi({ analytics: false, marketing: false });
    expect(document.cookie).not.toContain("_ts_id=");
    expect(localStorage.getItem("_ts_id")).toBeNull();
    const before = posts.length;
    t.event("late_event");
    await new Promise((r) => setTimeout(r, 120));
    expect(posts.length).toBe(before);
    t.destroy();
  });

  it("fails closed on an invalid signature and on kill switch", async () => {
    const f = await signedFixture(bundle());
    const bad = new Tracker({ siteId: "A7K2Q9", ingestUrl: "https://ingest.test", cdnUrl: "https://cdn.test", publicKeys: { "cfg-v1": "AAAA" }, version: "1.0.0" }, fetchStub(f, posts));
    await bad.init();
    expect(bad.state).toMatchObject({ ready: false, disabledReason: "config_unavailable_or_invalid_signature" });
    const killed = await signedFixture(bundle({ settings: { ...bundle().settings, kill_switch: true } }));
    const k = new Tracker({ siteId: "A7K2Q9", ingestUrl: "https://ingest.test", cdnUrl: "https://cdn.test", publicKeys: { "cfg-v1": killed.raw }, version: "1.0.0" }, fetchStub(killed, posts));
    await k.init();
    expect(k.state.disabledReason).toBe("kill_switch");
  });

  it("sets Google consent mode defaults before any tag when a Google destination exists", async () => {
    const f = await signedFixture(bundle({ destinations: [{ id: "d1", type: "ga4", name: "GA4", enabled: true, purpose: "analytics", mode: "hybrid", browser: { pixel_id: null, measurement_id: "G-TEST", partner_id: null, conversion_id: null, conversion_label: null }, test_mode: false, mappings: [{ event: "page_view", vendor_event: "page_view", enabled: true }] }] }));
    const t = new Tracker({ siteId: "A7K2Q9", ingestUrl: "https://ingest.test", cdnUrl: "https://cdn.test", publicKeys: { "cfg-v1": f.raw }, version: "1.0.0" }, fetchStub(f, posts));
    await t.init();
    const dl = (window as unknown as { dataLayer: IArguments[] }).dataLayer;
    const consentDefault = Array.from(dl).find((a) => a[0] === "consent" && a[1] === "default");
    expect(consentDefault?.[2]).toMatchObject({ ad_storage: "denied", analytics_storage: "denied" });
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    t.consentApi({ analytics: true });
    expect(document.querySelector('script[src*="googletagmanager"]')).not.toBeNull();
    t.destroy();
  });
});
