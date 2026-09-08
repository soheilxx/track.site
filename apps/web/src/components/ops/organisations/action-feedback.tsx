"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@track-site/ui";
import type { OrgActionState } from "@/server/ops/actions/organisations";
import { errorLabel, noticeLabel } from "./labels";

export const initialState: OrgActionState = { ok: false, error: null, notice: null };

/**
 * Closes a confirmation dialog once its action succeeded. "State adjusted during render" (the last seen
 * action state is tracked) instead of an effect, so no cascading render.
 */
export function useCloseOnSuccess(state: OrgActionState, onSuccess: () => void): void {
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) onSuccess();
  }
}

/** Outcome of an action: the notice on success, the mapped error otherwise. */
export function ActionFeedback({ state }: { state: OrgActionState }) {
  const t = useTranslations("opsOrganisations");
  if (state.ok && state.notice) return <Alert tone="ok">{noticeLabel(t, state.notice)}</Alert>;
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error)}</Alert>;
  return null;
}
