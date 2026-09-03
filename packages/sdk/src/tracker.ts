import { loadConfig, type LoadedConfig } from "./config.ts";
import { ConsentManager, has, readGpc } from "./consent.ts";
import { ClickIdStore, IdentityStore, readCookie } from "./storage.ts";
import { Transport } from "./transport.ts";
import type { BundleView, ConsentState, OutgoingEvent, Purpose, TrackerOptions } from "./types.ts";
import { activateVendor, consentModeDefault, consentModeUpdate, mirrorEvent, resetVendors } from "./vendors.ts";
import { hostMatches, pathMatches, scrubUrl, ulid, vendorMirrorId } from "./util.ts";

export const SCHEMA_VERSION = "1.0.0";
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{1,63}$/;

/**
 * The tracker: loads the signed config, gates everything behind consent, captures page views and
 * configured triggers, batches consented events to the collector and mirrors them to activated
 * browser tags with the shared dedup id. Every public method is isolated with try/catch.
 */
export class Tracker {
  private config: LoadedConfig | null = null;
  private readonly clicks = new ClickIdStore();
  private consent: ConsentManager | null = null;
  private ids: IdentityStore | null = null;
  private transport: Transport | null = null;
  private seq = 0;
  private userId: string | null = null;
  private lastPageUrl: string | null = null;
  private debugEnabled: boolean;
  private ready = false;
  private pendingConsent: unknown = null;
  private disabledReason: string | null = null;
  private detachers: Array<() => void> = [];

  constructor(
    private readonly o: TrackerOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.debugEnabled = Boolean(o.debug);
  }

  async init(): Promise<void> {
    try {
      const cfg = await loadConfig(this.o.cdnUrl, this.o.siteId, this.o.publicKeys, this.fetchImpl);
      if (!cfg) {
        this.disabledReason = "config_unavailable_or_invalid_signature";
        this.log("tracking disabled", this.disabledReason);
        return;
      }
      if (cfg.killSwitch || cfg.bundle.settings.kill_switch) {
        this.disabledReason = "kill_switch";
        this.log("tracking disabled", this.disabledReason);
        return;
      }
      const b = cfg.bundle;
      if (b.settings.allowed_hosts.length && !b.settings.allowed_hosts.some((h) => hostMatches(location.hostname, h)) && !isLocal(location.hostname)) {
        this.disabledReason = "host_not_allowed";
        this.log("tracking disabled", this.disabledReason);
        return;
      }
      this.config = cfg;
      this.debugEnabled = this.debugEnabled || b.settings.debug;
      this.ids = new IdentityStore(b.settings.cookie_domain, b.settings.session_timeout_min * 60_000);
      this.transport = new Transport({ url: `${this.o.ingestUrl}/v1/e`, siteId: this.o.siteId, maxEvents: b.settings.batch.max_events, flushMs: b.settings.batch.flush_ms, onDebug: (m, d) => this.log(m, d), fetchImpl: this.fetchImpl });
      this.consent = new ConsentManager(b.consent, readGpc());
      const w = window as unknown as Window & Record<string, unknown>;
      const hasGoogle = b.destinations.some((d) => d.type === "ga4" || d.type === "google_ads");
      if (b.consent.consent_mode.enabled && hasGoogle) consentModeDefault(w, this.consent.state);
      this.consent.onChange((next, prev) => this.onConsentChange(next, prev));
      this.consent.attach();
      if (this.pendingConsent !== null) this.consent.setFrom(this.pendingConsent, "api");
      this.ready = true;
      this.installAutocapture();
      if (b.settings.auto_page_view) this.page();
      this.log("ready", { version: cfg.version, consent: this.consent.state.granted });
    } catch (e) {
      this.disabledReason = "init_error";
      this.log("init error", e instanceof Error ? e.message : e);
    }
  }

  get state(): { ready: boolean; disabledReason: string | null; consent: ConsentState | null; version: number | null } {
    return { ready: this.ready, disabledReason: this.disabledReason, consent: this.consent?.state ?? null, version: this.config?.version ?? null };
  }

  page(props?: Record<string, unknown>): void {
    this.safe(() => {
      const url = location.href;
      if (props === undefined && this.lastPageUrl === url) return;
      this.lastPageUrl = url;
      this.capture("page_view", props ?? {}, undefined);
    });
  }

  event(name: string, props?: Record<string, unknown>): void {
    this.safe(() => {
      if (typeof name !== "string" || !NAME_RE.test(name)) return this.log("invalid event name", name);
      const p = { ...(props ?? {}) } as Record<string, unknown>;
      const commerce = extractCommerce(p);
      this.capture(name, p, commerce);
    });
  }

  identify(user: string | null | undefined, _traits?: Record<string, unknown>): void {
    this.safe(() => {
      this.userId = typeof user === "string" && user.length <= 128 && !/@/.test(user) ? user : null;
      if (typeof user === "string" && /@/.test(user)) this.log("identify ignored: raw e-mail addresses are never accepted as user ids");
    });
  }

