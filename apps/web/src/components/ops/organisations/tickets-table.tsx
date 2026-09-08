import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/ops/support/list/format";
import { PRIORITY_TONE, SLA_TONE, STATUS_TONE } from "@/components/ops/support/list/labels";
import type { TicketPage } from "@/server/support/tickets";

/** Rows the organisation page shows (the queue link below the table lists everything). */
export const ORGANISATION_TICKETS_SHOWN = 10;

/** SLA state → key of the shared vocabulary (`support.sla.*`); `met` has its own label in the queue namespace. */
const SLA_KEY: Record<TicketPage["rows"][number]["sla"]["state"], string> = { none: "noPolicy", paused: "paused", on_track: "onTrack", breached: "breached", met: "onTrack" };

/**
 * The organisation's support tickets on its detail page (docs/18 §"Integration"): the most recently updated
 * rows of the queue narrowed to the organisation — number and subject (link to the ticket), status, priority,
 * assignee, SLA state from the stored timestamps and the last update — plus the link to the full queue.
 * Metadata only: no message text, no requester e-mail beyond what the queue already shows. `null` when the
 * loader failed (the page says so instead of blanking).
 */
export async function OrganisationTicketsTable({ organizationId, page, locale }: { organizationId: string; page: TicketPage | null; locale: string }) {
  const [t, tv, tq] = await Promise.all([getTranslations("opsOrganisations.detail.tickets"), getTranslations("support"), getTranslations("supportTickets.queue.sla")]);
  // the queue's URL vocabulary (`parseTicketFilters`): `org` narrows to the organisation, `status=any` lifts the default view's open-only filter — every status, like this table
  const queueHref = `/ops/support?org=${encodeURIComponent(organizationId)}&status=any`;
  if (!page) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-3">{t("intro")}</p>
        <Alert tone="warn">{t("unavailable")}</Alert>
      </div>
    );
  }
  const rows = page.rows.slice(0, ORGANISATION_TICKETS_SHOWN);
  const nowMs = Date.parse(page.generatedAt);
  return (
    <div className="space-y-3" data-testid="ops-organisation-tickets">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-3">{t("intro")}</p>
        <Link href={queueHref} className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="ops-organisation-tickets-all">
          {t("all")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {page.total === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyText")} />
      ) : (
        <>
          <p className="text-sm text-ink-2 tabular-nums">{t("count", { count: page.total, shown: rows.length })}</p>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
            <Table caption={t("caption")}>
              <THead>
                <Tr>
                  <Th>{t("columns.number")}</Th>
                  <Th>{t("columns.subject")}</Th>
                  <Th>{t("columns.status")}</Th>
                  <Th>{t("columns.priority")}</Th>
                  <Th>{t("columns.assignee")}</Th>
                  <Th>{t("columns.sla")}</Th>
                  <Th>{t("columns.updated")}</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <Tr key={row.id} data-testid="ops-organisation-ticket-row">
                    <Td label={t("columns.number")} className="whitespace-nowrap">
                      <Link href={`/ops/support/${row.id}`} className="inline-flex min-h-9 items-center font-mono text-xs font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11" aria-label={t("openLabel", { number: row.number, subject: row.subject })}>
                        {tv("ticketNumber", { number: row.number })}
                      </Link>
                    </Td>
                    <Td label={t("columns.subject")} className="max-w-md">
                      <span className="line-clamp-2 text-ink">{row.subject}</span>
                    </Td>
                    <Td label={t("columns.status")}>
                      <Status tone={STATUS_TONE[row.status]} indicator="icon">
                        {tv(`status.${row.status}`)}
                      </Status>
                    </Td>
                    <Td label={t("columns.priority")}>
                      <Status tone={PRIORITY_TONE[row.priority]} indicator="icon">
                        {tv(`priority.${row.priority}`)}
                      </Status>
                    </Td>
                    <Td label={t("columns.assignee")}>{row.assignee ? <span className="text-ink">{row.assignee.name}</span> : <span className="text-ink-3">{t("unassigned")}</span>}</Td>
                    <Td label={t("columns.sla")}>
                      <Status tone={SLA_TONE[row.sla.state]} indicator="icon" className="text-xs">
                        {row.sla.state === "met" ? tq("met") : tv(`sla.${SLA_KEY[row.sla.state]}`)}
                      </Status>
                      {row.sla.dueAt && row.sla.state !== "met" ? (
                        <p className="mt-0.5 text-xs text-ink-3">
                          <time dateTime={row.sla.dueAt}>{formatDateTime(row.sla.dueAt, locale)}</time>
                        </p>
                      ) : null}
                    </Td>
                    <Td label={t("columns.updated")} className="whitespace-nowrap text-ink-2">
                      <time dateTime={row.updatedAt}>{formatDateTime(row.updatedAt, locale)}</time>
                      <p className="text-xs text-ink-3">{formatRelative(row.updatedAt, locale, nowMs)}</p>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
