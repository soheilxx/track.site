import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { InboxFilters } from "@/components/ops/inbox/filters";
import { InboxPagination } from "@/components/ops/inbox/pagination";
import { RequestTable } from "@/components/ops/inbox/request-table";
import { StatusSummary } from "@/components/ops/inbox/status-summary";
import { InboxSubnav } from "@/components/ops/inbox/subnav";
import { inboxFiltered, inboxQueryString, loadInbox, loadPlatformOperators, parseInboxFilters } from "@/server/ops/inbox";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("inbox");
}

/**
 * Track Operations → Inbox (docs/17 §2, task O6): contact, demo and support requests from the public forms
 * with status, assignee and forwarding state; filters live in the URL. The other sections of the module
 * (privacy requests, alert digest, knowledge feedback) are sibling routes reachable from the section nav.
 */
export default async function OpsInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const q = await searchParams;
  const filters = parseInboxFilters(q);
  const [t, tOps, locale, page, operators] = await Promise.all([
    getTranslations("opsInbox"),
    getTranslations("ops.pages.inbox"),
    platformLocale(ctx.user),
    loadInbox(ctx, filters),
    loadPlatformOperators(ctx),
  ]);
  const now = new Date().toISOString();
  return (
    <div className="space-y-6">
      <OpsPageHeader title={tOps("title")} intro={t("requests.intro")} />
      <InboxSubnav current="requests" />
      <StatusSummary counts={page.counts} filters={filters} locale={locale} />
      <InboxFilters filters={filters} operators={operators} selfId={ctx.user.id} />
      <RequestTable page={page} locale={locale} filtered={inboxFiltered(filters)} now={now} />
      <InboxPagination page={page.page} pageCount={page.pageCount} query={inboxQueryString(filters, 1)} />
    </div>
  );
}
