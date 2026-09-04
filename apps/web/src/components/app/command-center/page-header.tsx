import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

/**
 * Dashboard page header: title, one-line intro, an optional context line (site, environment,
 * measurement time) and a toolbar of button-styled links. Inter, 14 px base — no display font in
 * the dashboard (docs/12 §1). Links and buttons are never nested.
 */
export function PageHeader({ title, description, context, actions, className }: { title: string; description?: string; context?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-3">{description}</p> : null}
        {context ? <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">{context}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
    </header>
  );
}
