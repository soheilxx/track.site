import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { formatDateTime } from "@/components/ops/support/list/format";
import { ViewDelete } from "@/components/ops/support/list/view-delete";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { canManageView, loadSavedViews, viewHref } from "@/server/support/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support.pages.views");
  return { title: t("title") };
}

/**
 * Track Operations → Support → Views (docs/18, task T1): the operator's saved views — shared ones for the
 * team (created and edited by admins) and personal ones. Each row opens the queue, and the owner (or an
 * admin for shared views) can edit or delete it. Requires `platform.tickets.read`.
 */
export default async function OpsSupportViewsPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, tq, tSupport, locale, views] = await Promise.all([getTranslations("supportTickets.viewsPage"), getTranslations("supportTickets.queue"), getTranslations("support"), platformLocale(ctx.user), loadSavedViews(ctx)]);
  const newLink = (
    <Link href="/ops/support/views/new" className={buttonVariants({ variant: "primary" })} data-testid="support-view-new">
      <Plus className="size-4" aria-hidden="true" />
      {t("new")}
    </Link>
  );
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={tSupport("pages.views.title")}
        intro={t("intro")}
        actions={
          <>
            <Link href="/ops/support" className={buttonVariants({ variant: "ghost" })}>
              {tSupport("pages.ticket.back")}
            </Link>
            {newLink}
          </>
        }
      />
      {views.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyText")} action={newLink} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("columns.name")}</Th>
                <Th>{t("columns.scope")}</Th>
                <Th>{t("columns.sort")}</Th>
                <Th>{t("columns.updated")}</Th>
                <Th>{t("columns.actions")}</Th>
              </Tr>
            </THead>
            <TBody>
              {views.map((view) => {
                const manageable = canManageView(ctx, view);
                return (
                  <Tr key={view.id} data-testid="support-view-row">
                    <Td label={t("columns.name")}>
                      <Link href={viewHref(view.id)} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11" aria-label={t("open", { name: view.name })}>
                        {view.name}
                      </Link>
                    </Td>
                    <Td label={t("columns.scope")}>
                      <Badge tone={view.scope === "shared" ? "primary" : "neutral"}>{t(`scope.${view.scope}`)}</Badge>
                    </Td>
                    <Td label={t("columns.sort")} className="text-ink-2">
                      {tq(`sorts.${view.sort}`)}
                    </Td>
                    <Td label={t("columns.updated")} className="whitespace-nowrap text-ink-2">
                      <time dateTime={view.updatedAt}>{formatDateTime(view.updatedAt, locale)}</time>
                    </Td>
                    <Td label={t("columns.actions")}>
                      <div className="flex flex-wrap items-center gap-2">
                        {manageable ? (
                          <>
                            <Link href={`/ops/support/views/${view.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label={t("editLabel", { name: view.name })}>
                              {t("edit")}
                            </Link>
                            <ViewDelete viewId={view.id} name={view.name} />
                          </>
                        ) : (
                          <span className="text-xs text-ink-3">{t("readOnly")}</span>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
