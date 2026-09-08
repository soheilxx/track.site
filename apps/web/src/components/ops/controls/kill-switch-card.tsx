"use client";

import { OctagonX, Play, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, Field, Input, Status, Textarea, type Tone } from "@track-site/ui";
import { setGlobalKillSwitchAction, type ControlsActionState } from "@/server/ops/actions/controls";
import type { CollectorProbe, GlobalKillSwitchView } from "@/server/ops/controls";
import { ActionFeedback } from "./feedback";
import { formatDateTime } from "./format";
import { fieldErrorLabel } from "./labels";

export interface KillSwitchCardProps {
  state: GlobalKillSwitchView;
  probe: CollectorProbe;
  /** words the admin must type (STOP to engage, RESUME to release) */
  words: { engage: string; release: string };
  locale: string;
}

/**
 * Global kill switch (docs/03 §B8): the platform switch stored in the database and read by the collector
 * every 5 s, next to the live `/health` of the collector and the `KILL_SWITCH_GLOBAL` variable of this web
 * process. Engaging or releasing needs a reason and the typed word; the server checks both again and
 * writes the audit entry. The collector's live state is shown as measured — unreachable means unreachable.
 */
export function KillSwitchCard({ state, probe, words, locale }: KillSwitchCardProps) {
  const t = useTranslations("opsControls.killSwitch");
  const tc = useTranslations("opsControls");
  const router = useRouter();
  const [dialog, setDialog] = useState<"engage" | "release" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ControlsActionState | null>(null);
  const reasonId = useId();
  const wordId = useId();

  const engage = dialog === "engage";
  const word = engage ? words.engage : words.release;
  const wordMatches = confirmation.trim() === word;

  const open = (kind: "engage" | "release") => {
    setResult(null);
    setReason("");
    setConfirmation("");
    setDialog(kind);
  };

  const submit = () => {
    if (!dialog) return;
    startTransition(async () => {
      let r: ControlsActionState;
      try {
        r = await setGlobalKillSwitchAction({ engage, confirmation: confirmation.trim(), reason: reason.trim() });
      } catch {
        r = { ok: false, error: "generic" };
      }
      setResult(r);
      if (r.ok) {
        setDialog(null);
        router.refresh();
      }
    });
  };

  const collectorTone: Tone = !probe.reachable ? "bad" : probe.killSwitch === true ? "warn" : probe.ok === true ? "ok" : probe.ok === false ? "bad" : "neutral";
  const collectorText = !probe.reachable ? t("collector.unreachable") : probe.killSwitch === null ? t("collector.invalid") : probe.killSwitch ? t("collector.paused") : probe.ok ? t("collector.ok") : t("collector.degraded");

  return (
    <Card data-testid="ops-kill-switch">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ActionFeedback state={result && result.ok ? result : null} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border border-line p-4">
            <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("state.label")}</p>
            <p className="mt-2">
              <Status tone={state.engaged ? "bad" : "ok"} indicator="both" live data-testid="ops-kill-switch-state">
                {state.engaged ? t("state.engaged") : t("state.released")}
              </Status>
            </p>
            <p className="mt-2 text-xs text-ink-3">
              {t("updatedAt")}: {formatDateTime(state.updatedAt, locale) ?? tc("common.never")}
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {t("env.label")}: {state.envKillSwitch ? t("env.on") : t("env.off")}
            </p>
            <div className="mt-4">
              {state.engaged ? (
                <Button variant="primary" onClick={() => open("release")} leadingIcon={<Play className="size-4" aria-hidden="true" />} aria-haspopup="dialog" data-testid="ops-kill-switch-release">
                  {t("release")}
                </Button>
              ) : (
                <Button variant="danger" onClick={() => open("engage")} leadingIcon={<OctagonX className="size-4" aria-hidden="true" />} aria-haspopup="dialog" data-testid="ops-kill-switch-engage">
                  {t("engage")}
                </Button>
              )}
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line p-4">
            <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("collector.title")}</p>
            <p className="mt-2">
              <Status tone={collectorTone} indicator="both" data-testid="ops-collector-state">
                {collectorText}
              </Status>
            </p>
            <dl className="mt-2 space-y-1 text-xs text-ink-3">
              <div className="flex gap-2">
                <dt className="shrink-0">{t("collector.url")}:</dt>
                <dd className="min-w-0 truncate font-mono">{probe.url}</dd>
              </div>
              {probe.reachable ? (
                <>
                  <div className="flex gap-2">
                    <dt className="shrink-0">{t("collector.status")}:</dt>
                    <dd className="tabular-nums">{probe.status}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0">{t("collector.source")}:</dt>
                    <dd>{probe.source ? t(`collector.sources.${probe.source}`) : probe.killSwitch === null ? tc("common.unknown") : t("collector.sources.none")}</dd>
                  </div>
                </>
              ) : (
                <div className="flex gap-2">
                  <dt className="shrink-0">{t("collector.error")}:</dt>
                  <dd className="font-mono">{probe.error ?? tc("common.unknown")}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="shrink-0">{t("collector.checkedAt")}:</dt>
                <dd>{formatDateTime(probe.checkedAt, locale) ?? tc("common.unknown")}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={() => router.refresh()} leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}>
                {t("collector.recheck")}
              </Button>
            </div>
          </div>
        </div>
        <p className="text-sm text-ink-2">{t("effects")}</p>
        <p className="text-xs text-ink-3">{t("env.hint")}</p>
      </CardContent>

      <Dialog
        open={dialog !== null}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={engage ? t("dialog.engageTitle") : t("dialog.releaseTitle")}
        description={engage ? t("dialog.engageText") : t("dialog.releaseText")}
        closeLabel={tc("common.close")}
        size="md"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {tc("common.cancel")}
            </Button>
            <Button variant={engage ? "danger" : "primary"} loading={pending} loadingLabel={tc("common.working")} disabled={!wordMatches || reason.trim().length < 3} onClick={submit} data-testid="ops-kill-switch-confirm">
              {engage ? t("dialog.engageConfirm") : t("dialog.releaseConfirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <ActionFeedback state={result && !result.ok ? result : null} />
          <Field id={reasonId} label={t("dialog.reason")} hint={t("dialog.reasonHint")} required error={fieldErrorLabel(tc, result?.fieldErrors?.reason)}>
            {(control) => <Textarea {...control} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} data-autofocus="" />}
          </Field>
          <Field id={wordId} label={t("dialog.wordLabel", { word })} hint={t("dialog.wordHint", { word })} required error={fieldErrorLabel(tc, result?.fieldErrors?.confirmation)}>
            {(control) => <Input {...control} name="confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono uppercase" />}
          </Field>
        </div>
      </Dialog>
    </Card>
  );
}
