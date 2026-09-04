import { getTranslations } from "next-intl/server";
import { Skeleton, VisuallyHidden } from "@track-site/ui";

/** Skeleton of an Insights page while the queries run (announced once via aria-busy + hidden text). */
export default async function InsightsLoading() {
  const t = await getTranslations("insights.loading");
  return (
    <div aria-busy="true" className="space-y-6">
      <VisuallyHidden>{t("label")}</VisuallyHidden>
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-72 max-w-full" />
        <Skeleton shape="text" className="w-full max-w-2xl" />
      </div>
      <Skeleton className="h-14" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}
