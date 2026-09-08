"use client";

import { Eye, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Badge, Checkbox, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, VisuallyHidden, cn } from "@track-site/ui";
import type { SupportOperator, TicketRow } from "@/server/support/tickets";
import { OperatorAvatar } from "./avatar";
import { BulkActions } from "./bulk-actions";
import { formatDateTime, formatRelative } from "./format";
import { PRIORITY_TONE, SLA_TONE, STATUS_TONE } from "./labels";

/**
 * Dense ticket table (stacked rows on mobile) with row selection for the bulk toolbar. Every row shows the
 * number and subject (link to the ticket), requester + organisation + plan, status and priority chips, the
 * assignee, the SLA state with its countdown from the stored due time, the last update and presence dots of
 * the operators looking at the ticket right now. Colour never carries a state alone.
 */
export function TicketList({ rows, total, filtered, locale, now, operators, selfId, canAssign, canWrite }: { rows: TicketRow[]; total: number; filtered: boolean; locale: string; now: string; operators: SupportOperator[]; selfId: string; canAssign: boolean; canWrite: boolean }) {
  const t = useTranslations("supportTickets.queue");
  const te = useTranslations("supportTickets");
  const tv = useTranslations("support");
  const nowMs = Date.parse(now);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const visibleSelected = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && visibleSelected.length === rows.length;
  const someSelected = visibleSelected.length > 0 && !allSelected;
  const bulkAllowed = canAssign || canWrite;

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());

  if (total === 0) {
    return <EmptyState title={filtered ? t("emptyFiltered") : t("empty")} description={filtered ? t("emptyFilteredText") : t("emptyText")} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2" aria-live="polite">
        {filtered ? t("countFiltered", { count: total }) : t("count", { count: total })}
      </p>
      {bulkAllowed && visibleSelected.length > 0 ? <BulkActions selectedIds={visibleSelected} operators={operators} selfId={selfId} canAssign={canAssign} canWrite={canWrite} onDone={() => setSelected(new Set())} /> : null}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("caption")}>
          <THead>
            <Tr>
              {bulkAllowed ? (
                <Th className="w-12">
                  <Checkbox checked={allSelected} indeterminate={someSelected} onChange={(e) => toggleAll(e.target.checked)} label={<VisuallyHidden>{t("selectAll")}</VisuallyHidden>} data-testid="support-select-all" />
                </Th>
              ) : null}
              <Th>{t("columns.ticket")}</Th>
              <Th>{t("columns.requester")}</Th>
              <Th>{t("columns.status")}</Th>
              <Th>{t("columns.priority")}</Th>
              <Th>{t("columns.assignee")}</Th>
              <Th>{t("columns.sla")}</Th>
              <Th>{t("columns.updated")}</Th>
              <Th>{t("columns.viewers")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              const dueRelative = row.sla.dueAt ? formatRelative(row.sla.dueAt, locale, nowMs) : null;
              return (
                <Tr key={row.id} data-testid="support-ticket-row" className={cn(isSelected && "bg-primary-soft/40 hover:bg-primary-soft/50")}>
                  {bulkAllowed ? (
                    <Td label={t("columns.select")}>
                      <Checkbox checked={isSelected} onChange={(e) => toggle(row.id, e.target.checked)} label={<VisuallyHidden>{t("selectOne", { number: row.number })}</VisuallyHidden>} />
                    </Td>
                  ) : null}
                  <Td label={t("columns.ticket")} className="max-w-md">
                    <Link href={`/ops/support/${row.id}`} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                      <span className="font-mono text-xs text-ink-3">{tv("ticketNumber", { number: row.number })}</span>
                      <span className="ml-2 line-clamp-2">{row.subject || te("common.noSubject")}</span>
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge tone="neutral">{tv(`channel.${row.channel}`)}</Badge>
                      {row.tags.map((tag) => (
                        <Badge key={tag} tone="neutral" className="font-mono">
                          {tag}
                        </Badge>
                      ))}
                      {row.mergedIntoId ? <Badge tone="info">{t("merged")}</Badge> : null}
                    </div>
                  </Td>
                  <Td label={t("columns.requester")}>
                    <p className="font-medium text-ink">{row.requester.name ?? t("requesterUnknown")}</p>
                    <p className="text-xs text-ink-3 break-all">{row.requester.email}</p>
                    {row.organization ? (
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                        <Link href={`/ops/organisations/${row.organization.id}`} className="inline-flex min-h-6 items-center rounded-[var(--radius-control-sm)] text-ink-2 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                          {row.organization.name}
                        </Link>
                        {row.planName ? <Badge tone="neutral">{row.planName}</Badge> : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-3">{t("noOrganisation")}</p>
                    )}
                  </Td>
                  <Td label={t("columns.status")}>
                    <Status tone={STATUS_TONE[row.status]} indicator="icon" chip>
                      {tv(`status.${row.status}`)}
                    </Status>
                  </Td>
                  <Td label={t("columns.priority")}>
                    <Status tone={PRIORITY_TONE[row.priority]} indicator="dot">
                      {tv(`priority.${row.priority}`)}
                    </Status>
                  </Td>
                  <Td label={t("columns.assignee")}>
                    {row.assignee ? (
                      <span className="inline-flex items-center gap-2">
                        <OperatorAvatar name={row.assignee.name} />
                        <span className="text-ink">{row.assignee.id === selfId ? te("common.you") : row.assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-ink-3">{te("common.unassigned")}</span>
                    )}
                  </Td>
                  <Td label={t("columns.sla")}>
                    <Status tone={SLA_TONE[row.sla.state]} indicator="icon" chip>
                      {row.sla.state === "met" ? t("sla.met") : tv(`sla.${SLA_KEY[row.sla.state]}`)}
                    </Status>
                    {row.sla.phase && row.sla.dueAt ? (
                      <p className="mt-1 text-xs text-ink-3">
                        {tv(`sla.${row.sla.phase === "first_response" ? "firstResponse" : "resolution"}`)}
                        {" · "}
                        <time dateTime={row.sla.dueAt} title={formatDateTime(row.sla.dueAt, locale) ?? undefined}>
                          {row.sla.state === "paused" ? t("sla.dueWhenResumed") : Date.parse(row.sla.dueAt) < nowMs ? t("sla.overdue", { when: dueRelative ?? "" }) : t("sla.due", { when: dueRelative ?? "" })}
                        </time>
                      </p>
                    ) : null}
                  </Td>
                  <Td label={t("columns.updated")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={row.updatedAt} title={formatDateTime(row.updatedAt, locale) ?? undefined}>
                      {formatRelative(row.updatedAt, locale, nowMs)}
                    </time>
                    <p className="text-xs text-ink-3">{t("created", { when: formatRelative(row.createdAt, locale, nowMs) ?? "" })}</p>
                  </Td>
                  <Td label={t("columns.viewers")}>
                    {row.viewers.length ? (
                      <ul className="flex items-center -space-x-1" aria-label={t("viewersLabel", { count: row.viewers.length })}>
                        {row.viewers.map((viewer) => (
                          <li key={viewer.id} className="relative">
                            <OperatorAvatar name={viewer.name} size="sm" className="ring-2 ring-surface" title={viewer.mode === "typing" ? t("presence.typing", { name: viewer.name }) : t("presence.viewing", { name: viewer.name })} />
                            {viewer.mode === "typing" ? <PenLine className="absolute -right-1 -bottom-1 size-3 rounded-full bg-surface text-warn" aria-hidden="true" /> : <Eye className="absolute -right-1 -bottom-1 size-3 rounded-full bg-surface text-ok" aria-hidden="true" />}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-ink-3">{te("common.none")}</span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

/** SLA state → key of the shared vocabulary (`support.sla.*`); `met` has its own label in this namespace. */
const SLA_KEY: Record<TicketRow["sla"]["state"], string> = { none: "noPolicy", paused: "paused", on_track: "onTrack", breached: "breached", met: "onTrack" };
