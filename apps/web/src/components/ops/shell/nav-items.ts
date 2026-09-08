import {
  BookOpen,
  Building2,
  Gauge,
  HeartPulse,
  Inbox,
  KeyRound,
  Receipt,
  ScrollText,
  SlidersHorizontal,
  TrendingUp,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { PlatformRole } from "@track-site/core";

/** Module keys of the console; labels come from `ops.nav.<key>`, titles/intros from `ops.pages.<key>`. */
export const OPS_MODULE_KEYS = [
  "overview",
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
  /** minimum platform role; the navigation hides entries above the operator's role, pages enforce it again */
  minRole: OpsMinRole;
  exact?: boolean;
}

/**
 * Track Operations navigation (docs/17 §"Modules"). One entry per module slice; the placeholder pages under
 * `src/app/ops/<slug>` are replaced by the modules. Revenue, Controls and Platform users are admin-only.
 */
export const OPS_NAV: readonly OpsNavItem[] = [
  { key: "overview", href: "/ops", icon: Gauge, minRole: "PLATFORM_SUPPORT", exact: true },
  {
    key: "organisations",
    href: "/ops/organisations",
    icon: Building2,
    minRole: "PLATFORM_SUPPORT",
  },
  { key: "breakGlass", href: "/ops/break-glass", icon: KeyRound, minRole: "PLATFORM_SUPPORT" },
  { key: "health", href: "/ops/health", icon: HeartPulse, minRole: "PLATFORM_SUPPORT" },
  { key: "revenue", href: "/ops/revenue", icon: Receipt, minRole: "PLATFORM_ADMIN" },
  { key: "controls", href: "/ops/controls", icon: SlidersHorizontal, minRole: "PLATFORM_ADMIN" },
  { key: "inbox", href: "/ops/inbox", icon: Inbox, minRole: "PLATFORM_SUPPORT" },
  { key: "growth", href: "/ops/growth", icon: TrendingUp, minRole: "PLATFORM_SUPPORT" },
  { key: "audit", href: "/ops/audit", icon: ScrollText, minRole: "PLATFORM_SUPPORT" },
  { key: "users", href: "/ops/users", icon: UserCog, minRole: "PLATFORM_ADMIN" },
  { key: "content", href: "/ops/content", icon: BookOpen, minRole: "PLATFORM_SUPPORT" },
];

const RANK: Record<PlatformRole, number> = { NONE: 0, PLATFORM_SUPPORT: 1, PLATFORM_ADMIN: 2 };

/** Client-safe copy of `hasPlatformRole` (server/ops/platform.ts) for hiding navigation entries. */
export function roleAllows(role: PlatformRole, minRole: OpsMinRole): boolean {
  return RANK[role] >= RANK[minRole];
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
