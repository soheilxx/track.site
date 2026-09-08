import { describe, expect, it, vi } from "vitest";

// the queries' runtime dependencies are server-only; the rules under test are pure
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/env", () => ({ env: () => ({ HOST_APP: "http://localhost:3000/app", OPS_REQUIRE_2FA: false, APP_ENV: "test" }) }));
vi.mock("@/server/db", () => ({ db: vi.fn(), logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/server/ops/platform", () => ({ opsRequiresTwoFactor: () => false, withPlatform: vi.fn(), auditPlatform: vi.fn() }));

import { BREAK_GLASS_REQUEST_TTL_MS, approvalVerdict, auditLogUrl, breakGlassState, formatMailInstant, isReadPermission, remainingMs, requestedMinutes, revokeKindFor } from "./break-glass";

const T0 = new Date("2026-09-08T10:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("breakGlassState", () => {
  const base = { approvedAt: null, revokedAt: null, startsAt: T0, endsAt: min(60), createdAt: T0 };

  it("keeps an unapproved request pending for a day and marks it stale afterwards", () => {
    expect(breakGlassState(base, min(5))).toBe("pending");
    expect(breakGlassState(base, new Date(T0.getTime() + BREAK_GLASS_REQUEST_TTL_MS - 1))).toBe("pending");
    expect(breakGlassState(base, new Date(T0.getTime() + BREAK_GLASS_REQUEST_TTL_MS))).toBe("stale");
  });

  it("is active from approval until ends_at and expired afterwards", () => {
    const approved = { ...base, approvedAt: min(1), startsAt: min(1), endsAt: min(61) };
    expect(breakGlassState(approved, min(2))).toBe("active");
    expect(breakGlassState(approved, min(60))).toBe("active");
    expect(breakGlassState(approved, min(61))).toBe("expired");
  });

  it("tells a revoked grant from a withdrawn or declined request", () => {
    expect(breakGlassState({ ...base, revokedAt: min(3) }, min(4))).toBe("withdrawn");
    expect(breakGlassState({ ...base, approvedAt: min(1), revokedAt: min(3) }, min(4))).toBe("revoked");
    // revocation wins even after the window would have ended
    expect(breakGlassState({ ...base, approvedAt: min(1), revokedAt: min(3) }, min(500))).toBe("revoked");
  });
});

describe("window helpers", () => {
  it("derives the requested minutes from the stored window and never reports zero", () => {
    expect(requestedMinutes({ startsAt: T0, endsAt: min(240) })).toBe(240);
    expect(requestedMinutes({ startsAt: T0, endsAt: new Date(T0.getTime() + 15 * 60_000 + 20_000) })).toBe(15);
    expect(requestedMinutes({ startsAt: T0, endsAt: T0 })).toBe(1);
  });

  it("clamps the remaining time at zero", () => {
    expect(remainingMs(min(10), T0)).toBe(600_000);
    expect(remainingMs(T0, min(10))).toBe(0);
  });
});

describe("approvalVerdict (four eyes)", () => {
  it("lets a different admin approve regardless of ticket or other admins", () => {
    expect(approvalVerdict({ approverId: "b", requesterId: "a", otherAdminExists: true, ticketRef: null })).toEqual({ ok: true, selfApproved: false });
  });

  it("refuses self-approval while another admin could approve", () => {
    expect(approvalVerdict({ approverId: "a", requesterId: "a", otherAdminExists: true, ticketRef: "SUP-1" })).toEqual({ ok: false, reason: "fourEyes" });
  });

  it("allows the single-admin fallback only with a ticket reference and records it as self-approved", () => {
    expect(approvalVerdict({ approverId: "a", requesterId: "a", otherAdminExists: false, ticketRef: null })).toEqual({ ok: false, reason: "ticketRequired" });
    expect(approvalVerdict({ approverId: "a", requesterId: "a", otherAdminExists: false, ticketRef: "   " })).toEqual({ ok: false, reason: "ticketRequired" });
    expect(approvalVerdict({ approverId: "a", requesterId: "a", otherAdminExists: false, ticketRef: "SUP-1234" })).toEqual({ ok: true, selfApproved: true });
  });
});

describe("revokeKindFor", () => {
  const support = { userId: "s", platformRole: "PLATFORM_SUPPORT" as const };
  const admin = { userId: "x", platformRole: "PLATFORM_ADMIN" as const };

  it("lets the requester withdraw and an admin decline an open request", () => {
    const pending = { state: "pending" as const, requesterId: "s", approverId: null };
    expect(revokeKindFor(pending, support)).toBe("withdraw");
    expect(revokeKindFor(pending, admin)).toBe("decline");
    expect(revokeKindFor(pending, { userId: "other", platformRole: "PLATFORM_SUPPORT" })).toBeNull();
    expect(revokeKindFor({ ...pending, state: "stale" }, support)).toBe("withdraw");
  });

  it("lets grantee, approver and admins revoke an active grant, nobody else", () => {
    const active = { state: "active" as const, requesterId: "s", approverId: "p" };
    expect(revokeKindFor(active, support)).toBe("revoke");
    expect(revokeKindFor(active, { userId: "p", platformRole: "PLATFORM_SUPPORT" })).toBe("revoke");
    expect(revokeKindFor(active, admin)).toBe("revoke");
    expect(revokeKindFor(active, { userId: "other", platformRole: "PLATFORM_SUPPORT" })).toBeNull();
  });

  it("does nothing to closed rows", () => {
    for (const state of ["revoked", "expired", "withdrawn"] as const) {
      expect(revokeKindFor({ state, requesterId: "s", approverId: "p" }, admin)).toBeNull();
    }
  });
});

describe("read-only support session", () => {
  it("allows exactly the *.read permissions", () => {
    expect(isReadPermission("events.read")).toBe(true);
    expect(isReadPermission("billing.read")).toBe(true);
    expect(isReadPermission("events.export")).toBe(false);
    expect(isReadPermission("config.publish")).toBe(false);
    expect(isReadPermission("members.invite")).toBe(false);
    expect(isReadPermission("kill_switch.manage")).toBe(false);
  });
});

describe("customer notification", () => {
  it("formats the end of the window in the owner's language in UTC", () => {
    expect(formatMailInstant(new Date("2026-09-08T14:30:00Z"), "de")).toMatch(/08\.09\.2026, 14:30 UTC$/);
    expect(formatMailInstant(new Date("2026-09-08T14:30:00Z"), "en")).toMatch(/^8 Sept 2026, 14:30 UTC$/);
    expect(formatMailInstant(new Date("2026-09-08T14:30:00Z"), "xx")).toMatch(/2026, 14:30 UTC$/);
  });

  it("links the audit log of the customer dashboard", () => {
    expect(auditLogUrl()).toBe("http://localhost:3000/app/team/audit");
  });
});
