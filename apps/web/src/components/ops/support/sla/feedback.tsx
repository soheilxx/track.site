"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@track-site/ui";
import type { SupportSlaActionState } from "@/server/ops/actions/support-sla";
import { errorLabel, noticeLabel } from "./labels";

/** Result of an SLA action: the notice on success, the mapped error otherwise (`in_use` carries the ticket count). */
export function SlaActionFeedback({ state }: { state: SupportSlaActionState | null }) {
  const t = useTranslations("supportSla");
  if (!state) return null;
  if (state.ok) {
    const notice = noticeLabel(t, state.notice);
    return notice ? <Alert tone="ok">{notice}</Alert> : null;
  }
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error, { count: state.count ?? 0 })}</Alert>;
  return null;
}
