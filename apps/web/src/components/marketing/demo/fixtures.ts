import type { DemoConsent, DemoCurrency, DemoDedup, DemoEventName, DemoOrigin, DemoPlatformId } from "./model";

/**
 * DEMO DATA — deterministic fixtures for the interactive hero demo. Nothing here comes from a real
 * site, customer or destination; the stream is a fixed script that replays in the same order for
 * every visitor. No network calls, no mutations, no random values (supplement §4).
 */

/** The fictional site shown in the demo (reserved `.example` TLD, RFC 2606). */
export const DEMO_SITE = "demo-shop.example";
/** Config version "live" at the start; the guided setup step publishes the next one. */
export const DEMO_CONFIG_VERSION = 14;
/** Auto-advance interval of the stream in ms (docs/12 §2: data-flow transitions 350–500 ms; one event every ~2.4 s reads calmly). */
export const DEMO_STREAM_INTERVAL_MS = 2400;
/** Clock-face base of the event timestamps ("12:04:05" + seq × 2 s). Purely presentational. */
export const DEMO_BASE_SECONDS = 12 * 3600 + 4 * 60 + 5;
export const DEMO_STEP_SECONDS = 2;
/** How many script events are visible before the visitor (or the player) advances the stream. */
export const DEMO_INITIAL_REVEAL = 7;
/** Upper bound of retained stream rows (older rows fall off; the totals keep counting). */
export const DEMO_MAX_ROWS = 24;

export interface DemoScriptEvent {
  key: string;
  name: DemoEventName;
  origin: DemoOrigin;
  /** Shared browser/server event id; the dedup marker is derived from it. */
  eventId: string;
  dedup: DemoDedup;
  consent: DemoConsent;
  value?: number;
  /** `null` reproduces the real-world gap the AI recommendation is grounded in: a Purchase without currency. */
  currency?: DemoCurrency | null;
  orderId?: string;
  /** Destinations the event is routed to when consent and parameters allow it. */
  routes: readonly DemoPlatformId[];
  /** Platform whose click id was observed on the landing URL of this session (attribution view). */
  clickId?: DemoPlatformId;
}

/** The scripted stream. It loops; every loop replays the same sequence. */
export const DEMO_SCRIPT: readonly DemoScriptEvent[] = [
  { key: "pv-1", name: "PageView", origin: "browser", eventId: "a1f0", dedup: "unique", consent: "granted", routes: ["google", "meta"], clickId: "google" },
  { key: "vc-1", name: "ViewContent", origin: "browser", eventId: "a1f1", dedup: "unique", consent: "granted", routes: ["meta", "tiktok"] },
  { key: "atc-1", name: "AddToCart", origin: "browser", eventId: "a1f2", dedup: "unique", consent: "granted", value: 129, currency: "EUR", routes: ["meta", "tiktok", "google"] },
  { key: "pv-2", name: "PageView", origin: "browser", eventId: "b2c0", dedup: "unique", consent: "denied", routes: ["google", "meta"] },
  { key: "bc-1", name: "BeginCheckout", origin: "browser", eventId: "a1f3", dedup: "unique", consent: "granted", value: 129, currency: "EUR", routes: ["meta", "google"] },
  { key: "pu-1s", name: "Purchase", origin: "server", eventId: "a1f4", dedup: "paired", consent: "granted", value: 129, currency: null, orderId: "10432", routes: ["meta", "google", "tiktok"] },
  { key: "pu-1b", name: "Purchase", origin: "browser", eventId: "a1f4", dedup: "duplicate", consent: "granted", value: 129, currency: null, orderId: "10432", routes: ["meta", "google", "tiktok"] },
  { key: "ld-1s", name: "Lead", origin: "server", eventId: "c3d0", dedup: "paired", consent: "granted", routes: ["linkedin", "google"], clickId: "linkedin" },
  { key: "ld-1b", name: "Lead", origin: "browser", eventId: "c3d0", dedup: "duplicate", consent: "granted", routes: ["linkedin", "google"] },
  { key: "vc-2", name: "ViewContent", origin: "browser", eventId: "d4e0", dedup: "unique", consent: "pending", routes: ["meta", "tiktok"] },
  { key: "atc-2", name: "AddToCart", origin: "browser", eventId: "e5a0", dedup: "unique", consent: "granted", value: 58, currency: "EUR", routes: ["meta", "tiktok", "reddit"], clickId: "reddit" },
  { key: "pu-2s", name: "Purchase", origin: "server", eventId: "e5a1", dedup: "paired", consent: "granted", value: 58, currency: "EUR", orderId: "10433", routes: ["meta", "google", "tiktok", "reddit"] },
  { key: "pu-2b", name: "Purchase", origin: "browser", eventId: "e5a1", dedup: "duplicate", consent: "granted", value: 58, currency: null, orderId: "10433", routes: ["meta", "google", "tiktok", "reddit"] },
  { key: "ld-2", name: "Lead", origin: "browser", eventId: "f6b0", dedup: "unique", consent: "granted", routes: ["linkedin", "reddit"], clickId: "linkedin" },
];

export interface DemoPlatformFixture {
  id: DemoPlatformId;
  /** Vendor product name (a fact, identical in every language). */
  name: string;
  /** Click-id parameter the platform appends to landing URLs. */
  clickParam: string;
  /** Field that carries the shared id for browser/server deduplication at the destination. */
  dedupKey: string;
  browser: boolean;
  server: boolean;
}

export const DEMO_PLATFORMS_FIXTURE: readonly DemoPlatformFixture[] = [
  { id: "meta", name: "Meta Ads", clickParam: "fbclid", dedupKey: "event_id", browser: true, server: true },
  { id: "google", name: "Google Ads", clickParam: "gclid", dedupKey: "order_id", browser: true, server: true },
  { id: "tiktok", name: "TikTok Ads", clickParam: "ttclid", dedupKey: "event_id", browser: true, server: true },
  { id: "linkedin", name: "LinkedIn Ads", clickParam: "li_fat_id", dedupKey: "eventId", browser: true, server: true },
  { id: "reddit", name: "Reddit Ads", clickParam: "rdt_cid", dedupKey: "conversion_id", browser: true, server: true },
];

export function platformFixture(id: DemoPlatformId): DemoPlatformFixture {
  const found = DEMO_PLATFORMS_FIXTURE.find((p) => p.id === id);
  if (!found) throw new Error(`unknown demo platform ${id}`);
  return found;
}

/** Clock-face label of the n-th revealed event (deterministic, never the wall clock). */
export function demoTimeLabel(seq: number): string {
  const total = (DEMO_BASE_SECONDS + seq * DEMO_STEP_SECONDS) % 86_400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
