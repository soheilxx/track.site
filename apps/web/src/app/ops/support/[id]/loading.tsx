import { Skeleton } from "@track-site/ui";

/** Skeleton of the ticket page while the server components load (announced through aria-busy). */
export default function OpsSupportTicketLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-72" />
        <Skeleton shape="text" className="w-1/2" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
          <Skeleton className="h-48" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-56" />
        </div>
      </div>
    </div>
  );
}
