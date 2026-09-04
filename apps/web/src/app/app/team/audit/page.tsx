import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { RETENTION_DEFAULT_DAYS } from "@track-site/db";
import { Banner, EmptyState, buttonVariants } from "@track-site/ui";
import { AuditFilters } from "@/components/app/team/audit-filters";
import { AuditPagination } from "@/components/app/team/audit-pagination";
import { AuditTable } from "@/components/app/team/audit-table";
import { TeamPageHeader } from "@/components/app/team/page-header";
import { requireOrgContext } from "@/server/session";
import { auditQueryString, loadAuditLog, loadMemberNames, loadTeamEntitlements, parseAuditFilters } from "@/server/team";

/**
 * Audit log (supplement §5 "vollständiges Audit Log"): every recorded change of the organization
 * with filters in the URL, redacted diffs and honest limits — plans without the full audit log see
 * the last 90 days and are told so; roles without `audit.read` see why they cannot look.
 */
export default async function TeamAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("members.read");
  const [t, locale] = await Promise.all([getTranslations("team"), getLocale()]);
  if (!can(ctx.role, "audit.read")) {
    return (
      <div className="space-y-6">
        <TeamPageHeader title={t("audit.title")} intro={t("audit.intro")} />
        <EmptyState title={t("audit.noPermission")} description={t("audit.noPermissionText")} />
      </div>
    );
  }
  const filters = parseAuditFilters(q);
  const [entitlements, names] = await Promise.all([loadTeamEntitlements(ctx), loadMemberNames(ctx)]);
  const page = await loadAuditLog(ctx, filters, entitlements, names);
  const filtered = filters.category !== "all" || Boolean(filters.actor || filters.targetType || filters.q || filters.from || filters.to);
  const limited = page.window.limitedByPlan && page.window.windowDays != null;
  // the audit log retention of the privacy module (730 days); the fallback only satisfies the record type
  const auditRetentionDays = RETENTION_DEFAULT_DAYS.audit_log ?? 730;
  return (
    <div className="space-y-6">
      <TeamPageHeader title={t("audit.title")} intro={t("audit.intro")} />
      <Banner
        tone={limited ? "info" : "neutral"}
        action={
          limited ? (
            <Link href="/app/billing" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("audit.comparePlans")}
            </Link>
          ) : undefined
        }
      >
        {limited ? t("audit.windowLimited", { days: page.window.windowDays ?? 0, plan: entitlements.planName }) : t("audit.windowFull", { days: auditRetentionDays })}
      </Banner>
      <AuditFilters filters={filters} actors={Array.from(names, ([userId, name]) => ({ userId, name }))} targetTypes={page.targetTypes} />
      <AuditTable page={page} locale={locale} filtered={filtered} />
      <AuditPagination page={page.page} pageCount={page.pageCount} query={auditQueryString(filters, 1)} />
    </div>
  );
}
