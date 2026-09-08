"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@track-site/ui";
import type { UsersActionState } from "@/server/ops/actions/users";
import { errorLabel } from "./labels";

export const initialState: UsersActionState = { ok: false, error: null, notice: null };

/**
 * Closes a confirmation dialog once its action succeeded. "State adjusted during render" (the last seen
 * action state is tracked) instead of an effect, so no cascading render.
 */
export function useCloseOnSuccess(state: UsersActionState, onSuccess: () => void): void {
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) onSuccess();
  }
}

/** Outcome of an action: the notice on success (with the session count and the mail state where they matter), the mapped error otherwise. */
export function ActionFeedback({ state }: { state: UsersActionState }) {
  const t = useTranslations("opsUsers");
  if (state.ok && state.notice) return <Alert tone={state.mailed === false ? "warn" : "ok"}>{t(`notices.${state.notice}`, { count: state.sessionsRevoked ?? 0, mailed: state.mailed ? "yes" : "no" })}</Alert>;
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error)}</Alert>;
  return null;
}
