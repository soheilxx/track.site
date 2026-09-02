import type { ConsentState, DestinationView, OutgoingEvent } from "./types.ts";

/**
 * Loader templates for the second group of destinations. Each case follows the vendor's official
 * base snippet (no customer JavaScript), is activated only after the destination's purpose is granted
 * and mirrors events with the shared dedup id where the vendor supports it.
 */
type W = Window & Record<string, unknown>;
type Fn = (...a: unknown[]) => void;

function script(src: string, id?: string): void {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  if (id) s.id = id;
  document.head.appendChild(s);
}

function queueFn(w: W, name: string, exeKey: string, queueKey = "queue"): Fn {
  if (!w[name]) {
    const q: unknown[] = [];
    const fn = function (...args: unknown[]) {
      const self = fn as unknown as Record<string, unknown>;
      const exe = self[exeKey] as Fn | undefined;
      if (exe) exe(...args);
      else q.push(args);
    } as unknown as Record<string, unknown> & Fn;
    fn[queueKey] = q;
    w[name] = fn;
  }
  return w[name] as Fn;
}

const TABOOLA_EVENTS: Record<string, string> = { page_view: "page_view", view_content: "view_content", search: "search", add_to_cart: "add_to_cart", begin_checkout: "start_checkout", purchase: "purchase", generate_lead: "lead", sign_up: "complete_registration", subscribe: "subscribe" };
const OUTBRAIN_EVENTS: Record<string, string> = { page_view: "PAGE_VIEW", view_content: "View Content", search: "Search", add_to_cart: "Add To Cart", begin_checkout: "Initiate Checkout", purchase: "Purchase", generate_lead: "Lead", sign_up: "Complete Registration" };
const AMAZON_EVENTS: Record<string, string> = { page_view: "PageView", search: "Search", add_to_cart: "AddToShoppingCart", begin_checkout: "Checkout", purchase: "OffAmazonPurchases", generate_lead: "Lead", contact: "Contact", sign_up: "SignUp", subscribe: "Subscribe" };
const QUORA_EVENTS: Record<string, string> = { page_view: "ViewContent", view_content: "ViewContent", search: "Search", add_to_cart: "AddToCart", add_to_wishlist: "AddToWishlist", begin_checkout: "InitiateCheckout", add_payment_info: "AddPaymentInfo", purchase: "Purchase", generate_lead: "GenerateLead", sign_up: "CompleteRegistration" };
const CRITEO_EVENTS: Record<string, string> = { view_content: "viewItem", view_item_list: "viewList", add_to_cart: "addToCart", view_cart: "viewBasket", begin_checkout: "beginCheckout", purchase: "trackTransaction" };
const ADROLL_EVENTS: Record<string, string> = { page_view: "pageView", purchase: "purchase", add_to_cart: "addToCart", view_content: "productView", generate_lead: "lead", sign_up: "signup" };
const SPOTIFY_EVENTS: Record<string, string> = { page_view: "view", generate_lead: "lead", sign_up: "lead", subscribe: "lead", view_content: "product", add_to_cart: "addtocart", begin_checkout: "checkout", purchase: "purchase" };

