import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { ViewForm } from "@/components/ops/support/list/view-form";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform, withPlatform } from "@/server/ops/platform";
import { listTeamOptions } from "@/server/support/teams";
import { loadPlanOptions, loadSupportOperators } from "@/server/support/tickets";
import { parseTicketFilters, viewFiltersOf } from "@/server/support/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportTickets.viewForm");
  return { title: t("titleNew") };
}

/**
 * New saved view. "Save as view" on the queue links here with the queue's current filters in the query
 * string, so the editor starts from what the operator is looking at. Requires `platform.tickets.read`.
 */
export default async function OpsSupportViewNewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const q = await searchParams;
  const filters = parseTicketFilters(q);
  const [t, plans, operators, teams] = await Promise.all([getTranslations("supportTickets.viewForm"), loadPlanOptions(ctx), loadSupportOperators(ctx), withPlatform(ctx, (tx) => listTeamOptions(tx, { includeArchived: true }))]);
  return (
    <div className="space-y-6">
      <OpsPageHeader title={t("titleNew")} intro={t("introNew")} />
      <SupportSubnav current="views" role={ctx.platformRole} />
      <ViewForm view={null} initial={viewFiltersOf(filters)} sort={filters.sort} plans={plans} operators={operators} teams={teams} selfId={ctx.user.id} isAdmin={ctx.platformRole === "PLATFORM_ADMIN"} />
    </div>
  );
}
