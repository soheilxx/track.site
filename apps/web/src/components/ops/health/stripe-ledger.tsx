import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Alert, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { STRIPE_LEDGER_LIMIT, type StripeView } from "@/server/ops/health";
import { fmtCount, fmtDateTime, fmtRelative } from "./format";
import { Facts, HealthSection, Panel, Unknown, type Fact } from "./section";
import { STRIPE_EVENT_TONE } from "./tones";

/** The last webhook events with their processing state; payloads are never stored, so none are shown. */
export async function StripeLedger({ stripe, locale, nowMs }: { stripe: StripeView; locale: string; nowMs: number }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("states.unknown")} />;
  const s = stripe.summary;
  const facts: Fact[] = [
    {
      label: t("stripe.webhookSecret"),
      value: stripe.webhookSecretConfigured ? (
        t("stripe.configured")
      ) : (
        <Status tone="warn" indicator="icon">
          {t("stripe.missing")}
        </Status>
      ),
    },
    { label: t("stripe.received24h"), value: fmtCount(s.received24h, locale) },
    { label: t("stripe.processed24h"), value: fmtCount(s.processed24h, locale) },
    {
      label: t("stripe.failed24h"),
      value: s.failed24h > 0 ? (
        <Status tone="bad" indicator="icon">
          {fmtCount(s.failed24h, locale)}
        </Status>
      ) : (
        fmtCount(s.failed24h, locale)
      ),
    },
    { label: t("stripe.pending"), value: fmtCount(s.pendingTotal, locale) },
    {
      label: t("stripe.lastReceived"),
      value: s.lastReceivedAt ? (
        <>
          <time dateTime={s.lastReceivedAt}>{fmtDateTime(s.lastReceivedAt, locale)}</time>
          <span className="ml-1 text-xs text-ink-3">{fmtRelative(s.lastReceivedAt, locale, nowMs)}</span>
        </>
      ) : (
        unknown
      ),
    },
  ];
  return (
    <HealthSection
      id="stripe"
      title={t("stripe.title")}
      intro={t("stripe.intro", { count: STRIPE_LEDGER_LIMIT })}
      aside={stripe.configured ? null : <Status tone="neutral">{t("states.notConfigured")}</Status>}
    >
      {!stripe.configured ? <Alert tone="info">{t("stripe.notConfigured")}</Alert> : null}
      <Panel>
        <Facts items={facts} />
      </Panel>
      {stripe.rows.length === 0 ? (
        <EmptyState title={t("stripe.empty")} />
      ) : (
        <Panel>
          <Table caption={t("stripe.title")}>
            <THead>
              <Tr>
                <Th>{t("stripe.columns.event")}</Th>
                <Th>{t("stripe.columns.type")}</Th>
                <Th>{t("stripe.columns.organization")}</Th>
                <Th>{t("stripe.columns.received")}</Th>
                <Th>{t("stripe.columns.processed")}</Th>
                <Th>{t("stripe.columns.state")}</Th>
                <Th>{t("stripe.columns.error")}</Th>
              </Tr>
            </THead>
            <TBody>
              {stripe.rows.map((row) => (
                <Tr key={row.id} data-testid="ops-health-stripe-event" data-state={row.state}>
                  <Td label={t("stripe.columns.event")} className="font-mono text-xs break-all">
                    {row.id}
                  </Td>
                  <Td label={t("stripe.columns.type")} className="font-mono text-xs">
                    {row.type}
                  </Td>
                  <Td label={t("stripe.columns.organization")}>{row.organization ? row.organization.name : <span className="text-ink-3">{t("stripe.noOrganization")}</span>}</Td>
                  <Td label={t("stripe.columns.received")} className="whitespace-nowrap">
                    <time dateTime={row.receivedAt}>{fmtDateTime(row.receivedAt, locale)}</time>
                  </Td>
                  <Td label={t("stripe.columns.processed")} className="whitespace-nowrap">
                    {row.processedAt ? <time dateTime={row.processedAt}>{fmtDateTime(row.processedAt, locale)}</time> : unknown}
                  </Td>
                  <Td label={t("stripe.columns.state")}>
                    <Status tone={STRIPE_EVENT_TONE[row.state]} indicator="icon">
                      {t(`stripe.states.${row.state}`)}
                    </Status>
                  </Td>
                  <Td label={t("stripe.columns.error")}>
                    {row.error ? (
                      <details className="group">
                        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="size-3.5 transition-transform duration-[var(--motion-fast)] group-open:rotate-180" aria-hidden="true" />
                          <span className="sr-only">{t("stripe.errorFor", { id: row.id })}</span>
                          <span aria-hidden="true">{t("stripe.showError")}</span>
                        </summary>
                        <p className="mt-1 max-w-md font-mono text-xs break-words text-ink-2">{row.error}</p>
                      </details>
                    ) : (
                      <span className="text-ink-3">{t("stripe.noError")}</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}
    </HealthSection>
  );
}
