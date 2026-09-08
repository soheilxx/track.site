"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Status } from "@track-site/ui";
import { exportTicketsAction, type ExportResult } from "@/server/ops/actions/support-tickets";
import { errorLabel } from "./labels";

/**
 * CSV export of the queue as filtered: the server action returns the text (metadata only, audited), the
 * browser saves it as a file. The outcome — rows, total, truncation — is announced next to the button
 * (counts passed as numbers; the strings pluralise and format them per locale).
 */
export function ExportButton({ query }: { query: string }) {
  const t = useTranslations("supportTickets.queue.export");
  const te = useTranslations("supportTickets");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ExportResult | null>(null);

  const run = () =>
    startTransition(async () => {
      let outcome: ExportResult;
      try {
        outcome = await exportTicketsAction(query);
      } catch {
        outcome = { ok: false, error: "generic" };
      }
      setResult(outcome);
      if (!outcome.ok) return;
      const blob = new Blob([outcome.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outcome.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" onClick={run} loading={pending} loadingLabel={t("working")} leadingIcon={<Download className="size-4" aria-hidden="true" />} data-testid="support-export">
        {t("button")}
      </Button>
      <span role="status" aria-live="polite" className="text-xs">
        {result ? (
          result.ok ? (
            <Status tone={result.truncated ? "warn" : "ok"} indicator="icon" className="text-xs">
              {result.truncated ? t("truncated", { rows: result.rows, total: result.total }) : t("done", { rows: result.rows })}
            </Status>
          ) : (
            <Status tone="bad" indicator="icon" className="text-xs">
              {errorLabel(te, result.error)}
            </Status>
          )
        ) : null}
      </span>
    </div>
  );
}
