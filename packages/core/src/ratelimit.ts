/**
 * Rate limiting interfaces. `MemoryRateLimiter` is the reference for single processes and tests;
 * a Redis/Valkey implementation can replace it by env without touching callers.
 */
export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number, cost?: number): Promise<RateLimitDecision>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;
  private lastSweep = 0;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async hit(key: string, limit: number, windowMs: number, cost = 1): Promise<RateLimitDecision> {
    const t = this.now();
    this.sweep(t);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count + cost > limit) {
      return { allowed: false, remaining: Math.max(0, limit - bucket.count), limit, resetAt: bucket.resetAt };
    }
    bucket.count += cost;
    return { allowed: true, remaining: limit - bucket.count, limit, resetAt: bucket.resetAt };
  }

  private sweep(t: number): void {
    if (t - this.lastSweep < 30_000) return;
    this.lastSweep = t;
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }
}

export function rateLimitHeaders(d: RateLimitDecision, now = Date.now()): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(d.limit),
    "RateLimit-Remaining": String(d.remaining),
    "RateLimit-Reset": String(Math.ceil(d.resetAt / 1000)),
  };
  if (!d.allowed) headers["Retry-After"] = String(Math.max(1, Math.ceil((d.resetAt - now) / 1000)));
  return headers;
}
