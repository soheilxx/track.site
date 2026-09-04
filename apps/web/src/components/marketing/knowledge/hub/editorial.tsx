"use client";

import type { ReactNode } from "react";
import { useHub } from "./provider";

/**
 * Wraps the server-rendered editorial sections (featured story, topic worlds, learning paths,
 * guides, fresh lists). While a search or filter is active the hub is in results mode: the sections
 * are hidden so the directory sits directly under the search field; clearing the query brings them
 * back without a round trip (they never left the DOM).
 */
export function HubEditorial({ children }: { children: ReactNode }) {
  const { active } = useHub();
  return <div hidden={active}>{children}</div>;
}
