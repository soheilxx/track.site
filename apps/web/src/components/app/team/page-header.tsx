import type { ReactNode } from "react";

/** Module page header: the one h1, a one-line intro and button-styled links on the right (never nested in buttons). */
export function TeamPageHeader({ title, intro, actions }: { title: string; intro: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
