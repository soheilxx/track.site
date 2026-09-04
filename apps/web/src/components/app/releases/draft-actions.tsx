"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import { Alert, Button, Checkbox, Dialog, Input, Label, Textarea } from "@track-site/ui";
import { cancelScheduleAction, decideApprovalAction, discardDraftAction, publishDraftAction, requestApprovalAction, scheduleDraftAction, withdrawApprovalAction, type ReleaseActionState } from "@/server/actions/releases";
import { SCHEDULE_MAX_DAYS, SCHEDULE_MIN_LEAD_MINUTES, type FourEyesState } from "@/server/release-rules";
import { errorLabel } from "./labels";

const initial: ReleaseActionState = { ok: false, error: null };

export interface DraftActionsProps {
  draftId: string;
  nextVersion: number;
  environmentLabel: string;
  lintOk: boolean;
  invalid: boolean;
  scheduledAt: string | null;
  critical: boolean;
  fourEyes: { required: boolean; state: FourEyesState; publishers: number; pendingId: string | null; pendingRequestedBy: string | null };
  userId: string;
  canPublish: boolean;
  canDraft: boolean;
  /** readable change summaries shown in the confirmations (first 50) */
  changes: string[];
}

function Feedback({ state, okText }: { state: ReleaseActionState; okText: string }) {
  const t = useTranslations("releases");
  if (state.ok) return <Alert tone="ok">{okText}</Alert>;
  if (state.error) return <Alert tone="bad">{errorLabel(t, state.error)}</Alert>;
  return null;
}

function ChangeSummary({ changes }: { changes: string[] }) {
  const t = useTranslations("releases");
  if (changes.length === 0) return <p className="text-sm text-ink-3">{t("draft.noChanges")}</p>;
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius-control)] border border-line p-3 text-sm text-ink">
      {changes.slice(0, 20).map((c, i) => (
        <li key={`${i}-${c}`}>{c}</li>
      ))}
      {changes.length > 20 ? <li className="text-ink-3">…</li> : null}
    </ul>
  );
}

/** Local `datetime-local` value (no zone) for a Date, used as the input's minimum and default. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Default (in one hour) and the allowed window of the schedule input, computed once when the panel mounts. */
function scheduleBounds(): { initial: string; min: string; max: string } {
  const now = Date.now();
  return { initial: toLocalInput(new Date(now + 60 * 60_000)), min: toLocalInput(new Date(now + SCHEDULE_MIN_LEAD_MINUTES * 60_000)), max: toLocalInput(new Date(now + SCHEDULE_MAX_DAYS * 86_400_000)) };
}

/**
 * Every mutating control of the draft panel, each behind an explicit confirmation dialog. The
 * confirmation and the single-person acknowledgement travel as form fields and are re-checked by
 * the server actions; the four-eyes state decides which controls are offered, the server decides
 * whether they succeed.
 */
