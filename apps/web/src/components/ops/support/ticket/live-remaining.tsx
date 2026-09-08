"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatDuration } from "./format";

/** "2 h 15 min left" / "overdue by 40 min", recomputed every 30 s from the due time while the page is open. */
export function LiveRemaining({ dueAt, initialRemainingMs, locale }: { dueAt: string; initialRemainingMs: number; locale: string }) {
  const t = useTranslations("supportTicket");
  const [remaining, setRemaining] = useState(initialRemainingMs);
  useEffect(() => {
    const due = Date.parse(dueAt);
    if (!Number.isFinite(due)) return;
    const tick = () => setRemaining(due - Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [dueAt]);
  return (
    <span className="tabular-nums" aria-live="off" data-testid="ticket-sla-remaining">
      {remaining >= 0 ? t("sla.remaining", { duration: formatDuration(remaining, locale) }) : t("sla.overdueBy", { duration: formatDuration(-remaining, locale) })}
    </span>
  );
}
