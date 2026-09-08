import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { organisationHref, type AlertDigest as Digest } from "@/server/ops/inbox";
import { formatDateTime, formatRelative } from "./format";
import { StatList } from "./stat-list";

/** Alert events of the window grouped by kind, then by organisation and kind (counts and timestamps only). */
export async function AlertDigest({ digest, locale, now }: { digest: Digest; locale: string; now: string }) {
  const t = await getTranslations("opsInbox");
  const nowMs = Date.parse(now);
  if (!digest.available) return <EmptyState title={t("alerts.unavailable")} description={t("alerts.unavailableText")} />;
  const n = (v: number) => formatNumber(v, locale);
  if (digest.rows.length === 0) return <EmptyState title={t("alerts.empty", { days: digest.windowDays })} description={t("alerts.emptyText")} />;
  return (
    <div className="space-y-6">
      <StatList
        label={t("alerts.totals.label", { days: digest.windowDays })}
        items={[
          { key: "events", label: t("alerts.totals.events"), value: n(digest.totals.events) },
          { key: "open", label: t("alerts.totals.open"), value: n(digest.totals.open), tone: digest.totals.open > 0 ? "warn" : "neutral" },
          { key: "critical", label: t("alerts.totals.critical"), value: n(digest.totals.critical), tone: digest.totals.critical > 0 ? "bad" : "neutral" },
          { key: "organizations", label: t("alerts.totals.organizations"), value: n(digest.totals.organizations) },
        ]}
      />

      <section aria-labelledby="alert-kinds-title" className="space-y-3">
        <h2 id="alert-kinds-title" className="text-base font-semibold text-ink">
          {t("alerts.byKind")}
        </h2>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("alerts.captionKinds")}>
            <THead>
              <Tr>
                <Th>{t("alerts.columns.kind")}</Th>
                <Th>{t("alerts.columns.total")}</Th>
                <Th>{t("alerts.columns.open")}</Th>
                <Th>{t("alerts.columns.critical")}</Th>
              </Tr>
            </THead>
            <TBody>
              {digest.byKind.map((k) => (
                <Tr key={k.kind}>
                  <Td label={t("alerts.columns.kind")} className="font-medium text-ink">
                    {t(`alerts.kinds.${k.kind}`)}
                  </Td>
                  <Td label={t("alerts.columns.total")} numeric>
                    {n(k.total)}
                  </Td>
                  <Td label={t("alerts.columns.open")} numeric className={k.open > 0 ? "font-medium text-warn" : undefined}>
                    {n(k.open)}
                  </Td>
                  <Td label={t("alerts.columns.critical")} numeric className={k.critical > 0 ? "font-medium text-bad" : undefined}>
                    {n(k.critical)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="alert-orgs-title" className="space-y-3">
        <h2 id="alert-orgs-title" className="text-base font-semibold text-ink">
          {t("alerts.byOrganization")}
        </h2>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("alerts.caption")}>
            <THead>
              <Tr>
                <Th>{t("alerts.columns.organization")}</Th>
                <Th>{t("alerts.columns.kind")}</Th>
                <Th>{t("alerts.columns.total")}</Th>
                <Th>{t("alerts.columns.open")}</Th>
                <Th>{t("alerts.columns.critical")}</Th>
                <Th>{t("alerts.columns.warning")}</Th>
                <Th>{t("alerts.columns.last")}</Th>
                <Th>{t("alerts.columns.actions")}</Th>
              </Tr>
            </THead>
            <TBody>
              {digest.rows.map((row) => (
                <Tr key={`${row.organizationId}-${row.kind}`} data-testid="alert-digest-row">
                  <Td label={t("alerts.columns.organization")}>
                    {row.name ? (
                      <>
                        <p className="font-medium text-ink">{row.name}</p>
                        <code className="text-xs text-ink-3">{row.slug}</code>
                      </>
                    ) : (
                      <span className="text-ink-3">{t("alerts.organizationDeleted")}</span>
                    )}
                  </Td>
                  <Td label={t("alerts.columns.kind")}>{t(`alerts.kinds.${row.kind}`)}</Td>
                  <Td label={t("alerts.columns.total")} numeric>
                    {n(row.total)}
                  </Td>
                  <Td label={t("alerts.columns.open")}>
                    {row.open > 0 ? (
                      <Status tone="warn" indicator="icon">
                        {n(row.open)}
                      </Status>
                    ) : (
                      <span className="tabular-nums text-ink-3">{n(0)}</span>
                    )}
                  </Td>
                  <Td label={t("alerts.columns.critical")} numeric className={row.critical > 0 ? "font-medium text-bad" : undefined}>
                    {n(row.critical)}
                  </Td>
                  <Td label={t("alerts.columns.warning")} numeric>
                    {n(row.warning)}
                  </Td>
                  <Td label={t("alerts.columns.last")} className="whitespace-nowrap text-ink-2">
                    {row.lastTriggeredAt ? (
                      <>
                        <time dateTime={row.lastTriggeredAt}>{formatDateTime(row.lastTriggeredAt, locale)}</time>
                        <p className="text-xs text-ink-3">{formatRelative(row.lastTriggeredAt, locale, nowMs)}</p>
                      </>
                    ) : (
                      t("common.none")
                    )}
                  </Td>
                  <Td label={t("alerts.columns.actions")}>
                    {row.name ? (
                      <Link href={organisationHref(row.organizationId)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        {t("common.openOrganization")}
                      </Link>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </section>
      <p className="text-xs text-ink-3">{t("common.aggregatesOnly")}</p>
    </div>
  );
}
