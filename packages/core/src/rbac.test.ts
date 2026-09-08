import { describe, expect, it } from "vitest";
import {
  ORG_ROLES,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  PLATFORM_ROLE_PERMISSIONS,
  PlatformForbiddenError,
  assertPlatformPermission,
  can,
  canResetTwoFactor,
  hasPlatformPermission,
  isPlatformPermission,
  isPlatformRole,
  minPlatformRoleFor,
  type PlatformPermission,
} from "./rbac.ts";

/** The support role's matrix as docs/18 states it; everything else is admin-only. */
const SUPPORT_EXPECTED: readonly PlatformPermission[] = [
  "platform.tickets.read",
  "platform.tickets.write",
  "platform.tickets.assign",
  "platform.macros.manage",
  "platform.orgs.read",
  "platform.billing.read",
  "platform.breakglass.request",
  "platform.audit.read",
  "platform.content.read",
  "platform.reports.read",
];
const ADMIN_ONLY: readonly PlatformPermission[] = [
  "platform.tickets.delete",
  "platform.sla.manage",
  "platform.billing.manage",
  "platform.breakglass.approve",
  "platform.controls.manage",
  "platform.users.manage",
];

describe("platform permissions", () => {
  it("lists every permission exactly once and every role has a set", () => {
    expect(new Set(PLATFORM_PERMISSIONS).size).toBe(PLATFORM_PERMISSIONS.length);
    for (const role of PLATFORM_ROLES) expect(PLATFORM_ROLE_PERMISSIONS[role]).toBeInstanceOf(Set);
    expect([...SUPPORT_EXPECTED, ...ADMIN_ONLY].sort()).toEqual([...PLATFORM_PERMISSIONS].sort());
  });

  it("gives NONE nothing, PLATFORM_SUPPORT the support matrix and PLATFORM_ADMIN everything", () => {
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(hasPlatformPermission("NONE", permission), permission).toBe(false);
      expect(hasPlatformPermission("PLATFORM_ADMIN", permission), permission).toBe(true);
      expect(hasPlatformPermission("PLATFORM_SUPPORT", permission), permission).toBe(SUPPORT_EXPECTED.includes(permission));
    }
  });

  it("keeps the admin-only permissions away from support", () => {
    for (const permission of ADMIN_ONLY) {
      expect(hasPlatformPermission("PLATFORM_SUPPORT", permission), permission).toBe(false);
      expect(minPlatformRoleFor(permission), permission).toBe("PLATFORM_ADMIN");
    }
    for (const permission of SUPPORT_EXPECTED) expect(minPlatformRoleFor(permission), permission).toBe("PLATFORM_SUPPORT");
  });

  it("asserts with a typed error", () => {
    expect(() => assertPlatformPermission("PLATFORM_SUPPORT", "platform.tickets.write")).not.toThrow();
    expect(() => assertPlatformPermission("PLATFORM_SUPPORT", "platform.users.manage")).toThrow(PlatformForbiddenError);
    expect(() => assertPlatformPermission("NONE", "platform.tickets.read")).toThrow(/platform.tickets.read/);
    try {
      assertPlatformPermission("NONE", "platform.content.read");
    } catch (e) {
      expect((e as PlatformForbiddenError).permission).toBe("platform.content.read");
      expect((e as PlatformForbiddenError).name).toBe("PlatformForbiddenError");
    }
  });

  it("recognises roles and permissions from unknown input", () => {
    expect(isPlatformRole("PLATFORM_ADMIN")).toBe(true);
    expect(isPlatformRole("OWNER")).toBe(false);
    expect(isPlatformRole(null)).toBe(false);
    expect(isPlatformPermission("platform.tickets.read")).toBe(true);
    expect(isPlatformPermission("tickets.read")).toBe(false);
    expect(isPlatformPermission(42)).toBe(false);
  });
});

describe("organisation permissions (unchanged)", () => {
  it("keeps the owner on everything and read-only on reads", () => {
    expect(can("OWNER", "org.delete")).toBe(true);
    expect(can("READ_ONLY", "org.read")).toBe(true);
    expect(can("READ_ONLY", "org.update")).toBe(false);
    expect(ORG_ROLES).toContain("BILLING");
  });

  it("lets only owners reset an owner's two-factor", () => {
    expect(canResetTwoFactor("OWNER", "OWNER")).toBe(true);
    expect(canResetTwoFactor("ADMIN", "OWNER")).toBe(false);
    expect(canResetTwoFactor("ADMIN", "DEVELOPER")).toBe(true);
    expect(canResetTwoFactor("DEVELOPER", "ANALYST")).toBe(false);
  });
});