  consentApi(state: unknown): void {
    this.safe(() => {
      if (!this.consent) {
        this.pendingConsent = state;
        return;
      }
      if (!this.consent.setFrom(state, "api")) this.log("invalid consent input", state);
    });
  }

  reset(): void {
    this.safe(() => {
      this.userId = null;
      this.ids?.clear();
      this.clicks.clear();
      this.transport?.clear();
    });
  }

  debug(enabled: boolean): void {
    this.debugEnabled = Boolean(enabled);
  }

  destroy(): void {
    for (const d of this.detachers) d();
    this.detachers = [];
    this.consent?.detach();
    this.transport?.stop();
    resetVendors();
  }

  private onConsentChange(next: ConsentState, prev: ConsentState): void {
    const b = this.config!.bundle;
    const w = window as unknown as Window & Record<string, unknown>;
    const lost = (p: Purpose) => has(prev, p) && !has(next, p);
    if (lost("analytics") || lost("marketing")) {
      this.ids?.clear();
      this.transport?.clear();
    }
    if (lost("marketing")) {
      this.clicks.clear();
      resetVendors();
    }
    if (b.consent.consent_mode.enabled) consentModeUpdate(w, next);
    for (const d of b.destinations) activateVendor(w, d, next);
    this.log("consent", next.granted);
  }

  private capture(name: string, props: Record<string, unknown>, commerce: Record<string, unknown> | undefined): void {
    if (!this.ready || !this.config || !this.consent || !this.ids || !this.transport) return;
    const b = this.config.bundle;
    const consent = this.consent.state;
    const analytics = has(consent, "analytics");
    const marketing = has(consent, "marketing");
    // strict opt-in: without analytics or marketing consent nothing is buffered, sent or replayed later
    if (!analytics && !marketing) {
      this.log("dropped (no consent)", name);
      return;
    }
    const enabled = b.events.find((e) => e.name === name);
    if (enabled && !enabled.enabled) return;
    const scrubbed = scrubUrl(location.href, b.settings.url_allow_params, b.settings.url_block_params);
    if (!scrubbed.url) return;
    const referrer = document.referrer ? scrubUrl(document.referrer).url || null : null;
    const event: OutgoingEvent = {
      id: ulid(),
      name,
      ts: Date.now(),
      seq: this.seq++,
      page: { url: scrubbed.url, referrer, title: document.title ? document.title.slice(0, 512) : null },
      ids: { anonymous_id: this.ids.anonymousId(analytics || marketing), session_id: this.ids.sessionId(analytics || marketing), user_id: analytics ? this.userId : null },
      consent,
      sdk: { name: "browser", version: this.o.version, config_version: this.config.version, schema_version: SCHEMA_VERSION },
      locale: navigator.language,
      tz: safeTz(),
      screen: { w: screen.width, h: screen.height },
    };
    if (Object.keys(props).length) event.props = sanitizeProps(props);
    if (commerce) event.commerce = commerce;
    const vendorIds: Record<string, string> = {};
    if (analytics) {
      const ga = readCookie("_ga");
      const m = ga ? ga.match(/^GA\d+\.\d+\.(\d+\.\d+)$/) : null;
      if (m?.[1]) vendorIds.ga_client_id = m[1];
    }
    if (marketing && b.consent.click_ids.capture) {
      const clickIds = this.clicks.merge(scrubbed.clickIds, (b.consent.click_ids.ttl_days || 90) * 86_400_000);
      if (Object.keys(clickIds).length) event.click_ids = clickIds;
      const fbp = readCookie("_fbp");
      const fbc = readCookie("_fbc");
      const ttp = readCookie("_ttp");
      const scid = readCookie("_scid");
      const uet = readCookie("_uetsid");
      const epik = readCookie("_epik");
      const rdt = readCookie("_rdt_uuid");
      const liFat = readCookie("li_fat_id");
      if (fbp) vendorIds.fbp = fbp;
      if (fbc) vendorIds.fbc = fbc;
      if (ttp) vendorIds.ttp = ttp;
      if (scid) vendorIds.scid = scid;
      if (uet) vendorIds.uetsid = uet;
      if (epik) vendorIds.epik = epik;
      if (rdt) vendorIds.rdt_uuid = rdt;
      if (liFat) vendorIds.li_fat_id = liFat;
    }
    if (Object.keys(vendorIds).length) event.vendor_ids = vendorIds;
    this.transport.enqueue(event);
    const w = window as unknown as Window & Record<string, unknown>;
    // purchases and refunds mirror with the order-derived id so browser, server and shop paths deduplicate at the vendor
    const mirrored: OutgoingEvent = { ...event, id: vendorMirrorId(name, (event.commerce as { order_id?: unknown } | undefined)?.order_id, event.id) };
    for (const d of b.destinations) {
      if (d.mode === "server") continue;
      if (activateVendor(w, d, consent)) mirrorEvent(w, d, mirrored, consent);
    }
    this.log("event", { name, id: event.id });
  }

