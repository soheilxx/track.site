import { consentModeFlags, has } from "./consent.ts";
import type { ConsentState, DestinationView, OutgoingEvent } from "./types.ts";
import { activateExtra, mirrorExtra } from "./vendors-extra.ts";

/**
 * Built-in browser tag templates. No customer JavaScript is ever executed: each template is a
 * fixed loader for the vendor's official script, activated only after the destination's purpose is
 * granted, and mirrors events with the shared dedup id so server + browser events deduplicate.
 */
type W = Window & Record<string, unknown>;

const loaded = new Set<string>();

function script(src: string): void {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

const META_EVENTS: Record<string, string> = { page_view: "PageView", view_content: "ViewContent", search: "Search", add_to_cart: "AddToCart", add_to_wishlist: "AddToWishlist", begin_checkout: "InitiateCheckout", add_payment_info: "AddPaymentInfo", purchase: "Purchase", generate_lead: "Lead", sign_up: "CompleteRegistration", subscribe: "Subscribe" };
const TIKTOK_EVENTS: Record<string, string> = { view_content: "ViewContent", search: "Search", add_to_cart: "AddToCart", add_to_wishlist: "AddToWishlist", begin_checkout: "InitiateCheckout", add_payment_info: "AddPaymentInfo", purchase: "CompletePayment", generate_lead: "SubmitForm", sign_up: "CompleteRegistration", subscribe: "Subscribe" };
const PINTEREST_EVENTS: Record<string, string> = { page_view: "pagevisit", view_content: "pagevisit", view_item_list: "viewcategory", search: "search", add_to_cart: "addtocart", purchase: "checkout", generate_lead: "lead", sign_up: "signup" };
const SNAP_EVENTS: Record<string, string> = { page_view: "PAGE_VIEW", view_content: "VIEW_CONTENT", view_item_list: "LIST_VIEW", search: "SEARCH", add_to_cart: "ADD_CART", add_to_wishlist: "ADD_TO_WISHLIST", begin_checkout: "START_CHECKOUT", add_payment_info: "ADD_BILLING", purchase: "PURCHASE", sign_up: "SIGN_UP", login: "LOGIN", subscribe: "SUBSCRIBE", start_trial: "START_TRIAL", book_appointment: "RESERVE" };
const REDDIT_EVENTS: Record<string, string> = { page_view: "PageVisit", view_content: "ViewContent", search: "Search", add_to_cart: "AddToCart", add_to_wishlist: "AddToWishlist", purchase: "Purchase", generate_lead: "Lead", sign_up: "SignUp" };

export function consentModeDefault(w: W, state: ConsentState): void {
  const dl = ((w.dataLayer as unknown[]) = (w.dataLayer as unknown[]) || []);
  const gtag = (w.gtag as ((...a: unknown[]) => void) | undefined) ??
    function () {
      // eslint-disable-next-line prefer-rest-params
      dl.push(arguments);
    };
  w.gtag = gtag;
  gtag("consent", "default", { ...consentModeFlags(state), wait_for_update: 500 });
}

export function consentModeUpdate(w: W, state: ConsentState): void {
  const gtag = w.gtag as ((...a: unknown[]) => void) | undefined;
  if (gtag) gtag("consent", "update", consentModeFlags(state));
}

export function activateVendor(w: W, d: DestinationView, consent: ConsentState): boolean {
  if (!d.browser || !has(consent, d.purpose)) return false;
  if (loaded.has(d.id)) return true;
  try {
    switch (d.type) {
      case "meta": {
        if (!d.browser.pixel_id) return false;
        if (!w.fbq) {
          const q: unknown[] = [];
          const fbq = function (...args: unknown[]) {
            const f = fbq as unknown as { callMethod?: (...a: unknown[]) => void };
            if (f.callMethod) f.callMethod(...args);
            else q.push(args);
          } as unknown as Record<string, unknown> & ((...a: unknown[]) => void);
          fbq.queue = q;
          fbq.loaded = true;
          fbq.version = "2.0";
          w.fbq = fbq;
          w._fbq = fbq;
          script("https://connect.facebook.net/en_US/fbevents.js");
        }
        (w.fbq as (...a: unknown[]) => void)("init", d.browser.pixel_id);
        break;
      }
      case "tiktok": {
        if (!d.browser.pixel_id) return false;
        if (!w.ttq) {
          const ttq: Record<string, unknown> & unknown[] = [] as never;
          const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
          ttq.methods = methods;
          ttq.setAndDefer = (t: Record<string, unknown>, e: string) => {
            t[e] = (...a: unknown[]) => (t.push as (x: unknown) => void)([e, ...a]);
          };
          for (const m of methods) (ttq.setAndDefer as (t: unknown, e: string) => void)(ttq, m);
          ttq.load = (id: string) => {
            ttq._i = { [id]: [] };
            ttq._t = { [id]: Date.now() };
            script(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`);
          };
          w.ttq = ttq;
        }
        const ttq = w.ttq as { load: (id: string) => void; page: () => void };
        ttq.load(d.browser.pixel_id);
        break;
      }
      case "reddit": {
        if (!d.browser.pixel_id) return false;
        if (!w.rdt) {
          const rdt = function (...args: unknown[]) {
            const r = rdt as unknown as { sendEvent?: (...a: unknown[]) => void; callQueue: unknown[] };
            if (r.sendEvent) r.sendEvent(...args);
            else r.callQueue.push(args);
          } as unknown as Record<string, unknown> & ((...a: unknown[]) => void);
          rdt.callQueue = [];
          w.rdt = rdt;
          script("https://www.redditstatic.com/ads/pixel.js");
        }
        (w.rdt as (...a: unknown[]) => void)("init", d.browser.pixel_id);
        break;
      }
      case "linkedin": {
        if (!d.browser.partner_id) return false;
        w._linkedin_partner_id = d.browser.partner_id;
        const ids = ((w._linkedin_data_partner_ids as string[]) = (w._linkedin_data_partner_ids as string[]) || []);
        ids.push(d.browser.partner_id);
        if (!w.lintrk) {
          const lintrk = function (a: unknown, b: unknown) {
            (lintrk as unknown as { q: unknown[] }).q.push([a, b]);
          } as unknown as Record<string, unknown> & ((a: unknown, b: unknown) => void);
          lintrk.q = [];
          w.lintrk = lintrk;
          script("https://snap.licdn.com/li.lms-analytics/insight.min.js");
        }
        break;
      }
      case "ga4":
      case "google_ads": {
        const id = d.type === "ga4" ? d.browser.measurement_id : d.browser.conversion_id;
        if (!id) return false;
        const dl = ((w.dataLayer as unknown[]) = (w.dataLayer as unknown[]) || []);
        if (!w.gtag) {
          w.gtag = function () {
            // eslint-disable-next-line prefer-rest-params
            dl.push(arguments);
          };
        }
        const gtag = w.gtag as (...a: unknown[]) => void;
        if (!loaded.has("gtag.js")) {
          script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
          gtag("js", new Date());
          loaded.add("gtag.js");
        }
        gtag("config", id, { send_page_view: false, anonymize_ip: true });
        break;
      }
      case "microsoft": {
        const tag = d.browser.uet_tag_id;
        if (!tag) return false;
        const q = ((w.uetq as unknown[]) = (w.uetq as unknown[]) || []);
        q.push("consent", "default", { ad_storage: has(consent, "marketing") ? "granted" : "denied" });
        if (!loaded.has("bat.js")) {
          const s = document.createElement("script");
          s.async = true;
          s.src = "https://bat.bing.com/bat.js";
          s.onload = () => {
            const UET = w.UET as (new (o: Record<string, unknown>) => { push: (...a: unknown[]) => void }) | undefined;
            if (!UET) return;
            w.uetq = new UET({ ti: tag, enableAutoSpaTracking: false, q: w.uetq });
            (w.uetq as { push: (...a: unknown[]) => void }).push("pageLoad");
          };
          document.head.appendChild(s);
          loaded.add("bat.js");
        }
        break;
      }
      case "pinterest": {
        if (!d.browser.tag_id) return false;
        if (!w.pintrk) {
          const pintrk = function (...args: unknown[]) {
            (pintrk as unknown as { queue: unknown[] }).queue.push(args);
          } as unknown as Record<string, unknown> & ((...a: unknown[]) => void);
          pintrk.queue = [];
          pintrk.version = "3.0";
          w.pintrk = pintrk;
          script("https://s.pinimg.com/ct/core.js");
        }
        (w.pintrk as (...a: unknown[]) => void)("load", d.browser.tag_id);
        break;
      }
      case "snapchat": {
        if (!d.browser.pixel_id) return false;
        if (!w.snaptr) {
          const snaptr = function (...args: unknown[]) {
            const s = snaptr as unknown as { handleRequest?: (...a: unknown[]) => void; queue: unknown[] };
            if (s.handleRequest) s.handleRequest(...args);
            else s.queue.push(args);
          } as unknown as Record<string, unknown> & ((...a: unknown[]) => void);
          snaptr.queue = [];
          w.snaptr = snaptr;
          script("https://sc-static.net/scevent.min.js");
        }
        (w.snaptr as (...a: unknown[]) => void)("init", d.browser.pixel_id, {});
        break;
      }
      default:
        if (!activateExtra(w, d, consent)) return false;
    }
    loaded.add(d.id);
    return true;
  } catch {
    return false;
  }
}

/** Mirror a canonical event to an activated browser tag using the shared dedup id. */
export function mirrorEvent(w: W, d: DestinationView, e: OutgoingEvent, consent: ConsentState): void {
  if (!loaded.has(d.id) || !has(consent, d.purpose)) return;
  const mapping = d.mappings.find((m) => m.event === e.name);
  const commerce = (e.commerce ?? {}) as Record<string, unknown>;
  const items = Array.isArray(commerce.items) ? (commerce.items as Array<Record<string, unknown>>) : [];
  try {
    switch (d.type) {
      case "meta": {
        const name = mapping?.vendor_event || META_EVENTS[e.name];
        const fbq = w.fbq as (...a: unknown[]) => void;
        const params: Record<string, unknown> = {};
        if (commerce.value !== undefined) params.value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (items.length) {
          params.content_ids = items.map((i) => i.item_id);
          params.content_type = "product";
          params.contents = items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1 }));
        }
        if (name) fbq(META_EVENTS[e.name] === name ? "track" : "trackCustom", name, params, { eventID: e.id });
        break;
      }
      case "tiktok": {
        const ttq = w.ttq as { page: () => void; track: (n: string, p: Record<string, unknown>, o: Record<string, unknown>) => void };
        if (e.name === "page_view") {
          ttq.page();
          break;
        }
        const name = mapping?.vendor_event || TIKTOK_EVENTS[e.name];
        if (!name) break;
        const params: Record<string, unknown> = {};
        if (commerce.value !== undefined) params.value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (items.length) params.contents = items.map((i) => ({ content_id: i.item_id, content_type: "product", quantity: i.quantity ?? 1, price: i.price }));
        ttq.track(name, params, { event_id: e.id });
        break;
      }
      case "reddit": {
        const name = mapping?.vendor_event || REDDIT_EVENTS[e.name];
        if (!name) break;
        const rdt = w.rdt as (...a: unknown[]) => void;
        const params: Record<string, unknown> = { conversionId: e.id };
        if (commerce.value !== undefined) params.value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (items.length) params.products = items.map((i) => ({ id: i.item_id, name: i.item_name }));
        rdt("track", name, params);
        break;
      }
      case "linkedin": {
        const lintrk = w.lintrk as (a: string, b: Record<string, unknown>) => void;
        if (e.name !== "page_view" && mapping?.vendor_event) lintrk("track", { conversion_id: mapping.vendor_event, event_id: e.id });
        break;
      }
      case "ga4": {
        const gtag = w.gtag as (...a: unknown[]) => void;
        const params: Record<string, unknown> = { send_to: d.browser?.measurement_id };
        if (e.name === "page_view") {
          gtag("event", "page_view", { ...params, page_location: e.page.url, page_title: e.page.title ?? undefined });
          break;
        }
        if (commerce.value !== undefined) params.value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (commerce.order_id) params.transaction_id = commerce.order_id;
        if (items.length) params.items = items.map((i) => ({ item_id: i.item_id, item_name: i.item_name, price: i.price, quantity: i.quantity }));
        gtag("event", mapping?.vendor_event || e.name, params);
        break;
      }
      case "google_ads": {
        if (!mapping?.vendor_event) break;
        const gtag = w.gtag as (...a: unknown[]) => void;
        const params: Record<string, unknown> = { send_to: `${d.browser?.conversion_id}/${mapping.vendor_event}` };
        if (commerce.value !== undefined) params.value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (commerce.order_id) params.transaction_id = commerce.order_id;
        gtag("event", "conversion", params);
        break;
      }
      case "microsoft": {
        const q = w.uetq as { push: (...a: unknown[]) => void } | undefined;
        if (!q) break;
        if (e.name === "page_view") {
          q.push("event", "page_view", { page_path: e.page.url, event_id: e.id });
          break;
        }
        const params: Record<string, unknown> = { event_id: e.id, event_category: "track.site" };
        if (commerce.value !== undefined) params.revenue_value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (commerce.order_id) params.transaction_id = commerce.order_id;
        if (items.length) params.items = items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1, price: i.price }));
        q.push("event", mapping?.vendor_event || e.name, params);
        break;
      }
      case "pinterest": {
        const pintrk = w.pintrk as (...a: unknown[]) => void;
        const name = mapping?.vendor_event || PINTEREST_EVENTS[e.name];
        if (!name) break;
        const params: Record<string, unknown> = { event_id: e.id };
        if (commerce.value !== undefined) params.value = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (commerce.order_id) params.order_id = commerce.order_id;
        if (items.length) params.line_items = items.map((i) => ({ product_id: i.item_id, product_name: i.item_name, product_price: i.price, product_quantity: i.quantity ?? 1 }));
        pintrk("track", name, params);
        break;
      }
      case "snapchat": {
        const snaptr = w.snaptr as (...a: unknown[]) => void;
        const name = mapping?.vendor_event || SNAP_EVENTS[e.name];
        if (!name) break;
        const params: Record<string, unknown> = { client_dedup_id: e.id };
        if (commerce.value !== undefined) params.price = commerce.value;
        if (commerce.currency) params.currency = commerce.currency;
        if (commerce.order_id) params.transaction_id = commerce.order_id;
        if (items.length) {
          params.item_ids = items.map((i) => i.item_id);
          params.number_items = items.reduce((n, i) => n + Number(i.quantity ?? 1), 0);
        }
        snaptr("track", name, params);
        break;
      }
      default:
        mirrorExtra(w, d, e, mapping?.vendor_event);
        break;
    }
  } catch {
    /* vendor script failure must never affect the host page */
  }
}

export function resetVendors(): void {
  loaded.clear();
}
