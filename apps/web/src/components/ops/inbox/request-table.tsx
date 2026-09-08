import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants, type Tone } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { ticketHref, type ContactDelivery, type ContactRequestView, type InboxPage } from "@/server/ops/inbox";
import { formatDateTime, formatRelative } from "./format";

export const STATUS_TONE: Record<ContactRequestView["status"], Tone> = {
  new: "info",
  in_progress: "warn",
  done: "ok",
  spam: "neutral",
};

export const DELIVERY_TONE: Record<ContactDelivery, Tone> = {
  delivered: "ok",
  failed: "bad",
  not_sent: "neutral",
};

/** Dense request table (stacked rows on mobile): who, what, status, assignee, the ticket it became, forwarding state and the link to the detail. */
export async function RequestTable({ page, locale, filtered, now }: { page: InboxPage; locale: string; filtered: boolean; now: string }) {
  const [t, ts] = await Promise.all([getTranslations("opsInbox"), getTranslations("support")]);
  const nowMs = Date.parse(now);
  if (page.total === 0) {
    return <EmptyState title={filtered ? t("requests.emptyFiltered") : t("requests.empty")} description={filtered ? t("requests.emptyFilteredText") : t("requests.emptyText")} />;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2" aria-live="polite">
        {filtered ? t("requests.countFiltered", { count: formatNumber(page.total, locale) }) : t("requests.count", { count: formatNumber(page.total, locale) })}
      </p>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("requests.caption")}>
          <THead>
            <Tr>
              <Th>{t("requests.columns.received")}</Th>
              <Th>{t("requests.columns.kind")}</Th>
              <Th>{t("requests.columns.from")}</Th>
              <Th>{t("requests.columns.message")}</Th>
              <Th>{t("requests.columns.status")}</Th>
              <Th>{t("requests.columns.assignee")}</Th>
              <Th>{t("requests.columns.ticket")}</Th>
              <Th>{t("requests.columns.delivery")}</Th>
              <Th>{t("requests.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {page.entries.map((entry) => (
              <Tr key={entry.id} data-testid="inbox-row">
                <Td label={t("requests.columns.received")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, locale)}</time>
                  <p className="text-xs text-ink-3">{formatRelative(entry.createdAt, locale, nowMs)}</p>
                </Td>
                <Td label={t("requests.columns.kind")}>
                  <Badge tone="neutral">{t(`kinds.${entry.kind}`)}</Badge>
                </Td>
                <Td label={t("requests.columns.from")}>
                  <p className="font-medium text-ink">{entry.name}</p>
                  {entry.company ? <p className="text-xs text-ink-2">{entry.company}</p> : null}
                  <p className="text-xs text-ink-3 break-all">{entry.email}</p>
                </Td>
                <Td label={t("requests.columns.message")} className="max-w-md">
                  <p className="text-ink-2">{entry.preview}</p>
                  {entry.organization ? <p className="mt-1 text-xs text-ink-3">{entry.organization.name}</p> : null}
                </Td>
                <Td label={t("requests.columns.status")}>
                  <Status tone={STATUS_TONE[entry.status]} indicator="icon">
                    {t(`status.${entry.status}`)}
                  </Status>
                </Td>
                <Td label={t("requests.columns.assignee")}>{entry.assignee ? <span className="text-ink">{entry.assignee.name}</span> : <span className="text-ink-3">{t("common.unassigned")}</span>}</Td>
                <Td label={t("requests.columns.ticket")}>
                  {entry.ticket ? (
                    <Link href={ticketHref(entry.ticket.id)} className="inline-flex min-h-9 items-center gap-2 font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11" aria-label={t("requests.openTicketLabel", { number: entry.ticket.number })} data-testid="inbox-ticket-link">
                      <span className="font-mono text-xs">{ts("ticketNumber", { number: entry.ticket.number })}</span>
                      <Badge tone="neutral">{ts(`status.${entry.ticket.status}`)}</Badge>
                    </Link>
                  ) : (
                    <span className="text-ink-3">{t("requests.ticketNone")}</span>
                  )}
                </Td>
                <Td label={t("requests.columns.delivery")}>
                  <Status tone={DELIVERY_TONE[entry.delivery]} indicator="icon" className="text-xs">
                    {t(`delivery.${entry.delivery}`)}
                  </Status>
                </Td>
                <Td label={t("requests.columns.actions")}>
                  <Link href={`/ops/inbox/${entry.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label={t("requests.openLabel", { name: entry.name })}>
                    {t("requests.open")}
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
