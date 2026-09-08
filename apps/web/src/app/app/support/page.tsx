import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { Alert, EmptyState, buttonVariants } from "@track-site/ui";
import { SupportPageHeader } from "@/components/app/support/page-header";
import { TicketTable } from "@/components/app/support/ticket-table";
import { ViewChips } from "@/components/app/support/view-chips";
import { requireOrgContext } from "@/server/session";
import { PORTAL_LIMITS, listCustomerTickets, parsePortalView } from "@/server/support/portal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportPortal");
  return { title: t("list.title") };
}

/**
 * Customer dashboard → Support (`/app/support`, docs/18 §"Customer view"): the organisation's own tickets
 * (RLS in migration 0015, customer columns only) with the open / solved / all views in the URL. Every
 * member reads (`support.read`); opening tickets needs `support.write` (every role but Read only) and is
 * refused for a read-only break-glass session.
 */
export default async function SupportListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("support.read");
  const [t, locale] = await Promise.all([getTranslations("supportPortal"), getLocale()]);
  const view = parsePortalView(q);
  const list = await listCustomerTickets(ctx, view);
  const canWrite = can(ctx.role, "support.write") && !ctx.readOnly;
  return (
    <div className="space-y-6">
      <SupportPageHeader
        title={t("list.title")}
        intro={t("list.intro")}
        actions={
          canWrite ? (
            <Link href="/app/support/new" className={buttonVariants()} data-testid="support-new-link">
              <Plus className="size-4" aria-hidden="true" /> {t("list.newTicket")}
            </Link>
          ) : null
        }
      />
      {!canWrite ? <Alert tone="info">{t("list.readOnly")}</Alert> : null}
      {!list.available ? (
        <EmptyState title={t("list.unavailableTitle")} description={t("list.unavailableText")} />
      ) : (
        <>
          <ViewChips view={view} counts={list.counts} />
          {list.tickets.length === 0 ? (
            <EmptyState
              title={t(`list.empty.${view}Title`)}
              description={t(`list.empty.${view}Text`)}
              action={
                canWrite ? (
                  <Link href="/app/support/new" className={buttonVariants({ variant: "secondary" })}>
                    {t("list.newTicket")}
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
              <TicketTable tickets={list.tickets} locale={locale} />
              {list.tickets.length >= PORTAL_LIMITS.listLimit ? <p className="px-3 pt-2 text-xs text-ink-3">{t("list.limited", { limit: PORTAL_LIMITS.listLimit })}</p> : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
