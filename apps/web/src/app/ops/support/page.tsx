import { BarChart3, Bookmark, MessageSquareText, Settings2, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { ExportButton } from "@/components/ops/support/list/export-button";
import { TicketPagination } from "@/components/ops/support/list/pagination";
import { TicketFilters } from "@/components/ops/support/list/ticket-filters";
import { TicketList } from "@/components/ops/support/list/ticket-list";
import { ViewTabs } from "@/components/ops/support/list/view-tabs";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform, platformCan, platformLocale } from "@/server/ops/platform";
import { loadSupportOperators, loadTickets, loadViewCounts } from "@/server/support/tickets";
import { loadSavedViews, parseTicketFilters, resolveViewBase, ticketQueryString, ticketsFiltered } from "@/server/support/views";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("support");
}

/**
 * Track Operations → Support → ticket queue (docs/18 §"Ticket list", task T1). The selected view (default or
 * saved) is the base, every other filter and the sort live in the URL on top of it; counts per view come from
 * one live query; rows carry the SLA state derived from the stored timestamps and the presence of other
 * operators. Bulk actions and the CSV export are client components over server actions; the page itself
 * requires `platform.tickets.read` and passes the finer permissions down for hiding (the actions re-check).
 */
export default async function OpsSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const q = await searchParams;
  const base = await resolveViewBase(ctx, q);
  const filters = parseTicketFilters(q, base);
  const now = new Date();
  const [t, tOps, tPages, locale, saved, operators] = await Promise.all([getTranslations("supportTickets"), getTranslations("ops.pages.support"), getTranslations("support.pages"), platformLocale(ctx.user), loadSavedViews(ctx), loadSupportOperators(ctx)]);
  const [page, counts] = await Promise.all([loadTickets(ctx, filters, now), loadViewCounts(ctx, saved, now)]);
  const query = ticketQueryString(filters, 1, base);
  const saveHref = `/ops/support/views/new${ticketQueryString({ ...filters, view: null }, 1)}`;
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={tOps("title")}
        intro={t("queue.intro")}
        actions={
          <>
            <Link href={saveHref} className={buttonVariants({ variant: "secondary" })} data-testid="support-save-view">
              <Bookmark className="size-4" aria-hidden="true" />
              {t("queue.saveView")}
            </Link>
            <Link href="/ops/support/views" className={buttonVariants({ variant: "ghost" })}>
              <Settings2 className="size-4" aria-hidden="true" />
              {t("queue.manageViews")}
            </Link>
            <Link href="/ops/support/reports" className={buttonVariants({ variant: "ghost" })} data-testid="support-open-reports">
              <BarChart3 className="size-4" aria-hidden="true" />
              {tPages("reports.title")}
            </Link>
            {platformCan(ctx, "platform.macros.manage") ? (
              <Link href="/ops/support/macros" className={buttonVariants({ variant: "ghost" })} data-testid="support-open-macros">
                <MessageSquareText className="size-4" aria-hidden="true" />
                {tPages("macros.title")}
              </Link>
            ) : null}
            {platformCan(ctx, "platform.sla.manage") ? (
              <Link href="/ops/support/settings" className={buttonVariants({ variant: "ghost" })} data-testid="support-open-settings">
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                {tPages("settings.title")}
              </Link>
            ) : null}
            <ExportButton query={query} />
          </>
        }
      />
      <SupportSubnav current="tickets" role={ctx.platformRole} />
      {base.missing ? <Alert tone="warn">{t("queue.viewMissing")}</Alert> : null}
      <ViewTabs current={filters.view} counts={counts} saved={saved} locale={locale} />
      <TicketFilters filters={filters} base={base} operators={operators} selfId={ctx.user.id} plans={page.plans} />
      <TicketList rows={page.rows} total={page.total} filtered={ticketsFiltered(filters, base)} locale={locale} now={page.generatedAt} operators={operators} selfId={ctx.user.id} canAssign={platformCan(ctx, "platform.tickets.assign")} canWrite={platformCan(ctx, "platform.tickets.write")} />
      <TicketPagination page={page.page} pageCount={page.pageCount} query={query} />
    </div>
  );
}
