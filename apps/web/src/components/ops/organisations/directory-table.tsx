import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/app/alerts/format";
import { formatDate, formatNumber } from "@/lib/format";
import { ACTIVITY_WINDOW_DAYS, DIRECTORY_EVENT_DAYS, healthTone, type OrganisationDirectoryPage } from "@/server/ops/organisations";
import { subscriptionStatusLabel, subscriptionStatusTone } from "./labels";

/** Dense directory table (stacked rows on mobile); every organisation name links to its detail page. */
export async function DirectoryTable({ page, locale, filtered }: { page: OrganisationDirectoryPage; locale: string; filtered: boolean }) {
  const t = await getTranslations("opsOrganisations");
  if (page.total === 0) {
    return <EmptyState title={filtered ? t("directory.emptyFiltered") : t("directory.empty")} description={filtered ? t("directory.emptyFilteredText") : t("directory.emptyText")} />;
  }
  const now = Date.parse(page.generatedAt);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2" aria-live="polite">
        {filtered ? t("directory.countFiltered", { count: formatNumber(page.total, locale) }) : t("directory.count", { count: formatNumber(page.total, locale) })}
        {page.suspended ? <span className="text-ink-3"> · {t("directory.suspendedCount", { count: formatNumber(page.suspended, locale) })}</span> : null}
      </p>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("directory.caption")}>
          <THead>
            <Tr>
              <Th>{t("directory.columns.organisation")}</Th>
              <Th>{t("directory.columns.plan")}</Th>
              <Th className="text-right">{t("directory.columns.members")}</Th>
              <Th className="text-right">{t("directory.columns.sites")}</Th>
              <Th className="text-right">{t("directory.columns.events")}</Th>
              <Th>{t("directory.columns.activity")}</Th>
              <Th>{t("directory.columns.health")}</Th>
              <Th>{t("directory.columns.created")}</Th>
            </Tr>
          </THead>
          <TBody>
            {page.rows.map((row) => (
              <Tr key={row.id} data-testid="ops-organisation-row">
                <Td label={t("directory.columns.organisation")}>
                  <Link href={`/ops/organisations/${row.id}`} aria-label={t("directory.open", { name: row.name })} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                    {row.name}
                  </Link>
                  <p className="font-mono text-xs text-ink-3">{row.slug}</p>
                  {row.suspendedAt ? (
                    <Status tone="bad" indicator="icon" chip className="mt-1">
                      {t("suspended.badge")}
                    </Status>
                  ) : null}
                </Td>
                <Td label={t("directory.columns.plan")}>
                  <p className="text-ink">{row.planName}</p>
                  <Badge tone={subscriptionStatusTone(row.subscriptionStatus)}>{subscriptionStatusLabel(t, row.subscriptionStatus)}</Badge>
                </Td>
                <Td label={t("directory.columns.members")} numeric>
                  {formatNumber(row.members, locale)}
                </Td>
                <Td label={t("directory.columns.sites")} numeric>
                  {formatNumber(row.sites, locale)}
                </Td>
                <Td label={t("directory.columns.events")} numeric>
                  {formatNumber(row.events30d, locale)}
                </Td>
                <Td label={t("directory.columns.activity")} className="whitespace-nowrap text-ink-2">
                  {row.lastActivityAt ? (
                    <time dateTime={row.lastActivityAt} title={formatDateTime(row.lastActivityAt, locale) ?? undefined}>
                      {formatRelative(row.lastActivityAt, locale, now)}
                    </time>
                  ) : (
                    <span className="text-ink-3">{t("directory.noActivity", { days: ACTIVITY_WINDOW_DAYS })}</span>
                  )}
                </Td>
                <Td label={t("directory.columns.health")}>
                  {row.healthScore == null ? (
                    <span className="text-sm text-ink-3">{t("common.notMeasured")}</span>
                  ) : (
                    <>
                      <Status tone={healthTone(row.healthScore)} indicator="both">
                        {formatNumber(row.healthScore, locale)}
                      </Status>
                      <p className="text-xs text-ink-3">{t("directory.healthSites", { count: formatNumber(row.healthSites, locale) })}</p>
                    </>
                  )}
                </Td>
                <Td label={t("directory.columns.created")} className="whitespace-nowrap text-ink-2">
                  <time dateTime={row.createdAt}>{formatDate(row.createdAt, locale, "short")}</time>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-ink-3">{t("directory.methods", { eventDays: DIRECTORY_EVENT_DAYS, activityDays: ACTIVITY_WINDOW_DAYS })}</p>
    </div>
  );
}
