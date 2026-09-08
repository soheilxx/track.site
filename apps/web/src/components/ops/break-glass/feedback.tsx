"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@track-site/ui";
import type { BreakGlassActionState } from "@/server/ops/actions/break-glass";
import { errorLabel } from "./labels";

export const INITIAL_STATE: BreakGlassActionState = { ok: false, error: null, notice: null };

/** Result of a break-glass action: the notice (plus how many owners were e-mailed) on success, the mapped error otherwise. */
export function ActionFeedback({ state }: { state: BreakGlassActionState }) {
  const t = useTranslations("opsBreakGlass");
  if (state.ok && state.notice) {
    const failed = state.notified?.failed ?? 0;
    return (
      <Alert tone={failed > 0 ? "warn" : "ok"}>
        {t(`notices.${state.notice}`)}
        {state.notified ? (
          <> {t("notices.notified", { sent: state.notified.sent, failed })}</>
        ) : null}
      </Alert>
    );
  }
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error)}</Alert>;
  return null;
}