export function activateExtra(w: W, d: DestinationView, consent: ConsentState): boolean {
  const b = d.browser!;
  switch (d.type) {
    case "x": {
      if (!b.pixel_id) return false;
      const twq = queueFn(w, "twq", "exe");
      (twq as unknown as Record<string, unknown>).version = "1.1";
      if (!w.__ts_twq_loaded) {
        script("https://static.ads-twitter.com/uwt.js");
        w.__ts_twq_loaded = true;
      }
      twq("config", b.pixel_id);
      return true;
    }
    case "taboola": {
      if (!b.account_id) return false;
      const tfa = ((w._tfa as unknown[]) = (w._tfa as unknown[]) || []);
      tfa.push({ notify: "event", name: "page_view", id: Number(b.account_id) });
      if (!document.getElementById("tb_tfa_script")) script(`https://cdn.taboola.com/libtrc/unip/${encodeURIComponent(b.account_id)}/tfa.js`, "tb_tfa_script");
      return true;
    }
    case "outbrain": {
      if (!b.marketer_id) return false;
      const api = queueFn(w, "obApi", "dispatch");
      const rec = api as unknown as Record<string, unknown>;
      rec.version = "1.1";
      rec.loaded = true;
      rec.marketerId = b.marketer_id;
      if (!w.__ts_ob_loaded) {
        script("https://amplify.outbrain.com/cp/obtp.js");
        w.__ts_ob_loaded = true;
      }
      api("track", "PAGE_VIEW");
      return true;
    }
    case "amazon": {
      if (!b.tag_id) return false;
      if (!w.amzn) {
        const q: unknown[] = [];
        const amzn = function (...args: unknown[]) {
          q.push(["track", args]);
        } as unknown as Record<string, unknown> & Fn;
        amzn._q = q;
        w.amzn = amzn;
        script("https://c.amazon-adsystem.com/aat/amzn.js");
      }
      const amzn = w.amzn as Fn;
      amzn("setRegion", b.region || "EU");
      amzn("addTag", b.tag_id);
      return true;
    }
    case "spotify": {
      if (!b.pixel_id) return false;
      if (!w.spdt) {
        const spdt = function (...args: unknown[]) {
          ((spdt as unknown as { q: unknown[] }).q = (spdt as unknown as { q?: unknown[] }).q || []).push(args);
        } as unknown as Record<string, unknown> & Fn;
        w.spdt = spdt;
        script("https://pixel.byspotify.com/ping.min.js");
      }
      (w.spdt as Fn)("conf", { key: b.pixel_id });
      return true;
    }
    case "quora": {
      if (!b.pixel_id) return false;
      const qp = queueFn(w, "qp", "qp");
      if (!w.__ts_qp_loaded) {
        script("https://a.quora.com/qevents.js");
        w.__ts_qp_loaded = true;
      }
      qp("init", b.pixel_id);
      return true;
    }
    case "yahoo": {
      if (!b.pixel_id || !b.project_id) return false;
      const dotq = ((w.dotq as unknown[]) = (w.dotq as unknown[]) || []);
      dotq.push({ projectId: b.project_id, properties: { pixelId: b.pixel_id, qstrings: { et: "custom", ea: "page_view" } } });
      if (!w.__ts_dot_loaded) {
        script("https://s.yimg.com/wi/ytc.js");
        w.__ts_dot_loaded = true;
      }
      return true;
    }
    case "tradedesk": {
      if (!b.advertiser_id || !b.pixel_id) return false;
      const init = () => {
        const Api = w.TTDUniversalPixelApi as (new () => { init: (adv: string, pixels: string[], url: string, vars?: Record<string, unknown>) => void }) | undefined;
        if (!Api) return;
        new Api().init(b.advertiser_id!, [b.pixel_id!], "https://insight.adsrvr.org/track/up");
      };
      if (!w.__ts_ttd_loaded) {
        const s = document.createElement("script");
        s.async = true;
        s.src = "https://js.adsrvr.org/up_loader.1.1.0.js";
        s.onload = init;
        document.head.appendChild(s);
        w.__ts_ttd_loaded = true;
      } else init();
      return true;
    }
    case "gmp": {
      if (!b.floodlight_configuration_id) return false;
      const dl = ((w.dataLayer as unknown[]) = (w.dataLayer as unknown[]) || []);
      if (!w.gtag) {
        w.gtag = function () {
          // eslint-disable-next-line prefer-rest-params
          dl.push(arguments);
        };
      }
      const gtag = w.gtag as Fn;
      const id = `DC-${b.floodlight_configuration_id}`;
      if (!w.__ts_gtag_loaded) {
        script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
        gtag("js", new Date());
        w.__ts_gtag_loaded = true;
      }
      gtag("config", id, { allow_enhanced_conversions: false });
      return true;
    }
    case "adroll": {
      if (!b.advertiser_id || !b.pixel_id) return false;
      w.adroll_adv_id = b.advertiser_id;
      w.adroll_pix_id = b.pixel_id;
      w.adroll_version = "2.0";
      if (!w.__adroll_loaded) {
        w.__adroll_loaded = true;
        const ar = ((w.adroll as unknown[] & Record<string, unknown>) = (w.adroll as unknown[] & Record<string, unknown>) || ([] as unknown as unknown[] & Record<string, unknown>));
        for (const f of ["setProperties", "identify", "track"]) if (!ar[f]) ar[f] = (...args: unknown[]) => ar.push([f, args]);
        script(`https://s.adroll.com/j/${encodeURIComponent(b.advertiser_id)}/roundtrip.js`);
      }
      return true;
    }
    case "criteo": {
      if (!b.account_id) return false;
      const q = ((w.criteo_q as unknown[]) = (w.criteo_q as unknown[]) || []);
      if (!w.__ts_criteo_loaded) {
        script(`https://dynamic.criteo.com/js/ld/ld.js?a=${encodeURIComponent(b.account_id)}`);
        w.__ts_criteo_loaded = true;
      }
      q.push({ event: "setAccount", account: Number(b.account_id) }, { event: "setSiteType", type: /Mobi/i.test(navigator.userAgent) ? "m" : "d" });
      return true;
    }
    default:
      return false;
  }
  void consent;
}

