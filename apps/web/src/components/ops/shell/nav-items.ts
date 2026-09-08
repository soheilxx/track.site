import {
  BookOpen,
  Building2,
  Gauge,
  HeartPulse,
  Inbox,
  KeyRound,
  LifeBuoy,
  Receipt,
  ScrollText,
  SlidersHorizontal,
  TrendingUp,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { hasPlatformPermission, minPlatformRoleFor, type PlatformPermission, type PlatformRole } from "@track-site/core";

/** Module keys of the console; labels come from `ops.nav.<key>`, titles/intros from `ops.pages.<key>`. */
export const OPS_MODULE_KEYS = [
  "overview",
  "support",
  "organisations",
  "breakGlass",
  "health",
  "revenue",
  "controls",
  "inbox",
  "growth",
  "audit",
  "users",
  "content",
] as const;
export type OpsModuleKey = (typeof OPS_MODULE_KEYS)[number];

export type OpsMinRole = "PLATFORM_SUPPORT" | "PLATFORM_ADMIN";

export interface OpsNavItem {
  key: OpsModuleKey;
  href: string;
  icon: LucideIcon;
  /**
   * The platform permission the module's entry page requires (`PLATFORM_PERMISSIONS`, packages/core). Pages and
   * actions enforce it through `requirePlatform(minRole, permission)`; the navigation only hides the entry.
   */
  permission: PlatformPermission;
  /**
   * Minimum platform role; derived from `permission` (`minPlatformRoleFor`) unless the module is pinned to a
   * higher role — Revenue stays admin-only although `platform.billing.read` is a support permission. Kept next
   * to the permission so the existing consumers (`roleAllows`, `OpsPlaceholder`) keep one rule.
   */
  minRole: OpsMinRole;
  exact?: boolean;
}

const RANK: Record<PlatformRole, number> = { NONE: 0, PLATFORM_SUPPORT: 1, PLATFORM_ADMIN: 2 };

function entry(
  key: OpsModuleKey,
  href: string,
  icon: LucideIcon,
  permission: PlatformPermission,
  options: { exact?: boolean; minRole?: OpsMinRole } = {},
): OpsNavItem {
  const derived = minPlatformRoleFor(permission);
  const pinned = options.minRole ?? derived;
  const minRole: OpsMinRole = RANK[pinned] >= RANK[derived] ? pinned : derived;
  return { key, href, icon, permission, minRole, ...(options.exact ? { exact: true } : {}) };
}

/**
 * Track Operations navigation (docs/17 §2, docs/18 §"Permissions"). One entry per module slice; the placeholder
 * pages under `src/app/ops/<slug>` are replaced by the modules. Support (tickets) comes first for the support
 * roles — it is their daily work; Revenue, Controls and Platform users stay admin-only.
 */
export const OPS_NAV: readonly OpsNavItem[] = [
  entry("overview", "/ops", Gauge, "platform.orgs.read", { exact: true }),
  entry("support", "/ops/support", LifeBuoy, "platform.tickets.read"),
  entry("organisations", "/ops/organisations", Building2, "platform.orgs.read"),
  entry("breakGlass", "/ops/break-glass", KeyRound, "platform.breakglass.request"),
  entry("health", "/ops/health", HeartPulse, "platform.reports.read"),
  entry("revenue", "/ops/revenue", Receipt, "platform.billing.read", { minRole: "PLATFORM_ADMIN" }),
  entry("controls", "/ops/controls", SlidersHorizontal, "platform.controls.manage"),
  entry("inbox", "/ops/inbox", Inbox, "platform.tickets.read"),
  entry("growth", "/ops/growth", TrendingUp, "platform.reports.read"),
  entry("audit", "/ops/audit", ScrollText, "platform.audit.read"),
  entry("users", "/ops/users", UserCog, "platform.users.manage"),
  entry("content", "/ops/content", BookOpen, "platform.content.read"),
];

/** Client-safe copy of `hasPlatformRole` (server/ops/platform.ts) for hiding navigation entries. */
export function roleAllows(role: PlatformRole, minRole: OpsMinRole): boolean {
  return RANK[role] >= RANK[minRole];
}

/** Whether an operator may open a navigation entry: the pinned minimum role and the entry's permission. */
export function navAllows(role: PlatformRole, item: OpsNavItem): boolean {
  return roleAllows(role, item.minRole) && hasPlatformPermission(role, item.permission);
}

const matches = (pathname: string, item: OpsNavItem): boolean =>
  item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

/** The most specific matching entry is the active one. */
export function isOpsNavActive(pathname: string, item: OpsNavItem): boolean {
  if (!matches(pathname, item)) return false;
  return !OPS_NAV.some(
    (other) => other !== item && other.href.length > item.href.length && matches(pathname, other),
  );
}
