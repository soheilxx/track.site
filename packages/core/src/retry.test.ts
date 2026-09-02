import { describe, expect, it } from "vitest";
import { CircuitBreaker, backoffDelay, parseRetryAfterMs } from "./retry.ts";
import { MemoryRateLimiter } from "./ratelimit.ts";
import { assertCan, assignableRoles, can } from "./rbac.ts";
import { err, ok, toErrResult, AppError } from "./result.ts";

describe("backoff", () => {
  it("grows exponentially, caps and jitters within bounds", () => {
    expect(backoffDelay(0, { jitter: false })).toBe(1000);
    expect(backoffDelay(3, { jitter: false })).toBe(8000);
    expect(backoffDelay(20, { jitter: false })).toBe(15 * 60_000);
    const d = backoffDelay(3, { random: () => 0.5 });
    expect(d).toBe(4000);
  });
  it("parses Retry-After", () => {
    expect(parseRetryAfterMs("7")).toBe(7000);
    expect(parseRetryAfterMs(null)).toBeNull();
    const now = new Date("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });
});

describe("circuit breaker", () => {
  it("opens after threshold, probes after cooldown, closes on success", () => {
    let t = 0;
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100, now: () => t });
    expect(cb.allow()).toBe(true);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe("open");
    expect(cb.allow()).toBe(false);
    t = 150;
    expect(cb.state).toBe("half_open");
    expect(cb.allow()).toBe(true);
    expect(cb.allow()).toBe(false);
    cb.recordSuccess();
    expect(cb.state).toBe("closed");
  });
});

describe("rate limiter", () => {
  it("limits per window", async () => {
    let t = 0;
    const rl = new MemoryRateLimiter(() => t);
    expect((await rl.hit("k", 2, 1000)).allowed).toBe(true);
    expect((await rl.hit("k", 2, 1000)).allowed).toBe(true);
    expect((await rl.hit("k", 2, 1000)).allowed).toBe(false);
    t = 1001;
    expect((await rl.hit("k", 2, 1000)).allowed).toBe(true);
  });
});

describe("rbac", () => {
  it("enforces the permission matrix", () => {
    expect(can("READ_ONLY", "config.publish")).toBe(false);
    expect(can("DEVELOPER", "config.publish")).toBe(true);
    expect(can("BILLING", "billing.manage")).toBe(true);
    expect(can("ANALYST", "credentials.write")).toBe(false);
    expect(() => assertCan("ANALYST", "config.publish")).toThrow();
    expect(assignableRoles("ADMIN")).not.toContain("OWNER");
    expect(assignableRoles("DEVELOPER")).toEqual([]);
  });
});

describe("result contract", () => {
  it("shapes ok and err results and never leaks internals", () => {
    expect(ok({ a: 1 })).toMatchObject({ ok: true, code: "OK", retryable: false, version: 1 });
    expect(err("RATE_LIMITED", "slow down")).toMatchObject({ ok: false, retryable: true, data: null });
    expect(toErrResult(new Error("db password is hunter2"))).toMatchObject({ code: "INTERNAL_ERROR", message: "Unexpected error" });
    expect(toErrResult(new AppError("NOT_FOUND", "site missing"))).toMatchObject({ code: "NOT_FOUND", message: "site missing" });
  });
});