  private installAutocapture(): void {
    const b = this.config!.bundle;
    if (b.settings.spa_tracking) {
      const w = window as unknown as Window & { history: History };
      const wrap = (fn: History["pushState"]) =>
        function (this: History, ...args: Parameters<History["pushState"]>) {
          const r = fn.apply(this, args);
          setTimeout(() => w.dispatchEvent(new Event("track:navigate")), 0);
          return r;
        };
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = wrap(origPush);
      history.replaceState = wrap(origReplace);
      const onNav = () => this.page();
      for (const ev of ["track:navigate", "popstate", "hashchange"]) {
        window.addEventListener(ev, onNav);
        this.detachers.push(() => window.removeEventListener(ev, onNav));
      }
      this.detachers.push(() => {
        history.pushState = origPush;
        history.replaceState = origReplace;
      });
    }
    for (const e of b.events) {
      if (!e.enabled) continue;
      if (e.trigger.type === "selector") {
        const t = e.trigger;
        const handler = (ev: Event) => {
          const target = ev.target as Element | null;
          const el = target?.closest?.(t.selector);
          if (!el) return;
          if (!pathMatches(null, location.pathname)) return;
          this.capture(e.name, elementProps(el), undefined);
        };
        document.addEventListener(t.dom_event, handler, true);
        this.detachers.push(() => document.removeEventListener(t.dom_event, handler, true));
      } else if (e.trigger.type === "data_layer") {
        this.watchDataLayer(e.name, e.trigger.key);
      } else if (e.trigger.type === "page" && e.name !== "page_view") {
        const pattern = e.trigger.path_pattern;
        const onNav = () => {
          if (pathMatches(pattern, location.pathname)) this.capture(e.name, {}, undefined);
        };
        onNav();
        window.addEventListener("track:navigate", onNav);
        this.detachers.push(() => window.removeEventListener("track:navigate", onNav));
      }
    }
  }

  /** Watches `window.dataLayer.push({ event: key, ecommerce: {...} })` (GA4 shape) without executing anything. */
  private watchDataLayer(name: string, key: string): void {
    const w = window as unknown as Window & { dataLayer?: unknown[] & { push: (...items: unknown[]) => number } };
    const dl = (w.dataLayer = w.dataLayer || ([] as never));
    const handle = (item: unknown) => {
      if (!item || typeof item !== "object") return;
      const o = item as Record<string, unknown>;
      if (o.event !== key) return;
      const ecommerce = (o.ecommerce ?? {}) as Record<string, unknown>;
      this.capture(name, {}, extractCommerce({ ...ecommerce }));
    };
    for (const item of Array.from(dl)) handle(item);
    const origPush = dl.push.bind(dl);
    dl.push = (...items: unknown[]) => {
      const r = origPush(...items);
      for (const it of items) handle(it);
      return r;
    };
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.log("error", e instanceof Error ? e.message : e);
    }
  }

  private log(msg: string, data?: unknown): void {
    if (this.debugEnabled && typeof console !== "undefined") console.warn(`[track.site] ${msg}`, data ?? "");
  }
}

function isLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.slice(-10) === ".localhost";
}

function safeTz(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const COMMERCE_KEYS = ["currency", "value", "order_id", "transaction_id", "items", "quantity", "tax", "shipping", "coupon", "discount"];

export function extractCommerce(props: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const k of COMMERCE_KEYS) {
    if (props[k] !== undefined) {
      out[k] = props[k];
      delete props[k];
    }
  }
  if (out.items && Array.isArray(out.items)) {
    out.items = (out.items as Array<Record<string, unknown>>).slice(0, 200).map((i) => ({
      item_id: String(i.item_id ?? i.id ?? i.sku ?? ""),
      item_name: i.item_name ?? i.name ?? null,
      price: typeof i.price === "number" ? i.price : i.price !== undefined ? Number(i.price) : null,
      quantity: typeof i.quantity === "number" ? i.quantity : i.quantity !== undefined ? Number(i.quantity) : null,
      currency: i.currency ?? null,
      brand: i.item_brand ?? i.brand ?? null,
      category: i.item_category ?? i.category ?? null,
      variant: i.item_variant ?? i.variant ?? null,
      sku: i.sku ?? null,
    }));
  }
  if (typeof out.value === "string") out.value = Number(out.value);
  if (typeof out.currency === "string") out.currency = out.currency.toUpperCase();
  return Object.keys(out).length ? out : undefined;
}

const PROP_BLOCK = /(password|passwd|pwd|secret|token|card|cvv|cvc|iban|ssn|email|e-mail|phone|tel)/i;

export function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n++ >= 50 || PROP_BLOCK.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 50).map((x) => (typeof x === "object" && x !== null ? sanitizeProps(x as Record<string, unknown>) : x));
    else if (typeof v === "object") out[k] = sanitizeProps(v as Record<string, unknown>);
  }
  return out;
}

export function elementProps(el: Element): Record<string, unknown> {
  const out: Record<string, unknown> = { tag: el.tagName.toLowerCase() };
  for (const a of Array.from(el.attributes)) {
    if (a.name.indexOf("data-track-") === 0) out[a.name.slice(11).replace(/-/g, "_")] = a.value.slice(0, 200);
  }
  const id = el.getAttribute("id");
  if (id) out.element_id = id.slice(0, 100);
  return out;
}

export type { BundleView };
