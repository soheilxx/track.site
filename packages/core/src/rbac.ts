/**
 * Organization roles and permissions. Kept free of ORM imports so it can be used in
 * client components, edge middleware and server actions alike. UI hiding never replaces
 * a server-side `assertCan` call.
 */
export const ORG_ROLES = ["OWNER", "ADMIN", "DEVELOPER", "ANALYST", "BILLING", "READ_ONLY"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PLATFORM_ROLES = ["NONE", "PLATFORM_SUPPORT", "PLATFORM_ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PERMISSIONS = [
  "org.read",
  "org.update",
  "org.delete",
  "members.read",
  "members.invite",
  "members.update",
  "members.remove",
  "members.security",
  "sites.read",
  "sites.create",
  "sites.update",
  "sites.delete",
  "domains.verify",
  "events.read",
  "events.export",
  "config.read",
  "config.draft",
  "config.publish",
  "config.rollback",
  "integrations.read",
  "integrations.manage",
  "credentials.write",
  "credentials.rotate",
  "consent.read",
  "consent.manage",
  "privacy.dsar",
  "privacy.retention",
  "ai.chat",
  "ai.write_tools",
  "billing.read",
  "billing.manage",
  "audit.read",
  "kill_switch.manage",
  // customer support portal (/app/support, docs/18-support-desk.md): every member reads the organisation's
  // tickets; every role except READ_ONLY opens tickets, replies, marks them solved and rates them
  "support.read",
  "support.write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;
const READ: readonly Permission[] = [
  "org.read",
  "members.read",
  "sites.read",
  "events.read",
  "config.read",
  "integrations.read",
  "consent.read",
  "billing.read",
  "support.read",
];
const DEVELOPER: readonly Permission[] = [
  ...READ,
  "support.write",
  "sites.create",
  "sites.update",
  "domains.verify",
  "events.export",
  "config.draft",
  "config.publish",
  "config.rollback",
  "integrations.manage",
  "credentials.write",
  "credentials.rotate",
  "consent.manage",
  "ai.chat",
  "ai.write_tools",
  "audit.read",
];
const ANALYST: readonly Permission[] = [...READ, "support.write", "events.export", "ai.chat", "audit.read"];
const BILLING: readonly Permission[] = [...READ, "support.write", "billing.manage"];
const ADMIN: readonly Permission[] = [
  ...DEVELOPER,
  "org.update",
  "members.invite",
  "members.update",
  "members.remove",
  "members.security",
  "sites.delete",
  "privacy.dsar",
  "privacy.retention",
  "billing.manage",
  "kill_switch.manage",
];

export const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  OWNER: new Set(ALL),
  ADMIN: new Set(ADMIN),
  DEVELOPER: new Set(DEVELOPER),
  ANALYST: new Set(ANALYST),
  BILLING: new Set(BILLING),
  READ_ONLY: new Set(READ),
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  DEVELOPER: "Developer",
  ANALYST: "Analyst",
  BILLING: "Billing",
  READ_ONLY: "Read only",
};

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

export function can(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export class ForbiddenError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Missing permission ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export function assertCan(role: OrgRole, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}

/**
 * Whether `actor` may reset the two-factor authentication of a member with role `target`
 * (docs/17 §"Two-factor reset"): the `members.security` permission (OWNER and ADMIN), and an OWNER is
 * only ever reset by an OWNER. Never the actor's own account — that check needs the user ids and stays
 * with the caller.
 */
export function canResetTwoFactor(actor: OrgRole, target: OrgRole): boolean {
  return can(actor, "members.security") && (target !== "OWNER" || actor === "OWNER");
}

/** Roles a given role may assign to others (nobody assigns OWNER except an OWNER). */
export function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "OWNER") return [...ORG_ROLES];
  if (actor === "ADMIN") return ORG_ROLES.filter((r) => r !== "OWNER");
  return [];
}

/**
 * Platform permissions of the Track Operations console (docs/17, docs/18-support-desk.md §"Permissions").
 * Orthogonal to the organisation permissions above: they describe what an operator with a platform role may
 * do on Track's own console, never inside a customer organisation. `requirePlatform(minRole, permission)` in
 * apps/web/src/server/ops/platform.ts enforces them server-side; the navigation only hides entries.
 *
 * Scope notes that the module rules refine (the permission alone does not encode them):
 * - `platform.macros.manage` for PLATFORM_SUPPORT means personal macros plus *using* global ones; creating
 *   or editing global macros is an admin action (the support-desk module checks the macro's scope).
 * - `platform.audit.read` for PLATFORM_SUPPORT is limited to the operator's own actions by the audit module.
 */
export const PLATFORM_PERMISSIONS = [
  "platform.tickets.read",
  "platform.tickets.write",
  "platform.tickets.assign",
  "platform.tickets.delete",
  "platform.macros.manage",
  "platform.sla.manage",
  "platform.orgs.read",
  "platform.billing.read",
  "platform.billing.manage",
  "platform.breakglass.request",
  "platform.breakglass.approve",
  "platform.controls.manage",
  "platform.users.manage",
  "platform.audit.read",
  "platform.content.read",
  "platform.reports.read",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const PLATFORM_SUPPORT: readonly PlatformPermission[] = [
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

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  NONE: new Set(),
  PLATFORM_SUPPORT: new Set(PLATFORM_SUPPORT),
  PLATFORM_ADMIN: new Set(PLATFORM_PERMISSIONS),
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isPlatformPermission(value: unknown): value is PlatformPermission {
  return typeof value === "string" && (PLATFORM_PERMISSIONS as readonly string[]).includes(value);
}

/** Whether a platform role carries a platform permission; `NONE` (every customer) never does. */
export function hasPlatformPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role].has(permission);
}

/**
 * The lowest platform role that carries `permission` (`PLATFORM_SUPPORT` or `PLATFORM_ADMIN`). Used to
 * derive a navigation entry's minimum role from its permission so the two never diverge.
 */
export function minPlatformRoleFor(permission: PlatformPermission): Exclude<PlatformRole, "NONE"> {
  return hasPlatformPermission("PLATFORM_SUPPORT", permission) ? "PLATFORM_SUPPORT" : "PLATFORM_ADMIN";
}

export class PlatformForbiddenError extends Error {
  readonly permission: PlatformPermission;
  constructor(permission: PlatformPermission) {
    super(`Missing platform permission ${permission}`);
    this.name = "PlatformForbiddenError";
    this.permission = permission;
  }
}

export function assertPlatformPermission(role: PlatformRole, permission: PlatformPermission): void {
  if (!hasPlatformPermission(role, permission)) throw new PlatformForbiddenError(permission);
}
