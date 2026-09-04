import { Skeleton } from "@track-site/ui";

/** Skeleton of the team overview while the server component loads (announced through aria-busy). */
export default function TeamLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-56" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <Skeleton className="h-20" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-64" />
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-24" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
