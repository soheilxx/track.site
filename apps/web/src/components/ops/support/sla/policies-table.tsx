"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Dialog, EmptyState, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import type { SlaPolicyView } from "@/app/ops/support/settings/sla/queries";
import { deleteSlaPolicyAction, setDefaultSlaPolicyAction, type SupportSlaActionState } from "@/server/ops/actions/support-sla";
import { SLA_PATHS } from "./constants";
import { SlaActionFeedback } from "./feedback";
import { businessHoursSummary, formatBusinessMinutes } from "./format";
import { planLabel } from "./labels";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;

type DialogState = { kind: "delete" | "default"; policy: SlaPolicyView } | null;

export interface PoliciesTableProps {
  policies: SlaPolicyView[];
  locale: string;
}

/**
 * Policy list with the row actions. The notice lives above the table (a deleted row leaves the page
 * together with the action result, so a row-level notice would never be seen — docs/17 §"Browser pass").
 */
export function PoliciesTable({ policies, locale }: PoliciesTableProps) {
  const t = useTranslations("supportSla");
  const ts = useTranslations("support");
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<SupportSlaActionState | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!dialog) return;
    const { kind, policy } = dialog;
    startTransition(async () => {
      let result: SupportSlaActionState;
      try {
        result = kind === "delete" ? await deleteSlaPolicyAction({ id: policy.id, confirmed: true }) : await setDefaultSlaPolicyAction({ id: policy.id, confirmed: true });
      } catch {
        result = { ok: false, error: "generic", notice: null };
      }
      setNotice(result);
      setDialog(null);
      if (result.ok) router.refresh();
    });
  };

  if (!policies.length) {
    return (
      <div className="space-y-4">
        <SlaActionFeedback state={notice} />
        <EmptyState
          title={t("empty.title")}
          description={t("empty.text")}
          action={
            <Link href={SLA_PATHS.create} className={buttonVariants()}>
              <Plus className="size-4" aria-hidden="true" />
              {t("nav.new")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite" data-testid="ops-sla-notice">
        <SlaActionFeedback state={notice} />
      </div>
      <Table caption={t("table.caption")} data-testid="ops-sla-policies">
        <THead>
          <Tr>
            <Th>{t("table.name")}</Th>
            <Th>{t("table.plans")}</Th>
            <Th>{t("table.targets")}</Th>
            <Th>{t("table.hours")}</Th>
            <Th>{t("table.escalation")}</Th>
            <Th className="text-right">{t("table.tickets")}</Th>
            <Th>
              <span className="sr-only">{t("table.actions")}</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {policies.map((policy) => {
            const hours = businessHoursSummary(policy.businessHours, locale);
            return (
              <Tr key={policy.id} data-testid={`ops-sla-policy-${policy.id}`}>
                <Td label={t("table.name")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={SLA_PATHS.edit(policy.id)} className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      {policy.name}
                    </Link>
                    {policy.isDefault ? <Badge tone="info">{t("table.defaultBadge")}</Badge> : null}
                  </div>
                  {policy.description ? <p className="mt-1 max-w-xs text-xs text-ink-3">{policy.description}</p> : null}
                </Td>
                <Td label={t("table.plans")}>{policy.planIds?.length ? policy.planIds.map((p) => planLabel(t, p)).join(", ") : policy.isDefault ? t("table.allPlans") : t("table.noPlans")}</Td>
                <Td label={t("table.targets")}>
                  <ul className="space-y-0.5 text-xs">
                    {PRIORITIES.map((priority) => {
                      const entry = policy.priorities[priority];
                      return (
                        <li key={priority}>
                          <span className="text-ink-3">{ts(`priority.${priority}`)}:</span> {entry ? `${formatBusinessMinutes(entry.first_response_minutes, locale)} / ${formatBusinessMinutes(entry.resolution_minutes, locale)}` : ts("sla.noPolicy")}
                        </li>
                      );
                    })}
                  </ul>
                </Td>
                <Td label={t("table.hours")}>
                  {hours.length ? (
                    <ul className="space-y-0.5 text-xs">
                      {hours.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs">{t("table.alwaysOpen")}</span>
                  )}
                  <p className="mt-1 font-mono text-xs text-ink-3">{policy.businessHours.timezone}</p>
                </Td>
                <Td label={t("table.escalation")}>
                  <ul className="space-y-0.5 text-xs">
                    <li>{t("table.warningAt", { percent: policy.escalation.warningPercent })}</li>
                    <li>{policy.escalation.escalateToAdmins ? t("table.escalatesToAdmins") : t("table.noAdminEscalation")}</li>
                    <li>{t("table.recipients", { count: policy.escalation.notifyUserIds.length })}</li>
                    <li>{policy.escalation.autoCloseDays === null ? t("table.autoCloseNever") : t("table.autoClose", { count: policy.escalation.autoCloseDays })}</li>
                  </ul>
                </Td>
                <Td label={t("table.tickets")} numeric>
                  {policy.ticketCount.toLocaleString(locale)}
                </Td>
                <Td label={t("table.actions")}>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Link href={SLA_PATHS.edit(policy.id)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      {t("common.edit")}
                    </Link>
                    <Button variant="ghost" size="sm" disabled={policy.isDefault} onClick={() => setDialog({ kind: "default", policy })} aria-haspopup="dialog">
                      {t("actions.setDefault")}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={policy.isDefault} onClick={() => setDialog({ kind: "delete", policy })} aria-haspopup="dialog" className="text-bad hover:text-bad">
                      {t("common.delete")}
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>

      <Dialog
        open={dialog !== null}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={dialog?.kind === "delete" ? t("actions.deleteTitle", { name: dialog.policy.name }) : t("actions.setDefaultTitle", { name: dialog?.policy.name ?? "" })}
        description={dialog?.kind === "delete" ? (dialog.policy.ticketCount > 0 ? t("actions.deleteBlockedInUse", { count: dialog.policy.ticketCount }) : t("actions.deleteText")) : t("actions.setDefaultText")}
        closeLabel={t("common.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant={dialog?.kind === "delete" ? "danger" : "primary"} loading={pending} loadingLabel={t("common.working")} disabled={dialog?.kind === "delete" && dialog.policy.ticketCount > 0} onClick={confirm} data-testid="ops-sla-dialog-confirm">
              {dialog?.kind === "delete" ? t("actions.deleteConfirm") : t("actions.setDefaultConfirm")}
            </Button>
          </>
        }
      />
    </div>
  );
}
