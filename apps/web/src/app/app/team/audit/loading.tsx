import { Skeleton } from "@track-site/ui";

/** Skeleton of the audit log while the server component loads (announced through aria-busy). */
export default function TeamAuditLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <Skeleton className="h-12" />
      <Skeleton className="h-40" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
