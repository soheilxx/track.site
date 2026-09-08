import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

/** Section of the report: one h2, a one-line intro, an optional aside (figures) on the right, then the content. */
export function Section({
  id,
  title,
  intro,
  aside,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4" data-testid={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          {intro ? <p className="mt-1 max-w-3xl text-sm text-ink-3">{intro}</p> : null}
        </div>
        {aside ? <div className="flex max-w-full flex-wrap gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Frame of a dense table inside a section. */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small labelled figure used in section asides ("Open now · 12"). */
export function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="min-w-28 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2">
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/**
 * Proportional bar next to a number: `share` 0–1 of the row's reference value. Decorative — the number in
 * the same cell carries the value; the bar is one hue (magnitude, not identity).
 */
export function ShareBar({ share, className }: { share: number | null; className?: string }) {
  const width = share === null ? 0 : Math.max(0, Math.min(1, share)) * 100;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-2 w-full max-w-40 overflow-hidden rounded-[var(--radius-chip)] bg-surface-2",
        className,
      )}
    >
      <span
        className="block h-full rounded-[var(--radius-chip)] bg-primary"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** Native disclosure for the accessible table twin of a chart (keyboard operable, no script). */
export function TableDisclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-[var(--radius-control)] border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-[var(--motion-fast)] group-open:rotate-90"
        >
          ▸
        </span>
        {summary}
      </summary>
      <div className="border-t border-line px-1 py-2">{children}</div>
    </details>
  );
}

/** One-line caveat under a table or figure (small numbers, withheld percentiles, approximations). */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-3">{children}</p>;
}
