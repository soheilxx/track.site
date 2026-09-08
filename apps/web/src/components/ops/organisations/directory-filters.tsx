import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, Input, Label, Select, buttonVariants, cn } from "@track-site/ui";
import { EXPORT_MAX_ROWS, ORG_SORTS, SUBSCRIPTION_STATUSES, organisationQueryString, type OrganisationFilters, type PlanOption } from "@/server/ops/organisations";
import { subscriptionStatusLabel } from "./labels";

/**
 * GET form (works without JavaScript): search, plan, subscription status, suspension, sort and
 * direction live in the URL. The CSV export is a plain link carrying the same query, so what is
 * exported is exactly what is filtered.
 */
export async function DirectoryFilters({ filters, plans }: { filters: OrganisationFilters; plans: PlanOption[] }) {
  const t = await getTranslations("opsOrganisations");
  const exportHref = `/ops/organisations/export${organisationQueryString(filters, 1)}`;
  return (
    <form method="get" action="/ops/organisations" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <legend className="mb-3 text-sm font-semibold text-ink">{t("directory.filters.legend")}</legend>
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="org-q">{t("directory.filters.search")}</Label>
          <Input id="org-q" type="search" name="q" defaultValue={filters.q ?? ""} maxLength={64} placeholder={t("directory.filters.searchPlaceholder")} className="mt-1.5" />
        </div>
        <div className="min-w-0">
          <Label htmlFor="org-plan">{t("directory.filters.plan")}</Label>
          <Select id="org-plan" name="plan" defaultValue={filters.plan ?? ""} className="mt-1.5">
            <option value="">{t("directory.filters.all")}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="org-status">{t("directory.filters.status")}</Label>
          <Select id="org-status" name="status" defaultValue={filters.status ?? ""} className="mt-1.5">
            <option value="">{t("directory.filters.all")}</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {subscriptionStatusLabel(t, s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="org-suspended">{t("directory.filters.suspended")}</Label>
          <Select id="org-suspended" name="suspended" defaultValue={filters.suspended === "all" ? "" : filters.suspended} className="mt-1.5">
            <option value="">{t("directory.filters.all")}</option>
            <option value="yes">{t("directory.filters.suspendedYes")}</option>
            <option value="no">{t("directory.filters.suspendedNo")}</option>
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="org-sort">{t("directory.filters.sort")}</Label>
          <Select id="org-sort" name="sort" defaultValue={filters.sort} className="mt-1.5">
            {ORG_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`directory.sorts.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="org-dir">{t("directory.filters.direction")}</Label>
          <Select id="org-dir" name="dir" defaultValue={filters.dir} className="mt-1.5">
            <option value="desc">{t("directory.filters.desc")}</option>
            <option value="asc">{t("directory.filters.asc")}</option>
          </Select>
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary">
          {t("directory.filters.apply")}
        </Button>
        <Link href="/ops/organisations" className={buttonVariants({ variant: "ghost" })}>
          {t("directory.filters.reset")}
        </Link>
        <div className="min-w-0 flex-1" />
        {/* button-styled link to the route handler: a download, never nested in a button */}
        <a href={exportHref} className={cn(buttonVariants({ variant: "secondary" }))} data-testid="ops-organisations-export">
          <Download className="size-4" aria-hidden="true" />
          {t("directory.export")}
        </a>
      </div>
      <p className="mt-2 text-xs text-ink-3">{t("directory.exportHint", { max: EXPORT_MAX_ROWS })}</p>
    </form>
  );
}
