import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

/** One section of a content page: h2 + one-line intro, an optional aside (links, freshness) on the right. */
export function ContentSection({ id, title, intro, aside, children }: { id: string; title: string; intro?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3" data-testid={`ops-content-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          {intro ? <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p> : null}
        </div>
        {aside ? <div className="flex max-w-full flex-wrap items-center gap-2 text-sm">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Bordered surface for tables and fact lists. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3", className)}>{children}</div>;
}

/** Small print under a table: what the data is and when it was read. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-3">{children}</p>;
}
