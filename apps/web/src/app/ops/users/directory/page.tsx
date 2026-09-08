import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants, cn } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { DirectoryFilters } from "@/components/ops/users/directory-filters";
import { DirectoryPagination } from "@/components/ops/users/directory-pagination";
import { DirectoryTable } from "@/components/ops/users/directory-table";
import { checkPlatform } from "@/server/ops/platform";
import { USERS_PATH, isUserFiltered, loadUserDirectory, parseUserFilters, userQueryString } from "@/server/ops/users";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tOps] = await Promise.all([getTranslations("opsUsers"), getTranslations("ops.pages")]);
  return { title: `${t("directory.title")} · ${tOps("users.title")}` };
}

/**
 * Customer directory (Track Operations, docs/17): every account with organisations and roles, two-factor
 * and verification state, last sign-in and creation date — read-only metadata with search, filters, sort
 * and counted pagination in the URL. Admin only.
 */
export default async function OpsUserDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const filters = parseUserFilters(await searchParams);
  const [t, locale] = await Promise.all([getTranslations("opsUsers"), getLocale()]);
  const page = await loadUserDirectory(access.ctx, filters);
  return (
    <div className="space-y-6">
      <div>
        <Link href={USERS_PATH} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("directory.back")}
        </Link>
      </div>
      <OpsPageHeader title={t("directory.title")} intro={t("directory.intro")} />
      <DirectoryFilters filters={filters} />
      <DirectoryTable page={page} locale={locale} filtered={isUserFiltered(filters)} />
      <DirectoryPagination page={page.page} pageCount={page.pageCount} query={userQueryString(filters, 1)} />
    </div>
  );
}
