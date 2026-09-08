import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { SupportInboundEventStatus } from "@track-site/db";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Status, TBody, THead, Table, Td, Th, Tr, type Tone } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/controls/format";
import { formatNumber } from "@/lib/format";
import { INBOUND_LEDGER_STALE_MS, type InboundLedgerEntry, type InboundLedgerView } from "@/server/support/settings";

/** Order of the count chips: outcomes first, the open state last. */
const STATUSES: readonly SupportInboundEventStatus[] = ["processed", "ignored", "failed", "received"];

const TONES: Record<SupportInboundEventStatus, Tone> = { processed: "ok", ignored: "neutral", failed: "bad", received: "info" };

/** Tone of a ledger row: its outcome, or `warn` for a `received` row that never got one. */
export function inboundEventTone(entry: Pick<InboundLedgerEntry, "status" | "stale">): Tone {
  return entry.stale ? "warn" : TONES[entry.status];
}

/**
 * The inbound webhook ledger (`support_inbound_events`, docs/18 §4 "Timeline and ledger" / §11): counts per
 * outcome over the window and the latest deliveries with ticket, event id and — for failures — the stored
 * error, so a failing webhook is visible to admins without the provider's dashboard. Read-only; the
 * provider retries failed deliveries itself.
 */
export async function InboundLedger({ ledger, locale }: { ledger: InboundLedgerView; locale: string }) {
  const t = await getTranslations("supportMacros.settings.overview.inbound");
  const staleMinutes = Math.round(INBOUND_LEDGER_STALE_MS / 60_000);
  const stale = ledger.entries.filter((e) => e.stale).length;
  return (
    <Card data-testid="support-inbound-ledger">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("text", { days: ledger.windowDays, limit: ledger.limit })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ledger.counts.failed > 0 ? (
          <Alert tone="bad" title={t("failedTitle", { count: ledger.counts.failed, days: ledger.windowDays })}>
            {t("failedText")}
          </Alert>
        ) : null}
        {stale > 0 ? (
          <Alert tone="warn" title={t("staleTitle", { count: stale })}>
            {t("staleText", { minutes: staleMinutes })}
          </Alert>
        ) : null}
        <ul className="flex flex-wrap gap-2" aria-label={t("countsLabel", { days: ledger.windowDays })}>
          {STATUSES.map((status) => (
            <li key={status}>
              <Status tone={ledger.counts[status] > 0 ? TONES[status] : "neutral"} chip data-testid={`support-inbound-count-${status}`}>
                {t("count", { status: t(`status.${status}`), count: formatNumber(ledger.counts[status], locale) })}
              </Status>
            </li>
          ))}
        </ul>
        {ledger.entries.length === 0 ? (
          <EmptyState title={t("empty")} description={t("emptyText")} />
        ) : (
          <div className="-mx-2">
            <Table caption={t("caption", { limit: ledger.limit })}>
              <THead>
                <Tr>
                  <Th>{t("columns.received")}</Th>
                  <Th>{t("columns.status")}</Th>
                  <Th>{t("columns.ticket")}</Th>
                  <Th>{t("columns.event")}</Th>
                  <Th>{t("columns.processed")}</Th>
                  <Th>{t("columns.error")}</Th>
                </Tr>
              </THead>
              <TBody>
                {ledger.entries.map((entry) => (
                  <Tr key={entry.id} data-testid="support-inbound-row" data-status={entry.status}>
                    <Td label={t("columns.received")}>
                      <time dateTime={entry.receivedAt} className="whitespace-nowrap">
                        {formatDateTime(entry.receivedAt, locale)}
                      </time>
                    </Td>
                    <Td label={t("columns.status")}>
                      <Status tone={inboundEventTone(entry)} indicator="both">
                        {entry.stale ? t("status.stale") : t(`status.${entry.status}`)}
                      </Status>
                    </Td>
                    <Td label={t("columns.ticket")}>
                      {entry.ticketId ? (
                        <Link href={`/ops/support/${entry.ticketId}`} className="inline-flex min-h-10 items-center font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11">
                          {entry.ticketNumber != null ? `#${entry.ticketNumber}` : t("ticketOpen")}
                        </Link>
                      ) : (
                        <span className="text-ink-3">{t("noTicket")}</span>
                      )}
                    </Td>
                    <Td label={t("columns.event")}>
                      <span className="block max-w-56 truncate font-mono text-xs text-ink-2" title={entry.providerEventId}>
                        {entry.providerEventId}
                      </span>
                      <span className="block text-xs text-ink-3">{entry.provider}</span>
                    </Td>
                    <Td label={t("columns.processed")}>{entry.processedAt ? <time dateTime={entry.processedAt}>{formatDateTime(entry.processedAt, locale)}</time> : <span className="text-ink-3">{t("noOutcome")}</span>}</Td>
                    <Td label={t("columns.error")}>{entry.error ? <span className="block max-w-md break-words font-mono text-xs text-bad">{entry.error}</span> : <span className="text-ink-3">{t("noError")}</span>}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
