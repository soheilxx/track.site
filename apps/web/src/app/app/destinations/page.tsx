import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { can } from "@track-site/core";
import { EmptyState, buttonVariants, cn } from "@track-site/ui";
import { HealthCenter } from "@/components/app/destinations-health/health-center";
import { loadDestinationHealth } from "@/server/destination-health";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Destination Health Center (`/app/destinations`, supplement §8 module 6). The workspace switcher
 * sets the site; `?scope=all` widens the view to every site of the organization. Per-site editing
 * stays on `/app/sites/[siteId]/destinations/*` (linked from every row).
 */
export default async function DestinationsHealthPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: scopeParam } = await searchParams;
  const ctx = await requireOrgContext("integrations.read");
  const t = await getTranslations("destinationsHealth");
  const workspace = await activeSite(ctx);
  const scope: "site" | "all" = scopeParam === "all" || !workspace.site ? "all" : "site";
  const canManage = can(ctx.role, "integrations.manage");

  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} intro={t("intro")} />
        <EmptyState
          title={t("noSites")}
          description={t("noSitesText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants({ size: "sm" })}>
              {t("createSite")}
            </Link>
          }
        />
      </div>
    );
  }

  const overview = await loadDestinationHealth(ctx, { siteId: scope === "site" ? workspace.site.id : null });
  const scopeLink = (value: "site" | "all", label: string) => (
    <Link
      href={value === "all" ? "/app/destinations?scope=all" : "/app/destinations"}
      aria-current={scope === value ? "page" : undefined}
      className={cn(buttonVariants({ variant: scope === value ? "primary" : "secondary", size: "sm" }), "rounded-none first:rounded-l-[var(--radius-control)] last:rounded-r-[var(--radius-control)]")}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        toolbar={
          <>
            {workspace.sites.length > 1 ? (
              <nav aria-label={t("scope.label")} className="inline-flex">
                {scopeLink("site", t("scope.thisSite"))}
                {scopeLink("all", t("scope.allSites"))}
              </nav>
            ) : null}
            {/* button-styled link: interactive elements are never nested */}
            {canManage ? (
              <Link href={`/app/sites/${workspace.site.id}/destinations/new`} className={buttonVariants({ size: "sm" })}>
                <Plus className="size-4" aria-hidden="true" /> {t("add")}
              </Link>
            ) : null}
          </>
        }
      />
      <HealthCenter overview={overview} scope={scope} activeSite={{ id: workspace.site.id, name: workspace.site.name }} siteCount={workspace.sites.length} canManage={canManage} locale={ctx.user.locale} />
    </div>
  );
}

function PageHeader({ title, intro, toolbar }: { title: string; intro: string; toolbar?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p>
      </div>
      {toolbar ? <div className="flex shrink-0 flex-wrap items-center gap-2">{toolbar}</div> : null}
    </div>
  );
}
