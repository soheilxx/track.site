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
];
const DEVELOPER: readonly Permission[] = [
  ...READ,
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
const ANALYST: readonly Permission[] = [...READ, "events.export", "ai.chat", "audit.read"];
const BILLING: readonly Permission[] = [...READ, "billing.manage"];
const ADMIN: readonly Permission[] = [
  ...DEVELOPER,
  "org.update",
  "members.invite",
  "members.update",
  "members.remove",
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

/** Roles a given role may assign to others (nobody assigns OWNER except an OWNER). */
export function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "OWNER") return [...ORG_ROLES];
  if (actor === "ADMIN") return ORG_ROLES.filter((r) => r !== "OWNER");
  return [];
}
