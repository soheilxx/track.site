"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { BreakGlassActionState } from "@/server/ops/actions/break-glass";
import { ActionFeedback } from "./feedback";

interface NoticeContextValue {
  notice: BreakGlassActionState | null;
  announce: (state: BreakGlassActionState) => void;
}

const NoticeContext = createContext<NoticeContextValue>({
  notice: null,
  announce: () => undefined,
});

/**
 * Page-level home of the last successful break-glass action. Approve, decline, withdraw and revoke change
 * which section a row belongs to, so the row — and any notice rendered inside it — unmounts with the
 * revalidated page; the provider outlives the rows (client state survives the server re-render) and the
 * region below the page header keeps the outcome, including how many owners were e-mailed, readable.
 */
export function BreakGlassNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<BreakGlassActionState | null>(null);
  const announce = useCallback((state: BreakGlassActionState) => setNotice(state), []);
  const value = useMemo(() => ({ notice, announce }), [notice, announce]);
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
}

/** Live region under the page header; empty until an action succeeded. */
export function BreakGlassNoticeRegion() {
  const { notice } = useContext(NoticeContext);
  return (
    <div aria-live="polite" data-testid="break-glass-notice">
      {notice ? <ActionFeedback state={notice} /> : null}
    </div>
  );
}

/**
 * Closes a confirmation dialog once its action succeeded — "state adjusted during render" (the last seen
 * action state is tracked) instead of an effect, so there is no cascading render.
 */
export function useCloseOnSuccess(
  state: BreakGlassActionState,
  setOpen: (open: boolean) => void,
): void {
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }
}

type BreakGlassAction = (
  prev: BreakGlassActionState,
  formData: FormData,
) => Promise<BreakGlassActionState>;

/**
 * Wraps a row action for `useActionState` so a success reaches the page-level region. The announcement
 * happens inside the action promise, on purpose: the revalidated page arrives together with the action
 * result, the row that owns the state leaves the tree before it ever renders (or runs an effect) with the
 * success, and only the provider — which outlives the rows — can still show it.
 */
export function useAnnouncedAction(action: BreakGlassAction): BreakGlassAction {
  const { announce } = useContext(NoticeContext);
  return useCallback(
    async (prev: BreakGlassActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) announce(result);
      return result;
    },
    [action, announce],
  );
}