export function DraftActions(props: DraftActionsProps) {
  const { draftId, nextVersion, environmentLabel, lintOk, invalid, scheduledAt, critical, fourEyes, userId, canPublish, canDraft, changes } = props;
  const t = useTranslations("releases");
  const router = useRouter();
  const ids = { note: useId(), reason: useId(), schedule: useId(), ack: useId() };

  const [publishState, publish, publishing] = useActionState(publishDraftAction, initial);
  const [scheduleState, schedule, scheduling] = useActionState(scheduleDraftAction, initial);
  const [cancelState, cancelSchedule, cancelling] = useActionState(cancelScheduleAction, initial);
  const [requestState, request, requesting] = useActionState(requestApprovalAction, initial);
  const [decideState, decide, deciding] = useActionState(decideApprovalAction, initial);
  const [withdrawState, withdraw, withdrawing] = useActionState(withdrawApprovalAction, initial);
  const [discardState, discard, discarding] = useActionState(discardDraftAction, initial);

  const [dialog, setDialog] = useState<null | "publish" | "schedule" | "request" | "approve" | "reject" | "discard">(null);
  const [bounds] = useState(scheduleBounds);
  const [scheduleLocal, setScheduleLocal] = useState(bounds.initial);
  const close = () => setDialog(null);

  // close the open dialog once per successful result (state adjusted during render, no effect needed)
  const [acknowledged, setAcknowledged] = useState<ReleaseActionState[]>([]);
  const fresh = [scheduleState, requestState, decideState, discardState].filter((s) => s.ok && !acknowledged.includes(s));
  if (fresh.length) {
    setAcknowledged([...acknowledged, ...fresh]);
    setDialog(null);
  }

  useEffect(() => {
    if (publishState.ok && publishState.versionId) router.push(`/app/releases/${publishState.versionId}`);
  }, [publishState, router]);

  const done = publishState.ok || discardState.ok;
  const pendingByMe = fourEyes.pendingId !== null && fourEyes.pendingRequestedBy === userId;
  const canDecide = canPublish && fourEyes.pendingId !== null && !pendingByMe;
  const canWithdraw = fourEyes.pendingId !== null && (pendingByMe || canPublish);
  const canRequest = canDraft && fourEyes.pendingId === null && fourEyes.state !== "satisfied" && fourEyes.publishers >= 2 && lintOk && !invalid;
  const canRelease = canPublish && lintOk && !invalid;
  const singleAck = critical && fourEyes.state === "single_publisher";
  const scheduleIso = (() => {
    const ms = Date.parse(scheduleLocal);
    return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
  })();
  const minLocal = bounds.min;
  const maxLocal = bounds.max;

  return (
    <div className="space-y-3" data-testid="release-draft-actions">
      <Feedback state={publishState} okText={t("actions.publishedOk", { version: publishState.version ?? nextVersion })} />
      <Feedback state={scheduleState} okText={t("actions.scheduledOk")} />
      <Feedback state={cancelState} okText={t("actions.scheduleCancelledOk")} />
      <Feedback state={requestState} okText={t("actions.requestedOk")} />
      <Feedback state={decideState} okText={t("actions.decidedOk")} />
      <Feedback state={withdrawState} okText={t("actions.withdrawnOk")} />
      <Feedback state={discardState} okText={t("actions.discardedOk")} />

      <div className="flex flex-wrap items-center gap-2">
        {canRelease ? (
          <Button variant={critical ? "danger" : "primary"} onClick={() => setDialog("publish")} disabled={done} data-testid="release-publish">
            {t("actions.publish")}
          </Button>
        ) : null}
        {canRelease && !scheduledAt ? (
          <Button variant="secondary" onClick={() => setDialog("schedule")} disabled={done}>
            {t("actions.schedule")}
          </Button>
        ) : null}
        {canPublish && scheduledAt ? (
          <form action={cancelSchedule}>
            <input type="hidden" name="draftId" value={draftId} />
            <Button type="submit" variant="secondary" loading={cancelling} disabled={done}>
              {t("draft.schedule.cancel")}
            </Button>
          </form>
        ) : null}
        {canRequest ? (
          <Button variant="secondary" onClick={() => setDialog("request")} disabled={done}>
            {t("fourEyes.request")}
          </Button>
        ) : null}
        {canDecide ? (
          <>
            <Button variant="secondary" onClick={() => setDialog("approve")} disabled={done}>
              {t("fourEyes.approve")}
            </Button>
            <Button variant="ghost" onClick={() => setDialog("reject")} disabled={done}>
              {t("fourEyes.reject")}
            </Button>
          </>
        ) : null}
        {canWithdraw && fourEyes.pendingId ? (
          <form action={withdraw}>
            <input type="hidden" name="approvalId" value={fourEyes.pendingId} />
            <Button type="submit" variant="ghost" loading={withdrawing} disabled={done}>
              {t("fourEyes.withdraw")}
            </Button>
          </form>
        ) : null}
        {canDraft ? (
          <Button variant="ghost" onClick={() => setDialog("discard")} disabled={done}>
            {t("actions.discard")}
          </Button>
        ) : null}
      </div>
      {pendingByMe ? <p className="text-sm text-ink-3">{t("fourEyes.ownRequest")}</p> : null}

      <Dialog open={dialog === "publish"} onClose={close} title={t("actions.publishDialogTitle", { version: nextVersion, environment: environmentLabel })} description={t("actions.publishDialogText")} closeLabel={t("close")}>
        <form action={publish} className="space-y-4 py-2">
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="confirm" value="publish" />
          {critical ? <Alert tone="warn">{t("draft.criticalText")}</Alert> : null}
          <ChangeSummary changes={changes} />
          {singleAck ? <Checkbox id={ids.ack} name="acknowledgeSingle" value="1" label={t("actions.singleAcknowledge")} /> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={critical ? "danger" : "primary"} loading={publishing} data-autofocus data-testid="release-publish-confirm">
              {t("actions.publishConfirm", { version: nextVersion })}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "schedule"} onClose={close} title={t("actions.scheduleDialogTitle", { version: nextVersion, environment: environmentLabel })} description={t("actions.scheduleDialogText")} closeLabel={t("close")}>
        <form action={schedule} className="space-y-4 py-2">
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="scheduledAt" value={scheduleIso} />
          {critical ? <Alert tone="warn">{t("draft.criticalText")}</Alert> : null}
          <div className="space-y-1.5">
            <Label htmlFor={ids.schedule}>{t("actions.scheduleAt")}</Label>
            <Input id={ids.schedule} type="datetime-local" value={scheduleLocal} min={minLocal} max={maxLocal} onChange={(e) => setScheduleLocal(e.target.value)} required aria-describedby={`${ids.schedule}-hint`} />
            <p id={`${ids.schedule}-hint`} className="text-xs text-ink-3">
              {t("actions.scheduleHint", { min: SCHEDULE_MIN_LEAD_MINUTES, max: SCHEDULE_MAX_DAYS })}
            </p>
          </div>
          <ChangeSummary changes={changes} />
          {singleAck ? <Checkbox name="acknowledgeSingle" value="1" label={t("actions.singleAcknowledge")} /> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={scheduling} disabled={!scheduleIso}>
              {t("actions.scheduleConfirm")}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "request"} onClose={close} title={t("fourEyes.requestDialogTitle", { version: nextVersion })} description={t("fourEyes.requestDialogText")} closeLabel={t("close")}>
        <form action={request} className="space-y-4 py-2">
          <input type="hidden" name="draftId" value={draftId} />
          <ChangeSummary changes={changes} />
          <div className="space-y-1.5">
            <Label htmlFor={ids.note}>{t("fourEyes.requestNote")}</Label>
            <Textarea id={ids.note} name="note" rows={3} maxLength={500} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={requesting} data-autofocus>
              {t("fourEyes.request")}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "approve" || dialog === "reject"} onClose={close} title={t("fourEyes.decideDialogTitle", { version: nextVersion })} description={t("fourEyes.decideDialogText")} closeLabel={t("close")}>
        <form action={decide} className="space-y-4 py-2">
          <input type="hidden" name="approvalId" value={fourEyes.pendingId ?? ""} />
          <input type="hidden" name="decision" value={dialog === "reject" ? "reject" : "approve"} />
          <ChangeSummary changes={changes} />
          <div className="space-y-1.5">
            <Label htmlFor={ids.reason}>{t("fourEyes.reason")}</Label>
            <Textarea id={ids.reason} name="reason" rows={3} maxLength={500} required={dialog === "reject"} aria-describedby={`${ids.reason}-hint`} />
            <p id={`${ids.reason}-hint`} className="text-xs text-ink-3">
              {t("fourEyes.reasonHint")}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={dialog === "reject" ? "danger" : "primary"} loading={deciding} data-autofocus>
              {dialog === "reject" ? t("fourEyes.reject") : t("fourEyes.approve")}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "discard"} onClose={close} title={t("actions.discardDialogTitle", { version: nextVersion })} description={t("actions.discardDialogText")} closeLabel={t("close")} size="sm">
        <form action={discard} className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end">
          <input type="hidden" name="draftId" value={draftId} />
          <input type="hidden" name="confirm" value="discard" />
          <Button type="button" variant="secondary" onClick={close} data-autofocus>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="danger" loading={discarding}>
            {t("actions.discardConfirm")}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
