import { Skeleton } from "@track-site/ui";

/** Skeleton of the platform users page while the server component loads (announced through aria-busy). */
export default function OpsUsersLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-48" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-24" />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}
