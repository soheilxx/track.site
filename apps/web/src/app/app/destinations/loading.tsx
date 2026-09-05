import { getTranslations } from "next-intl/server";
import { Skeleton } from "@track-site/ui";

/** Skeleton for the Destination Health Center while the measurements load. */
export default async function DestinationsHealthLoading() {
  const t = await getTranslations("destinationsHealth");
  return (
    <div className="space-y-6" aria-busy="true">
      <div>
        {/* the streaming skeleton must not add a second document heading: the real h1 arrives with the page */}
        <p className="font-display text-2xl font-semibold text-ink" aria-hidden="true">{t("title")}</p>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <Skeleton className="h-64" />
    </div>
  );
}
