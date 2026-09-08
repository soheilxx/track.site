"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Pagination } from "@track-site/ui";

/** Page links of the directory; `query` carries every other filter (built on the client side of the boundary). */
export function DirectoryPagination({ page, pageCount, query }: { page: number; pageCount: number; query: string }) {
  const t = useTranslations("opsUsers.directory.pagination");
  const hrefFor = (p: number) => {
    const params = new URLSearchParams(query.replace(/^\?/, ""));
    if (p > 1) params.set("page", String(p));
    else params.delete("page");
    const s = params.toString();
    return `/ops/users/directory${s ? `?${s}` : ""}`;
  };
  return <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} linkComponent={Link} labels={{ nav: t("nav"), previous: t("previous"), next: t("next"), page: (n) => t("page", { page: n }) }} className="pt-2" />;
}