export function mirrorExtra(w: W, d: DestinationView, e: OutgoingEvent, vendorEvent: string | undefined): void {
  const b = d.browser ?? {};
  const commerce = (e.commerce ?? {}) as Record<string, unknown>;
  const items = Array.isArray(commerce.items) ? (commerce.items as Array<Record<string, unknown>>) : [];
  const value = commerce.value as number | undefined;
  const currency = commerce.currency as string | undefined;
  const orderId = commerce.order_id as string | undefined;
  switch (d.type) {
    case "x": {
      if (!vendorEvent) break;
      const params: Record<string, unknown> = { conversion_id: e.id };
      if (value !== undefined) params.value = value;
      if (currency) params.currency = currency;
      if (items.length) params.contents = items.map((i) => ({ content_id: i.item_id, content_name: i.item_name, content_price: i.price, num_items: i.quantity ?? 1 }));
      (w.twq as Fn)("event", vendorEvent, params);
      break;
    }
    case "taboola": {
      const name = vendorEvent || TABOOLA_EVENTS[e.name];
      if (!name || name === "page_view") break;
      const ev: Record<string, unknown> = { notify: "event", name, id: Number(b.account_id) };
      if (value !== undefined) ev.revenue = value;
      if (currency) ev.currency = currency;
      if (orderId) ev.orderid = orderId;
      (w._tfa as unknown[]).push(ev);
      break;
    }
    case "outbrain": {
      const name = vendorEvent || OUTBRAIN_EVENTS[e.name];
      if (!name || name === "PAGE_VIEW") break;
      const params: Record<string, unknown> = {};
      if (value !== undefined) params.orderValue = value;
      if (currency) params.currency = currency;
      if (orderId) params.orderId = orderId;
      (w.obApi as Fn)("track", name, params);
      break;
    }
    case "amazon": {
      const name = vendorEvent || AMAZON_EVENTS[e.name];
      if (!name) break;
      const params: Record<string, unknown> = {};
      if (value !== undefined) params.value = value;
      if (currency) params.currencyCode = currency;
      if (items.length) params.unitsSold = items.reduce((n, i) => n + Number(i.quantity ?? 1), 0);
      (w.amzn as Fn)("trackEvent", name, params);
      break;
    }
    case "spotify": {
      const name = vendorEvent || SPOTIFY_EVENTS[e.name];
      if (!name) break;
      const params: Record<string, unknown> = {};
      if (value !== undefined) params.value = value;
      if (currency) params.currency = currency;
      if (orderId) params.order_id = orderId;
      if (name === "lead") params.type = e.name;
      if (items.length && (name === "purchase" || name === "checkout")) params.line_items = items.map((i) => ({ product_id: i.item_id, product_name: i.item_name, price: i.price, quantity: i.quantity ?? 1 }));
      if (name === "view") (w.spdt as Fn)("view");
      else (w.spdt as Fn)(name, params);
      break;
    }
    case "quora": {
      const name = vendorEvent || QUORA_EVENTS[e.name];
      if (!name) break;
      const params: Record<string, unknown> = {};
      if (value !== undefined) params.value = value;
      if (currency) params.currency = currency;
      (w.qp as Fn)("track", name, params);
      break;
    }
    case "yahoo": {
      const q: Record<string, unknown> = { et: "custom", ea: vendorEvent || e.name };
      if (value !== undefined) q.gv = value;
      if (currency) q.gc = currency;
      (w.dotq as unknown[]).push({ projectId: b.project_id, properties: { pixelId: b.pixel_id, qstrings: q } });
      break;
    }
    case "tradedesk": {
      if (e.name !== "purchase" || !b.advertiser_id || !b.pixel_id) break;
      const Api = w.TTDUniversalPixelApi as (new () => { init: (adv: string, pixels: string[], url: string, vars?: Record<string, unknown>) => void }) | undefined;
      if (!Api) break;
      const vars: Record<string, unknown> = { td1: e.id };
      if (value !== undefined) vars.v = value;
      if (currency) vars.vf = currency;
      if (orderId) vars.orderid = orderId;
      new Api().init(b.advertiser_id, [b.pixel_id], "https://insight.adsrvr.org/track/up", vars);
      break;
    }
    case "gmp": {
      if (!vendorEvent || !vendorEvent.includes("/")) break;
      const params: Record<string, unknown> = { allow_custom_scripts: false, send_to: `DC-${b.floodlight_configuration_id}/${vendorEvent}` };
      if (value !== undefined) params.value = value;
      if (orderId) params.transaction_id = orderId;
      params.u1 = e.id;
      (w.gtag as Fn)("event", e.name === "purchase" ? "purchase" : "conversion", params);
      break;
    }
    case "adroll": {
      const name = vendorEvent || ADROLL_EVENTS[e.name];
      if (!name) break;
      const track = (w.adroll as Record<string, Fn>).track;
      if (!track) break;
      const params: Record<string, unknown> = {};
      if (value !== undefined) params.conversion_value = value;
      if (currency) params.currency = currency;
      if (orderId) params.order_id = orderId;
      if (items.length) params.products = items.map((i) => ({ product_id: i.item_id, quantity: i.quantity ?? 1, price: i.price }));
      track(name, params);
      break;
    }
    case "criteo": {
      const name = vendorEvent || CRITEO_EVENTS[e.name];
      if (!name) break;
      const ev: Record<string, unknown> = { event: name };
      if (name === "viewItem") ev.item = items[0]?.item_id;
      else if (name === "viewList") ev.item = items.map((i) => i.item_id);
      else if (name === "trackTransaction") {
        ev.id = orderId ?? e.id;
        ev.item = items.map((i) => ({ id: i.item_id, price: i.price, quantity: i.quantity ?? 1 }));
        if (currency) ev.currency = currency;
      } else ev.item = items.map((i) => ({ id: i.item_id, price: i.price, quantity: i.quantity ?? 1 }));
      (w.criteo_q as unknown[]).push(ev);
      break;
    }
    default:
      break;
  }
}
