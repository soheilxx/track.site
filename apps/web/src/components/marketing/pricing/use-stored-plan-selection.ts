"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseStoredPlanSelection, readStoredPlanSelectionRaw, type PlanSelection } from "./plan-selection";

const subscribe = () => () => {};
const serverSnapshot = () => null;

/**
 * The plan selection remembered in this tab (see `storePlanSelection`). Null on the server and during
 * hydration, so server and client markup agree; the client value arrives right after hydration
 * without a state update inside an effect.
 */
export function useStoredPlanSelection(): PlanSelection | null {
  const raw = useSyncExternalStore(subscribe, readStoredPlanSelectionRaw, serverSnapshot);
  return useMemo(() => parseStoredPlanSelection(raw), [raw]);
}
