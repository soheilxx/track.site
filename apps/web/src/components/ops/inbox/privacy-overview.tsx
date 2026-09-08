import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants, type Tone } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { PRIVACY_DUE_SOON_DAYS, dueTone, organisationHref, type DueTone, type PrivacyOverview as Overview } from "@/server/ops/inbox";
import { formatDateTime, formatRelative } from "./format";
import { StatList } from "./stat-list";

const DUE_TONE: Record<DueTone, Tone> = { overdue: "bad", soon: "warn", later: "ok" };

/** Data subject requests per organisation: counts, overdue and next due date — no subjects, no reports. */
export async function PrivacyOverview({ overview, locale, now }: { overview: Overview; locale: string; now: string }) {
  const t = await getTranslations("opsInbox");
  const nowMs = Date.parse(now);
  if (!overview.available) return <EmptyState title={t("privacy.unavailable")} description={t("privacy.unavailableText")} />;
  const n = (v: number) => formatNumber(v, locale);
  return (
    <div className="space-y-6">
      <StatList
        label={t("privacy.totals.label")}
        items={[
          { key: "open", label: t("privacy.totals.open"), value: n(overview.totals.open) },
          { key: "overdue", label: t("privacy.totals.overdue"), value: n(overview.totals.overdue), tone: overview.totals.overdue > 0 ? "bad" : "neutral" },
          { key: "dueSoon", label: t("privacy.totals.dueSoon", { days: PRIVACY_DUE_SOON_DAYS }), value: n(overview.totals.dueSoon), tone: overview.totals.dueSoon > 0 ? "warn" : "neutral" },
          { key: "failedJobs", label: t("privacy.totals.failedJobs"), value: n(overview.totals.failedDeletionJobs), tone: overview.totals.failedDeletionJobs > 0 ? "bad" : "neutral" },
          { key: "completed", label: t("privacy.totals.completed30d"), value: n(overview.totals.completed30d) },
          { key: "rejected", label: t("privacy.totals.rejected30d"), value: n(overview.totals.rejected30d) },
          { key: "organizations", label: t("privacy.totals.organizations"), value: n(overview.totals.organizations) },
        ]}
      />

      <section aria-labelledby="privacy-kinds-title" className="space-y-2">
        <h2 id="privacy-kinds-title" className="text-base font-semibold text-ink">
          {t("privacy.byKind")}
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {overview.byKind.map((k) => (
            <li key={k.kind} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-chip)] border border-line bg-surface px-3">
              <span className="text-ink-2">{t(`privacy.kinds.${k.kind}`)}</span>
              <span className="font-medium tabular-nums text-ink">{n(k.open)}</span>
            </li>
          ))}
        </ul>
      </section>

      {overview.organizations.length === 0 ? (
        <EmptyState title={t("privacy.empty")} description={t("privacy.emptyText")} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("privacy.caption")}>
            <THead>
              <Tr>
                <Th>{t("privacy.columns.organization")}</Th>
                <Th>{t("privacy.columns.open")}</Th>
                <Th>{t("privacy.columns.overdue")}</Th>
                <Th>{t("privacy.columns.nextDue")}</Th>
                <Th>{t("privacy.columns.completed")}</Th>
                <Th>{t("privacy.columns.rejected")}</Th>
                <Th>{t("privacy.columns.failedJobs")}</Th>
                <Th>{t("privacy.columns.lastRequested")}</Th>
                <Th>{t("privacy.columns.actions")}</Th>
              </Tr>
            </THead>
            <TBody>
              {overview.organizations.map((org) => {
                const tone = org.nextDueAt ? dueTone(org.nextDueAt, nowMs) : null;
                return (
                  <Tr key={org.id} data-testid="privacy-row">
                    <Td label={t("privacy.columns.organization")}>
                      <p className="font-medium text-ink">{org.name}</p>
                      <code className="text-xs text-ink-3">{org.slug}</code>
                    </Td>
                    <Td label={t("privacy.columns.open")} numeric>
                      {n(org.open)}
                    </Td>
                    <Td label={t("privacy.columns.overdue")} numeric className={org.overdue > 0 ? "font-medium text-bad" : undefined}>
                      {n(org.overdue)}
                    </Td>
                    <Td label={t("privacy.columns.nextDue")}>
                      {org.nextDueAt && tone ? (
                        <>
                          <Status tone={DUE_TONE[tone]} indicator="icon">
                            {t(`privacy.due.${tone}`)}
                          </Status>
                          <p className="text-xs text-ink-3">
                            <time dateTime={org.nextDueAt}>{formatDateTime(org.nextDueAt, locale)}</time> · {formatRelative(org.nextDueAt, locale, nowMs)}
                          </p>
                        </>
                      ) : (
                        <span className="text-ink-3">{t("common.none")}</span>
                      )}
                    </Td>
                    <Td label={t("privacy.columns.completed")} numeric>
                      {n(org.completed)}
                    </Td>
                    <Td label={t("privacy.columns.rejected")} numeric>
                      {n(org.rejected)}
                    </Td>
                    <Td label={t("privacy.columns.failedJobs")} numeric className={org.failedDeletionJobs > 0 ? "font-medium text-bad" : undefined}>
                      {n(org.failedDeletionJobs)}
                    </Td>
                    <Td label={t("privacy.columns.lastRequested")} className="whitespace-nowrap text-ink-2">
                      {org.lastRequestedAt ? <time dateTime={org.lastRequestedAt}>{formatDateTime(org.lastRequestedAt, locale)}</time> : t("common.none")}
                    </Td>
                    <Td label={t("privacy.columns.actions")}>
                      <Link href={organisationHref(org.id)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        {t("common.openOrganization")}
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-ink-3">
        {t("privacy.tenantPath")} {t("common.aggregatesOnly")}
      </p>
    </div>
  );
}
