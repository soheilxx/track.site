import type { OutgoingEvent } from "./types.ts";

/**
 * Batching transport: sendBeacon (text/plain) when the page hides, fetch keepalive otherwise.
 * Only consented events ever enter the buffer; a bounded retry buffer covers 5xx/network errors.
 */
export interface TransportOptions {
  url: string;
  siteId: string;
  maxEvents: number;
  flushMs: number;
  onDebug?: (msg: string, data?: unknown) => void;
  fetchImpl?: typeof fetch;
}

export class Transport {
  private buffer: OutgoingEvent[] = [];
  private retry: Array<{ events: OutgoingEvent[]; attempts: number; at: number }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly o: TransportOptions) {
    const flushHidden = () => {
      if (document.visibilityState === "hidden") this.flush(true);
    };
    document.addEventListener("visibilitychange", flushHidden);
    window.addEventListener("pagehide", () => this.flush(true));
  }

  enqueue(e: OutgoingEvent): void {
    if (this.stopped) return;
    this.buffer.push(e);
    if (this.buffer.length >= this.o.maxEvents) this.flush(false);
    else if (!this.timer) this.timer = setTimeout(() => this.flush(false), this.o.flushMs);
  }

  /** Withdrawal: pending un-sent events are dropped, never replayed later. */
  clear(): void {
    this.buffer = [];
    this.retry = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  flush(unloading: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const now = Date.now();
    const due = this.retry.filter((r) => r.at <= now);
    this.retry = this.retry.filter((r) => r.at > now);
    for (const r of due) this.send(r.events, r.attempts, unloading);
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0, this.o.maxEvents);
    this.send(events, 0, unloading);
    if (this.buffer.length) this.flush(unloading);
  }

  private send(events: OutgoingEvent[], attempts: number, unloading: boolean): void {
    const body = JSON.stringify({ site_id: this.o.siteId, sent_at: Date.now(), events });
    if (unloading && typeof navigator.sendBeacon === "function") {
      try {
        if (navigator.sendBeacon(this.o.url, new Blob([body], { type: "text/plain" }))) {
          this.o.onDebug?.("beacon", { n: events.length });
          return;
        }
      } catch {
        /* fall through to fetch */
      }
    }
    const f = this.o.fetchImpl ?? fetch;
    f(this.o.url, { method: "POST", body, headers: { "content-type": "text/plain" }, keepalive: true, credentials: "omit", mode: "cors" })
      .then((res) => {
        if (res.status === 202) {
          this.o.onDebug?.("sent", { n: events.length });
          return;
        }
        if (res.status === 429 || res.status >= 500) this.scheduleRetry(events, attempts, res.headers.get("retry-after"));
        else this.o.onDebug?.("rejected", { status: res.status });
      })
      .catch(() => this.scheduleRetry(events, attempts, null));
  }

  private scheduleRetry(events: OutgoingEvent[], attempts: number, retryAfter: string | null): void {
    if (attempts >= 3 || this.retry.length >= 5) {
      this.o.onDebug?.("dropped", { n: events.length });
      return;
    }
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.min(30_000, 1000 * Math.pow(2, attempts) * (0.5 + Math.random()));
    this.retry.push({ events, attempts: attempts + 1, at: Date.now() + wait });
    if (!this.timer) this.timer = setTimeout(() => this.flush(false), wait);
  }
}
