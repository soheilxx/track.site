/** Exponential backoff with full jitter (AWS style). */
export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: boolean;
  random?: () => number;
}

export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 15 * 60_000;
  const factor = options.factor ?? 2;
  const raw = Math.min(max, base * Math.pow(factor, Math.max(0, attempt)));
  if (options.jitter === false) return raw;
  const rnd = options.random ?? Math.random;
  return Math.floor(rnd() * raw);
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds from now. */
export function parseRetryAfterMs(header: string | null | undefined, now: Date = new Date()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now.getTime());
}

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  cooldownMs?: number;
  now?: () => number;
}

/** Per-destination circuit breaker: opens after N failures inside a window, probes after cooldown. */
export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | null = null;
  private halfOpenInFlight = false;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  get state(): CircuitState {
    if (this.openedAt === null) return "closed";
    if (this.now() - this.openedAt >= this.cooldownMs) return "half_open";
    return "open";
  }

  /** Returns true when a call may proceed. In half-open state only one probe is allowed. */
  allow(): boolean {
    const s = this.state;
    if (s === "closed") return true;
    if (s === "half_open" && !this.halfOpenInFlight) {
      this.halfOpenInFlight = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = null;
    this.halfOpenInFlight = false;
  }

  recordFailure(): void {
    const t = this.now();
    this.halfOpenInFlight = false;
    if (this.state === "half_open") {
      this.openedAt = t;
      return;
    }
    this.failures = this.failures.filter((f) => t - f <= this.windowMs);
    this.failures.push(t);
    if (this.failures.length >= this.threshold) this.openedAt = t;
  }
}
