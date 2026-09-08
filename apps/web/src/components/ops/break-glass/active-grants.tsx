"use client";

import { ExternalLink } from "lucide-react";
import { useTimeZone, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Status,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@track-site/ui";
import {
  openTenantDashboardAction,
  revokeBreakGlassAction,
} from "@/server/ops/actions/break-glass";
import type { BreakGlassEntry } from "@/server/ops/break-glass";
import { Countdown } from "./countdown";
import { ActionFeedback, INITIAL_STATE } from "./feedback";
import { useAnnouncedAction, useCloseOnSuccess } from "./notice";
import { formatDateTime } from "./labels";

/** Active grants with countdown, "open dashboard" for the grantee and revoke (confirmed) for grantee, approver and admins. */
export function ActiveGrants({
  entries,
  locale,
  now,
}: {
  entries: BreakGlassEntry[];
  locale: string;
  now: string;
}) {
  const t = useTranslations("opsBreakGlass");
  if (entries.length === 0)
    return <EmptyState title={t("active.empty")} description={t("active.emptyText")} />;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
      <Table caption={t("active.caption")}>
        <THead>
          <Tr>
            <Th>{t("active.operator")}</Th>
            <Th>{t("active.organization")}</Th>
            <Th>{t("active.window")}</Th>
            <Th>{t("active.actions")}</Th>
          </Tr>
        </THead>
        <TBody>
          {entries.map((entry) => (
            <ActiveRow key={entry.id} entry={entry} locale={locale} now={now} />
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function ActiveRow({
  entry,
  locale,
  now,
}: {
  entry: BreakGlassEntry;
  locale: string;
  now: string;
}) {
  const t = useTranslations("opsBreakGlass");
  const timeZone = useTimeZone();
  const [revokeState, revokeAction, revoking] = useActionState(
    useAnnouncedAction(revokeBreakGlassAction),
    INITIAL_STATE,
  );
  const [openState, openAction, opening] = useActionState(openTenantDashboardAction, INITIAL_STATE);
  const [revokeOpen, setRevokeOpen] = useState(false);
  useCloseOnSuccess(revokeState, setRevokeOpen);
  const feedback = openState.error ? openState : revokeState;
  return (
    <Tr>
      <Td label={t("active.operator")}>
        <p className="font-medium text-ink">
          {entry.requester.name}{" "}
          {entry.viewer.isRequester ? (
            <span className="text-xs font-normal text-ink-3">({t("queue.you")})</span>
          ) : null}
        </p>
        <p className="text-xs text-ink-3">{entry.requester.email}</p>
        <p className="mt-1 text-xs text-ink-3">
          {entry.selfApproved ? (
            <Badge tone="warn">{t("active.selfApproved")}</Badge>
          ) : entry.approver ? (
            t("active.approvedBy", { name: entry.approver.name })
          ) : null}
          {entry.ticketRef ? (
            <span className="ml-2">{t("active.ticket", { ticket: entry.ticketRef })}</span>
          ) : null}
        </p>
        {feedback.error || feedback.notice ? (
          <div className="mt-2">
            <ActionFeedback state={feedback} />
          </div>
        ) : null}
      </Td>
      <Td label={t("active.organization")}>
        <p className="text-ink">{entry.organization.name}</p>
        <p className="text-xs text-ink-3">{entry.organization.slug}</p>
        <p className="mt-1 max-w-sm text-xs whitespace-pre-wrap text-ink-3">{entry.reason}</p>
      </Td>
      <Td label={t("active.window")}>
        <p className="text-ink-2">
          <time dateTime={entry.endsAt}>
            {t("active.until", { until: formatDateTime(entry.endsAt, locale, timeZone) })}
          </time>
        </p>
        <Countdown endsAt={entry.endsAt} now={now} />
        <p className="mt-1">
          <Status
            tone={entry.customerNotifiedAt ? "ok" : "warn"}
            indicator="icon"
            className="text-xs"
          >
            {entry.customerNotifiedAt ? t("active.notified") : t("active.notNotified")}
          </Status>
        </p>
        <p className="mt-1 text-xs text-ink-3">
          <code className="break-all">{entry.id}</code>
        </p>
      </Td>
      <Td label={t("active.actions")}>
        <div className="flex flex-col items-start gap-2">
          {entry.viewer.open ? (
            <form action={openAction}>
              <input type="hidden" name="grantId" value={entry.id} />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={opening}
                leadingIcon={<ExternalLink className="size-4" aria-hidden="true" />}
                data-testid="break-glass-open"
              >
                {t("active.open")}
              </Button>
            </form>
          ) : null}
          {entry.viewer.revoke === "revoke" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRevokeOpen(true)}
              aria-haspopup="dialog"
              data-testid="break-glass-revoke"
            >
              {t("active.revoke")}
            </Button>
          ) : null}
        </div>
        {entry.viewer.revoke === "revoke" ? (
          <Dialog
            open={revokeOpen}
            onClose={() => setRevokeOpen(false)}
            title={t("active.revokeDialog.title")}
            description={t("active.revokeDialog.description", {
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
                {t("active.revokeDialog.confirm")}
              </Button>
            </form>
          </Dialog>
        ) : null}
      </Td>
    </Tr>
  );
}
