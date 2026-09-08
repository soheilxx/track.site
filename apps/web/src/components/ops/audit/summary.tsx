import { getTranslations } from "next-intl/server";
import { Alert } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { formatNumber } from "@/lib/format";
import type { OpsAuditFilters, OpsAuditPage } from "@/server/ops/audit";

/** Counted total, the resolved organisation / actor of the filter, load time — and the honest notes on retention and redaction. */
export async function AuditSummary({ page, filters, filtered, locale }: { page: OpsAuditPage; filters: OpsAuditFilters; filtered: boolean; locale: string }) {
  const t = await getTranslations("opsAudit");
  const org = page.organization;
  const orgLine =
    org.kind === "organization" ? t("summary.organization", { name: org.name ?? t("summary.deletedOrganization", { id: org.id }) }) : null;
  const actorLine = page.actorFallback ? (page.actorFallback.name ? t("summary.actorFallback", { name: page.actorFallback.name }) : t("summary.actorUnknown", { id: page.actorFallback.id })) : null;
  return (
    <div className="space-y-3">
      {org.kind === "unknown" ? <Alert tone="warn">{t("summary.unknownOrganization", { input: org.input })}</Alert> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        <p className="font-medium text-ink">{t(filtered ? "summary.countFiltered" : "summary.count", { count: formatNumber(page.total, locale) })}</p>
        {orgLine ? <p>{orgLine}</p> : null}
        {actorLine ? <p>{actorLine}</p> : null}
        {filters.scope === "platform_wide" ? <p>{t("filters.scopes.platform_wide")}</p> : null}
        <p className="text-ink-3">{t("summary.generated", { date: formatDateTime(page.generatedAt, locale) ?? page.generatedAt })}</p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-ink-3">
        <li>{t("notes.retention", { days: formatNumber(page.retentionDays, locale) })}</li>
        <li>{t("notes.redacted")}</li>
        <li>{t("notes.appendOnly")}</li>
      </ul>
    </div>
  );
}
