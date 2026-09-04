import { FlaskConical, Gauge, Grid3x3, MousePointerClick, Radio, ScrollText, SlidersHorizontal, TrendingDown, UsersRound, type LucideIcon } from "lucide-react";

/**
 * Sub-modules reachable from the command palette (redesign supplement §8): the pages that live one
 * level below the primary navigation. Labels come from `shell.palette.modules.<key>`.
 */
export const MODULES: ReadonlyArray<{ href: string; key: "eventsMatrix" | "eventsExplorer" | "eventsTestLab" | "revenueLeaks" | "consentSimulator" | "attribution" | "audiences" | "usage" | "audit"; icon: LucideIcon }> = [
  { href: "/app/events/matrix", key: "eventsMatrix", icon: Grid3x3 },
  { href: "/app/events/explorer", key: "eventsExplorer", icon: Radio },
  { href: "/app/events/test-lab", key: "eventsTestLab", icon: FlaskConical },
  { href: "/app/data-quality/revenue-leaks", key: "revenueLeaks", icon: TrendingDown },
  { href: "/app/consent/simulator", key: "consentSimulator", icon: SlidersHorizontal },
  { href: "/app/insights/attribution", key: "attribution", icon: MousePointerClick },
  { href: "/app/insights/audiences", key: "audiences", icon: UsersRound },
  { href: "/app/billing/usage", key: "usage", icon: Gauge },
  { href: "/app/team/audit", key: "audit", icon: ScrollText },
];
