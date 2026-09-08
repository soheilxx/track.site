import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { PortalTicketRow } from "@/server/support/portal";
import { formatDateTime } from "./format";
import { categoryLabel, priorityTone, statusTone, vocabLabel } from "./labels";

/** The organisation's tickets, newest activity first; rows stack on small screens (`Td label`). */
export async function TicketTable({ tickets, locale }: { tickets: PortalTicketRow[]; locale: string }) {
  const [t, tVocab] = await Promise.all([getTranslations("supportPortal"), getTranslations("support")]);
  return (
    <Table caption={t("list.caption")}>
      <THead>
        <Tr>
          <Th>{t("list.columns.number")}</Th>
          <Th>{t("list.columns.subject")}</Th>
          <Th>{t("list.columns.status")}</Th>
          <Th>{t("list.columns.priority")}</Th>
          <Th>{t("list.columns.category")}</Th>
          <Th>{t("list.columns.requester")}</Th>
          <Th>{t("list.columns.updated")}</Th>
        </Tr>
      </THead>
      <TBody>
        {tickets.map((ticket) => {
          const number = tVocab("ticketNumber", { number: ticket.number });
          const lastAgent = ticket.lastAgentMessageAt && (!ticket.lastCustomerMessageAt || ticket.lastAgentMessageAt.getTime() >= ticket.lastCustomerMessageAt.getTime());
          return (
            <Tr key={ticket.id}>
              <Td label={t("list.columns.number")} className="whitespace-nowrap font-mono text-ink-2">
                {number}
              </Td>
              <Td label={t("list.columns.subject")}>
                <Link href={`/app/support/${ticket.id}`} aria-label={t("list.open", { number })} className="inline-flex min-h-11 items-center rounded-sm py-1 font-medium text-ink underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:min-h-0" data-testid="support-ticket-link">
                  {ticket.subject}
                </Link>
                {ticket.mergedIntoId ? <span className="block text-xs text-ink-3">{tVocab("eventKind.merged")}</span> : null}
              </Td>
              <Td label={t("list.columns.status")}>
                <Status tone={statusTone(ticket.status)} chip>
                  {vocabLabel(tVocab, "status", ticket.status)}
                </Status>
              </Td>
              <Td label={t("list.columns.priority")}>
                <Badge tone={priorityTone(ticket.priority)}>{vocabLabel(tVocab, "priority", ticket.priority)}</Badge>
              </Td>
              <Td label={t("list.columns.category")} className="text-ink-2">
                {categoryLabel(t, ticket.category)}
              </Td>
              <Td label={t("list.columns.requester")} className="text-ink-2">
                {ticket.requesterName ?? ticket.requesterEmail}
              </Td>
              <Td label={t("list.columns.updated")} className="whitespace-nowrap text-ink-2">
                <time dateTime={ticket.updatedAt.toISOString()}>{formatDateTime(ticket.updatedAt, locale)}</time>
                <span className="block text-xs text-ink-3">{ticket.satisfactionScore !== null ? t("list.rated", { score: ticket.satisfactionScore }) : lastAgent ? t("list.lastFromAgent") : ticket.lastCustomerMessageAt ? t("list.lastFromYou") : t("common.none")}</span>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
