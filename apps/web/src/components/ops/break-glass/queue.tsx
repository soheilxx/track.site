"use client";

import { useTimeZone, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Badge, Button, Dialog, EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { approveBreakGlassAction, revokeBreakGlassAction } from "@/server/ops/actions/break-glass";
import type { BreakGlassEntry } from "@/server/ops/break-glass";
import { ActionFeedback, INITIAL_STATE } from "./feedback";
import { useAnnouncedAction, useCloseOnSuccess } from "./notice";
import { durationLabel, formatDateTime } from "./labels";

/** Open requests with approve (four eyes enforced, confirmed), decline and withdraw. */
export function ApprovalQueue({ entries, locale }: { entries: BreakGlassEntry[]; locale: string }) {
  const t = useTranslations("opsBreakGlass");
  if (entries.length === 0)
    return <EmptyState title={t("queue.empty")} description={t("queue.emptyText")} />;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
      <Table caption={t("queue.caption")}>
        <THead>
          <Tr>
            <Th>{t("queue.requestedBy")}</Th>
            <Th>{t("queue.organization")}</Th>
            <Th>{t("queue.reason")}</Th>
            <Th>{t("queue.duration")}</Th>
            <Th>{t("queue.actions")}</Th>
          </Tr>
        </THead>
        <TBody>
          {entries.map((entry) => (
            <QueueRow key={entry.id} entry={entry} locale={locale} />
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function QueueRow({ entry, locale }: { entry: BreakGlassEntry; locale: string }) {
  const t = useTranslations("opsBreakGlass");
  const timeZone = useTimeZone();
  const [approveState, approveAction, approving] = useActionState(
    useAnnouncedAction(approveBreakGlassAction),
    INITIAL_STATE,
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    useAnnouncedAction(revokeBreakGlassAction),
    INITIAL_STATE,
  );
  const [approveOpen, setApproveOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  useCloseOnSuccess(approveState, setApproveOpen);
  useCloseOnSuccess(revokeState, setRevokeOpen);
  const feedback = approveState.error || approveState.notice ? approveState : revokeState;
  const verdict = entry.viewer.approve;
  const duration = durationLabel(t, entry.minutes);
  const revokeKind = entry.viewer.revoke;
  const revokeDialog = revokeKind === "withdraw" ? "withdrawDialog" : "declineDialog";
  return (
    <Tr>
      <Td label={t("queue.requestedBy")}>
        <p className="font-medium text-ink">
          {entry.requester.name}{" "}
          {entry.viewer.isRequester ? (
            <span className="text-xs font-normal text-ink-3">({t("queue.you")})</span>
          ) : null}
        </p>
        <p className="text-xs text-ink-3">{entry.requester.email}</p>
        <p className="mt-1 text-xs text-ink-3">
          {t("queue.requestedAt")}:{" "}
          <time dateTime={entry.createdAt}>
            {formatDateTime(entry.createdAt, locale, timeZone)}
          </time>
        </p>
        {feedback.error || feedback.notice ? (
          <div className="mt-2">
            <ActionFeedback state={feedback} />
          </div>
        ) : null}
      </Td>
      <Td label={t("queue.organization")}>
        <p className="text-ink">{entry.organization.name}</p>
        <p className="text-xs text-ink-3">{entry.organization.slug}</p>
      </Td>
      <Td label={t("queue.reason")} className="max-w-md">
        <p className="whitespace-pre-wrap text-ink-2">{entry.reason}</p>
        <p className="mt-1 text-xs text-ink-3">
          {entry.ticketRef ? `${t("queue.ticket")}: ${entry.ticketRef}` : t("queue.noTicket")}
        </p>
      </Td>
      <Td label={t("queue.duration")} className="whitespace-nowrap text-ink-2">
        {duration}
      </Td>
      <Td label={t("queue.actions")}>
        <div className="flex flex-col items-start gap-2">
          {verdict ? (
            <>
              <Button
                size="sm"
                onClick={() => setApproveOpen(true)}
                aria-haspopup="dialog"
                disabled={!verdict.ok}
                data-testid="break-glass-approve"
              >
                {t("queue.approve")}
              </Button>
              {!verdict.ok ? (
                <p className="max-w-xs text-xs text-ink-3">
                  {t(
                    verdict.reason === "fourEyes"
                      ? "queue.fourEyesBlocked"
                      : "queue.ticketRequired",
                  )}
                </p>
              ) : null}
              {verdict.ok && verdict.selfApproved ? (
                <p className="max-w-xs text-xs text-ink-3">
                  <Badge tone="warn" className="mr-1">
                    {t("active.selfApproved")}
                  </Badge>
                  {t("queue.selfApprovalHint")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="max-w-xs text-xs text-ink-3">{t("queue.adminOnly")}</p>
          )}
          {revokeKind ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRevokeOpen(true)}
              aria-haspopup="dialog"
            >
              {t(revokeKind === "withdraw" ? "queue.withdraw" : "queue.decline")}
            </Button>
          ) : null}
        </div>

        {verdict?.ok ? (
          <Dialog
            open={approveOpen}
            onClose={() => setApproveOpen(false)}
            title={t("queue.approveDialog.title")}
            description={t("queue.approveDialog.description", {
              name: entry.requester.name,
              organization: entry.organization.name,
              duration,
            })}
            closeLabel={t("common.close")}
            size="sm"
          >
            {verdict.selfApproved ? (
              <p className="text-sm text-warn">{t("queue.selfApprovalHint")}</p>
            ) : null}
            <form
              action={approveAction}
              className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end"
            >
              <input type="hidden" name="grantId" value={entry.id} />
              <input type="hidden" name="confirm" value="approve" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setApproveOpen(false)}
                data-autofocus
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" loading={approving}>
                {t("queue.approveDialog.confirm")}
              </Button>
            </form>
          </Dialog>
        ) : null}

        {revokeKind ? (
          <Dialog
            open={revokeOpen}
            onClose={() => setRevokeOpen(false)}
            title={t(`queue.${revokeDialog}.title`)}
            description={t(`queue.${revokeDialog}.description`, {
              name: entry.requester.name,
              organization: entry.organization.name,
            })}
            closeLabel={t("common.close")}
            size="sm"
          >
            <form
              action={revokeAction}
              className="flex flex-col-reverse gap-2 py-2 sm:flex-row sm:justify-end"
            >
              <input type="hidden" name="grantId" value={entry.id} />
              <input type="hidden" name="confirm" value="revoke" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRevokeOpen(false)}
                data-autofocus
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="danger" loading={revoking}>
                {t(`queue.${revokeDialog}.confirm`)}
              </Button>
            </form>
          </Dialog>
        ) : null}
      </Td>
    </Tr>
  );
}
