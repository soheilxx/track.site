import { Tracker } from "./tracker.ts";
import type { TrackerOptions } from "./types.ts";

declare const __TRACKSITE_VERSION__: string;
declare const __TRACKSITE_PUBLIC_KEYS__: string;
declare const __TRACKSITE_INGEST__: string;
declare const __TRACKSITE_CDN__: string;

export interface TrackApi {
  page(props?: Record<string, unknown>): void;
  event(name: string, props?: Record<string, unknown>): void;
  identify(user: string | null, traits?: Record<string, unknown>): void;
  consent(state: unknown): void;
  reset(): void;
  debug(enabled: boolean): void;
  /** commands queued before the script loaded: [method, ...args] */
  q?: unknown[][];
  ready: boolean;
  state(): unknown;
}

function define(name: string, fallback: string): string {
  try {
    return typeof (globalThis as Record<string, unknown>)[name] === "string" ? String((globalThis as Record<string, unknown>)[name]) : fallback;
  } catch {
    return fallback;
  }
}

/** Boot from the `<script async src=".../tracker.js" data-site-id="A7K2Q9">` tag. */
export function boot(doc: Document = document, win: Window = window): TrackApi | null {
  try {
    const w = win as Window & { track?: TrackApi };
    const script = (doc.currentScript as HTMLScriptElement | null) || Array.from(doc.querySelectorAll<HTMLScriptElement>("script[data-site-id]")).pop() || null;
    const siteId = (script?.getAttribute("data-site-id") || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(siteId)) return null;
    const version = typeof __TRACKSITE_VERSION__ === "string" ? __TRACKSITE_VERSION__ : "dev";
    const keysRaw = typeof __TRACKSITE_PUBLIC_KEYS__ === "string" ? __TRACKSITE_PUBLIC_KEYS__ : "{}";
    const options: TrackerOptions = {
      siteId,
      ingestUrl: script?.getAttribute("data-ingest") || (typeof __TRACKSITE_INGEST__ === "string" ? __TRACKSITE_INGEST__ : define("__TRACKSITE_INGEST__", "https://ingest.track.site")),
      cdnUrl: script?.getAttribute("data-cdn") || (typeof __TRACKSITE_CDN__ === "string" ? __TRACKSITE_CDN__ : define("__TRACKSITE_CDN__", "https://cdn.track.site")),
      publicKeys: JSON.parse(keysRaw) as Record<string, string>,
      version,
      debug: script?.getAttribute("data-debug") === "true",
    };
    const tracker = new Tracker(options);
    const queued = w.track?.q ?? [];
    const api: TrackApi = {
      page: (p) => tracker.page(p),
      event: (n, p) => tracker.event(n, p),
      identify: (u, t) => tracker.identify(u, t),
      consent: (s) => tracker.consentApi(s),
      reset: () => tracker.reset(),
      debug: (e) => tracker.debug(e),
      ready: false,
      state: () => tracker.state,
    };
    w.track = api;
    for (const cmd of queued) {
      const [method, ...args] = cmd;
      const fn = (api as unknown as Record<string, (...a: unknown[]) => void>)[String(method)];
      if (typeof fn === "function") {
        try {
          fn(...args);
        } catch {
          /* isolated */
        }
      }
    }
    void tracker.init().then(() => {
      api.ready = true;
    });
    return api;
  } catch {
    return null;
  }
}

export { Tracker } from "./tracker.ts";
export * from "./types.ts";

if (typeof document !== "undefined" && typeof window !== "undefined" && !(globalThis as { __TRACKSITE_NO_AUTOBOOT__?: boolean }).__TRACKSITE_NO_AUTOBOOT__) {
  boot();
}
