import { Skeleton } from "@track-site/ui";

/** Skeleton of the inbox pages while the server components load (announced through aria-busy). */
export default function OpsInboxLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton shape="text" className="h-7 w-40" />
        <Skeleton shape="text" className="w-2/3" />
      </div>
      <Skeleton className="h-10" />
      <Skeleton className="h-24" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
