import type { ReactNode } from "react";

/** Module page header: title with optional badge, one-line intro, actions on the right (links styled as buttons, never nested). */
export function ConsentPageHeader({ title, intro, badge, actions, breadcrumbs }: { title: string; intro: string; badge?: ReactNode; actions?: ReactNode; breadcrumbs?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs ? <div className="mb-2">{breadcrumbs}</div> : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          {badge}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{intro}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
