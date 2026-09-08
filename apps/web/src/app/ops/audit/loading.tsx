import { Skeleton } from "@track-site/ui";

/** Skeleton of the explorer while the server component loads (announced through aria-busy). */
export default function OpsAuditLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-56" />
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
