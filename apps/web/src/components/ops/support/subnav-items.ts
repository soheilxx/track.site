import { hasPlatformPermission, type PlatformPermission, type PlatformRole } from "@track-site/core";

/**
 * Secondary navigation of the support desk (docs/18 §"Entry points"): the sections of `/ops/support` an
 * operator may open, each with the permission its page enforces again. Pure so the pages, the client
 * badge and the tests share one list; Settings needs `platform.sla.manage` and is hidden from support
 * agents (the page answers 403 anyway).
 */
export const SUPPORT_SECTIONS = ["tickets", "views", "macros", "reports", "settings"] as const;
export type SupportSection = (typeof SUPPORT_SECTIONS)[number];

export interface SupportSubnavItem {
  key: SupportSection;
  href: string;
  permission: PlatformPermission;
  /** true for the hub only: `/ops/support` is active for the ticket detail too, but not for its sub-pages */
  exact: boolean;
}

export const SUPPORT_SUBNAV: readonly SupportSubnavItem[] = [
  { key: "tickets", href: "/ops/support", permission: "platform.tickets.read", exact: true },
  { key: "views", href: "/ops/support/views", permission: "platform.tickets.read", exact: false },
  { key: "macros", href: "/ops/support/macros", permission: "platform.macros.manage", exact: false },
  { key: "reports", href: "/ops/support/reports", permission: "platform.reports.read", exact: false },
  { key: "settings", href: "/ops/support/settings", permission: "platform.sla.manage", exact: false },
];

/** The sections a role may open (the permission matrix of docs/18 §2). */
export function supportSubnavItems(role: PlatformRole): SupportSubnavItem[] {
  return SUPPORT_SUBNAV.filter((item) => hasPlatformPermission(role, item.permission));
}

/** Which section a path belongs to: sub-pages belong to their section, everything else under `/ops/support` (the ticket detail) to the hub. */
export function supportSectionOf(pathname: string): SupportSection | null {
  if (pathname !== "/ops/support" && !pathname.startsWith("/ops/support/")) return null;
  for (const item of SUPPORT_SUBNAV) {
    if (item.exact) continue;
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.key;
  }
  return "tickets";
}
