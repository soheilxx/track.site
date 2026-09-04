import { Skeleton, VisuallyHidden } from "@track-site/ui";

/** Loading state mirroring the Command Center layout (priority panel, status strip, charts, table). */
export function CommandCenterSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6" data-testid="cc-skeleton">
      <VisuallyHidden>{label}</VisuallyHidden>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-56 rounded-[var(--radius-panel)]" />
        <Skeleton className="h-56 rounded-[var(--radius-card)]" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-2 bg-surface px-4 py-3">
            <Skeleton shape="text" className="w-1/2" />
            <Skeleton shape="text" className="w-3/4" />
            <Skeleton shape="text" className="w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
