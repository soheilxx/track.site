import { getTranslations } from "next-intl/server";
import { Skeleton, VisuallyHidden } from "@track-site/ui";

/** Skeleton mirroring the release center (header, environment strip, draft panel, history) while the server component loads. */
export default async function ReleasesLoading() {
  const t = await getTranslations("releases");
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <VisuallyHidden>{t("loading")}</VisuallyHidden>
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-2/3" />
        <Skeleton shape="text" className="w-1/3" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[var(--radius-card)]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
