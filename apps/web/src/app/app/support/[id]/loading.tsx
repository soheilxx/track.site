import { Skeleton } from "@track-site/ui";

/** Skeleton of the ticket page while the server component loads (announced through aria-busy). */
export default function TicketLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-4 w-32" />
        <Skeleton shape="text" className="h-7 w-2/3" />
        <Skeleton shape="text" className="w-1/3" />
      </div>
      <Skeleton className="h-20" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
