import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

/**
 * Page header of the Releases module: the one h1 with an optional badge, a one-line intro, a context
 * line naming the scope (site, tracking id, environment) and a toolbar of button-styled links.
 * Inter, 14 px base — no display font in the dashboard (docs/12 §1); links and buttons never nest.
 */
export function ReleasesPageHeader({ title, intro, badge, context, actions, breadcrumbs, className }: { title: string; intro: string; badge?: ReactNode; context?: ReactNode; actions?: ReactNode; breadcrumbs?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumbs ? <div className="mb-2">{breadcrumbs}</div> : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {badge}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{intro}</p>
        {context ? <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">{context}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </header>
  );
}
