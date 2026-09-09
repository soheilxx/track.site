import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { ViewDelete } from "@/components/ops/support/list/view-delete";
import { ViewForm } from "@/components/ops/support/list/view-form";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform, withPlatform } from "@/server/ops/platform";
import { listTeamOptions } from "@/server/support/teams";
import { loadPlanOptions, loadSupportOperators } from "@/server/support/tickets";
import { canManageView, getSavedView, viewHref } from "@/server/support/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportTickets.viewForm");
  return { title: t("titleEditShort") };
}

/**
 * Edit a saved view. Other operators' personal views are never resolved (404); a shared view is shown to a
 * support operator with the way to open it but without the editor (admins edit shared views).
 */
export default async function OpsSupportViewEditPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const { id } = await params;
  const view = await getSavedView(ctx, id);
  if (!view) notFound();
  const [t, plans, operators, teams] = await Promise.all([getTranslations("supportTickets.viewForm"), loadPlanOptions(ctx), loadSupportOperators(ctx), withPlatform(ctx, (tx) => listTeamOptions(tx, { includeArchived: true }))]);
  const manageable = canManageView(ctx, view);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("titleEdit", { name: view.name })}
        intro={t("introEdit")}
        actions={
          <>
            <Link href={viewHref(view.id)} className={buttonVariants({ variant: "secondary" })}>
              {t("openQueue")}
            </Link>
            {manageable ? <ViewDelete viewId={view.id} name={view.name} /> : null}
          </>
        }
      />
      <SupportSubnav current="views" role={ctx.platformRole} />
      {manageable ? (
        <ViewForm view={view} initial={view.filters} sort={view.sort} plans={plans} operators={operators} teams={teams} selfId={ctx.user.id} isAdmin={ctx.platformRole === "PLATFORM_ADMIN"} />
      ) : (
        <Alert tone="info">{t("notEditable")}</Alert>
      )}
    </div>
  );
}
