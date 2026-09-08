import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AuditFilters } from "@/components/ops/audit/filters";
import { AuditPagination } from "@/components/ops/audit/pagination";
import { AuditPresets } from "@/components/ops/audit/presets";
import { AuditSummary } from "@/components/ops/audit/summary";
import { AuditTable } from "@/components/ops/audit/table";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { isOpsAuditFiltered, loadOpsAuditPage, opsAuditQueryString, parseOpsAuditFilters } from "@/server/ops/audit";
import { checkPlatform } from "@/server/ops/platform";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("audit");
}

/**
 * Audit explorer (Track Operations, docs/17): platform-wide search over the audit log — actor, action,
 * organisation, target type, scope, time range and free text in the URL; counted totals, pages of 50,
 * redacted diffs as key lists, CSV export of the same rows. Break-glass views and operator actions are
 * ordinary entries here (quick views on top). Reads only; the export route records itself.
 */
export default async function OpsAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const q = await searchParams;
  const filters = parseOpsAuditFilters(q);
  const [t, tOps, locale] = await Promise.all([getTranslations("opsAudit"), getTranslations("ops"), getLocale()]);
  const page = await loadOpsAuditPage(access.ctx, filters);
  const filtered = isOpsAuditFiltered(filters);
  return (
    <div className="space-y-6">
      <OpsPageHeader title={tOps("pages.audit.title")} intro={t("intro")} />
      <AuditPresets filters={filters} />
      <AuditFilters filters={filters} page={page} />
      <AuditSummary page={page} filters={filters} filtered={filtered} locale={locale} />
      <AuditTable page={page} filters={filters} filtered={filtered} locale={locale} />
      <AuditPagination page={page.page} pageCount={page.pageCount} query={opsAuditQueryString(filters, 1)} />
    </div>
  );
}
