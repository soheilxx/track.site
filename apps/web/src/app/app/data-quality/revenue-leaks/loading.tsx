import { Skeleton } from "@track-site/ui";

/** Skeleton of the revenue leak report while the server component loads. */
export default function RevenueLeaksLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-72" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-[var(--radius-chip)]" />
        ))}
      </div>
      <Skeleton className="h-28" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
