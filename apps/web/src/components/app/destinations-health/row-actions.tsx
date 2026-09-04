"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, Status, Tooltip, buttonVariants, type Tone } from "@track-site/ui";
import { diagnoseDestinationAction, pauseDestinationAction, resumeDestinationAction, type DestinationActionKind, type DestinationActionResult } from "@/server/actions/destinations-health";
import type { DestinationHealthRow } from "@/server/destination-health";

/**
 * Per-destination actions: diagnose (runs the connector's validation + health check and records the
 * verdict), pause / resume (explicit confirmation dialog, audited, only this destination), and the
 * link to the setup wizard for editing. Results are announced in a live region under the buttons.
 */
export function RowActions({ row, canManage }: { row: DestinationHealthRow; canManage: boolean }) {
  const t = useTranslations("destinationsHealth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<DestinationActionKind | null>(null);
  const [dialog, setDialog] = useState<"pause" | "resume" | null>(null);
  const [result, setResult] = useState<DestinationActionResult | null>(null);

  const run = (kind: DestinationActionKind, call: () => Promise<DestinationActionResult>) => {
    setBusy(kind);
    setResult(null);
    startTransition(async () => {
      let next: DestinationActionResult;
      try {
        next = await call();
      } catch {
        next = { ok: false, action: kind, integrationId: row.id, error: "generic", status: null, validation: null, health: null };
      }
      setResult(next);
      setDialog(null);
      setBusy(null);
      if (next.ok || next.status) router.refresh();
    });
  };

  const isDraft = row.status === "draft";
  const editHref = `/app/sites/${row.siteId}/destinations/${row.id}`;

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && !isDraft ? (
          <Tooltip content={t("actions.diagnoseHint")}>
            <Button size="sm" variant="secondary" loading={pending && busy === "diagnose"} loadingLabel={t("actions.diagnosing")} disabled={pending} onClick={() => run("diagnose", () => diagnoseDestinationAction({ integrationId: row.id }))}>
              {t("actions.diagnose")}
            </Button>
          </Tooltip>
        ) : null}
        {canManage && row.status === "paused" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog("resume")}>
            {t("actions.resume")}
          </Button>
        ) : null}
        {canManage && !isDraft && row.status !== "paused" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialog("pause")}>
            {t("actions.pause")}
          </Button>
        ) : null}
        {/* button-styled link: interactive elements are never nested */}
        <Link href={editHref} className={buttonVariants({ variant: "ghost", size: "sm" })} title={t("editHint")}>
          {t("edit")}
        </Link>
      </div>
      <ResultLine result={result} pending={pending} />

      <Dialog
        open={dialog === "pause"}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={t("actions.pauseTitle", { name: row.name })}
        description={t("actions.pauseText")}
        closeLabel={t("actions.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {t("actions.cancel")}
            </Button>
            <Button loading={pending && busy === "pause"} loadingLabel={t("actions.working")} onClick={() => run("pause", () => pauseDestinationAction({ integrationId: row.id, confirmed: true }))}>
              {t("actions.pauseConfirm")}
            </Button>
          </>
        }
      />
      <Dialog
        open={dialog === "resume"}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={t("actions.resumeTitle", { name: row.name })}
        description={t("actions.resumeText")}
        closeLabel={t("actions.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {t("actions.cancel")}
            </Button>
            <Button loading={pending && busy === "resume"} loadingLabel={t("actions.working")} onClick={() => run("resume", () => resumeDestinationAction({ integrationId: row.id, confirmed: true }))}>
              {t("actions.resumeConfirm")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function ResultLine({ result, pending }: { result: DestinationActionResult | null; pending: boolean }) {
  const t = useTranslations("destinationsHealth");
  if (pending) {
    return (
      <Status tone="info" live indicator="icon" className="text-xs">
        {t("actions.working")}
      </Status>
    );
  }
  if (!result) {
    return <span role="status" aria-live="polite" className="sr-only" />;
  }
  let tone: Tone;
  let text: string;
  if (result.error) {
    tone = "bad";
    text = t(`results.error.${result.error}`);
  } else if (result.action === "pause") {
    tone = "warn";
    text = t("results.paused");
  } else if (result.action === "resume") {
    tone = result.status === "connected" ? "ok" : "bad";
    text = result.status === "connected" ? t("results.resumed") : t("results.notResumed");
  } else {
    tone = result.validation?.ok ? "ok" : result.validation?.status === "not_connected" ? "neutral" : "bad";
    text = result.validation?.ok ? t("results.diagnoseOk") : result.validation?.status === "not_connected" ? t("results.diagnoseNotConnected") : t("results.diagnoseFailed");
  }
  const detail = result.validation?.detail || result.health?.detail || null;
  return (
    <div className="max-w-xs text-left md:text-right">
      <Status tone={tone} live indicator="icon" className="text-xs">
        {text}
      </Status>
      {result.status ? <p className="text-xs text-ink-3">{t("results.statusNow", { status: t(`status.${result.status}`) })}</p> : null}
      {result.health ? <p className="text-xs text-ink-3">{t("results.healthNow", { health: t(`health.${result.health.status}`) })}</p> : null}
      {detail ? <p className="text-xs break-words text-ink-3">{detail}</p> : null}
    </div>
  );
}
