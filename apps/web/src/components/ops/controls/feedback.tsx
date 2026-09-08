"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@track-site/ui";
import type { ControlsActionState } from "@/server/ops/actions/controls";
import { errorLabel, noticeLabel } from "./labels";

/**
 * Closes a confirmation dialog once its action succeeded — "state adjusted during render" (the last
 * seen action state is tracked) instead of an effect, so no cascading render.
 */
export function useCloseOnSuccess(state: ControlsActionState, setOpen: (open: boolean) => void): void {
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }
}

/** Result of a Controls action: the notice on success, the mapped error otherwise. */
export function ActionFeedback({ state }: { state: ControlsActionState | null }) {
  const t = useTranslations("opsControls");
  if (!state) return null;
  if (state.ok) {
    const notice = noticeLabel(t, state.notice);
    return notice ? <Alert tone="ok">{notice}</Alert> : null;
  }
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error)}</Alert>;
  return null;
}
