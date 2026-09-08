import type { ReactNode } from "react";

/** Module page header: the one h1, a short intro and button-styled links on the right (never nested in buttons). */
export function SupportPageHeader({ title, intro, eyebrow, actions }: { title: string; intro?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-sm text-ink-3">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink break-words">{title}</h1>
        {intro ? <div className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
