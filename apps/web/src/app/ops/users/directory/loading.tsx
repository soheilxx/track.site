import { Skeleton } from "@track-site/ui";

/** Skeleton of the directory while the server component loads (announced through aria-busy). */
export default function OpsUserDirectoryLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton shape="text" className="h-8 w-32" />
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-48" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <Skeleton className="h-36" />
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
