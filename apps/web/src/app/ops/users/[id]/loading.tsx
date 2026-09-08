import { Skeleton } from "@track-site/ui";

/** Skeleton of the account detail while the server component loads (announced through aria-busy). */
export default function OpsUserLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-4 w-32" />
        <Skeleton shape="text" className="h-7 w-64" />
        <Skeleton shape="text" className="w-1/2" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}
