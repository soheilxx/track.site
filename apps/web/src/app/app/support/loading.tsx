import { Skeleton } from "@track-site/ui";

/** Skeleton of the ticket list while the server component loads (announced through aria-busy). */
export default function SupportLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-24 rounded-[var(--radius-chip)]" />
        <Skeleton className="h-11 w-24 rounded-[var(--radius-chip)]" />
        <Skeleton className="h-11 w-20 rounded-[var(--radius-chip)]" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
