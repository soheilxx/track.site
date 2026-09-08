import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { DirectoryFilters } from "@/components/ops/organisations/directory-filters";
import { DirectoryPagination } from "@/components/ops/organisations/directory-pagination";
import { DirectoryTable } from "@/components/ops/organisations/directory-table";
import { isFiltered, loadOrganisationDirectory, organisationQueryString, parseOrganisationFilters } from "@/server/ops/organisations";
import { checkPlatform } from "@/server/ops/platform";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("organisations");
}

/**
 * Organisations directory (Track Operations, docs/17): every customer organisation with plan,
 * subscription status, suspension, members, sites, 30-day accepted events, last activity and health
 * score — filters and sort in the URL, counted totals, CSV export of the same metadata.
 */
export default async function OpsOrganisationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const q = await searchParams;
  const filters = parseOrganisationFilters(q);
  const [t, tOps, locale] = await Promise.all([getTranslations("opsOrganisations"), getTranslations("ops"), getLocale()]);
  const page = await loadOrganisationDirectory(access.ctx, filters);
  return (
    <div className="space-y-6">
      <OpsPageHeader title={tOps("pages.organisations.title")} intro={t("directory.intro")} />
      <DirectoryFilters filters={filters} plans={page.plans} />
      <DirectoryTable page={page} locale={locale} filtered={isFiltered(filters)} />
      <DirectoryPagination page={page.page} pageCount={page.pageCount} query={organisationQueryString(filters, 1)} />
    </div>
  );
}
