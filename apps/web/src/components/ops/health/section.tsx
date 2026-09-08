import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

/** One section of the health page: h2 + one-line intro, an optional aside (state, freshness) on the right. */
export function HealthSection({
  id,
  title,
  intro,
  aside,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3" data-testid={`ops-health-${id}`}>
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
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface px-3 py-3 sm:px-4", className)}>{children}</div>;
}

export interface Fact {
  label: string;
  value: ReactNode;
}

/** Dense definition list: label above value, three columns from `lg`. */
export function Facts({ items, columns = 3 }: { items: Fact[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", cols)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-3">{item.label}</dt>
          <dd className="mt-0.5 break-words text-ink tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "—" for a value that was not measured; never a zero dressed up as a number. */
export function Unknown({ label }: { label: string }) {
  return (
    <span className="text-ink-3">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
