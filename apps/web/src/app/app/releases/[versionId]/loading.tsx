import { getTranslations } from "next-intl/server";
import { Skeleton, VisuallyHidden } from "@track-site/ui";

/** Skeleton of the version detail (header, diff, facts, publications, evidence). */
export default async function VersionLoading() {
  const t = await getTranslations("releases");
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="space-y-2">
        <Skeleton shape="text" className="h-4 w-48" />
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
