export type Purpose = "necessary" | "analytics" | "marketing" | "personalization";

export interface ConsentState {
  granted: Purpose[];
  source: string;
  policy_version: string | null;
  ts: number | null;
  region: string | null;
  gpc: boolean | null;
}

export type DestinationType =
  | "webhook"
  | "meta"
  | "google_ads"
  | "ga4"
  | "tiktok"
  | "microsoft"
  | "linkedin"
  | "reddit"
  | "pinterest"
  | "snapchat"
  | "x"
  | "taboola"
  | "outbrain"
  | "amazon"
  | "spotify"
  | "quora"
  | "yahoo"
  | "tradedesk"
  | "gmp"
  | "adroll"
  | "criteo"
  | "affiliate";

export interface DestinationView {
  id: string;
  type: DestinationType;
  name: string;
  enabled: boolean;
  purpose: Purpose;
  mode: "browser" | "server" | "hybrid";
  /** public identifiers (pixel_id, measurement_id, tag_id, ...) */
  browser: Record<string, string | null> | null;
  test_mode: boolean;
  mappings: Array<{ event: string; vendor_event: string; enabled: boolean }>;
}

export interface EventView {
  name: string;
  enabled: boolean;
  critical: boolean;
  trigger:
    | { type: "page"; path_pattern: string | null }
    | { type: "selector"; selector: string; dom_event: "click" | "submit" }
    | { type: "data_layer"; key: string }
    | { type: "api" }
    | { type: "shop_integration"; platform: string };
}

export interface BundleView {
  schema_version: string;
  site: { tracking_id: string; environment: string };
  version: number;
  settings: {
    auto_page_view: boolean;
    spa_tracking: boolean;
    cookie_domain: string | null;
    session_timeout_min: number;
    kill_switch: boolean;
    allowed_hosts: string[];
    url_allow_params: string[];
    url_block_params: string[];
    batch: { max_events: number; flush_ms: number };
    debug: boolean;
  };
  consent: {
    policy_version: string;
    purposes: Purpose[];
    default_region_mode: string;
    cmp: { provider: string; settings: Record<string, string | number | boolean> };
    consent_mode: { enabled: boolean; mode: "basic" | "advanced" };
    click_ids: { capture: boolean; ttl_days: number };
    respect_gpc: boolean;
  };
  events: EventView[];
  destinations: DestinationView[];
}

export interface OutgoingEvent {
  id: string;
  name: string;
  ts: number;
  seq: number;
  props?: Record<string, unknown>;
  commerce?: Record<string, unknown>;
  page: { url: string; referrer: string | null; title: string | null };
  ids: { anonymous_id: string | null; session_id: string | null; user_id: string | null };
  consent: ConsentState;
  sdk: { name: "browser"; version: string; config_version: number | null; schema_version: string };
  click_ids?: Record<string, string>;
  vendor_ids?: Record<string, string>;
  locale?: string;
  tz?: string;
  screen?: { w: number; h: number };
}

export interface TrackerOptions {
  siteId: string;
  ingestUrl: string;
  cdnUrl: string;
  publicKeys: Record<string, string>;
  version: string;
  debug?: boolean;
}
