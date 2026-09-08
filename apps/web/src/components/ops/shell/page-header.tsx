import type { ReactNode } from "react";

/** Console page header: the one h1, a one-line intro and button-styled links on the right (never nested in buttons). */
export function OpsPageHeader({
  title,
  intro,
  context,
  actions,
}: {
  title: string;
  intro?: string;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {intro ? <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p> : null}
        {context ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
            {context}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
