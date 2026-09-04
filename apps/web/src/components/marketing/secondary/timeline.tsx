import { cn } from "@track-site/ui";

export interface TimelineItem {
  title: string;
  text?: string;
  /** What the reader can verify afterwards; rendered under `outcomeLabel`. */
  outcome?: string;
}

/**
 * Numbered steps on a vertical rail (docs/12 §4 "timeline/flow"). An <ol> so the order is announced;
 * no cards. `compact` for short agendas (title only), the default for quickstarts with an outcome.
 */
export function NumberedTimeline({ items, outcomeLabel, compact = false, className }: { items: TimelineItem[]; outcomeLabel?: string; compact?: boolean; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {items.map((step, i) => {
        const last = i === items.length - 1;
        return (
          <li key={step.title} className={cn("relative pl-12 md:pl-16", !last && (compact ? "pb-6" : "pb-10 md:pb-12"))}>
            <span aria-hidden="true" className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-full bg-primary font-display text-small font-semibold text-on-primary shadow-card md:size-10 md:text-base">
              {i + 1}
            </span>
            {!last ? <span aria-hidden="true" className="absolute top-10 bottom-0 left-[17px] w-px bg-line-2 md:top-11 md:left-[19px]" /> : null}
            <h3 className={cn("font-semibold text-ink", compact ? "min-h-9 text-body leading-9 md:min-h-10 md:leading-10" : "text-h3")}>{step.title}</h3>
            {step.text ? <p className="mt-2 text-body text-ink-2">{step.text}</p> : null}
            {step.outcome && outcomeLabel ? (
              <p className="mt-4 border-l-2 border-primary pl-3 text-small">
                <span className="block text-micro font-semibold tracking-wide text-primary uppercase">{outcomeLabel}</span>
                <span className="mt-1 block text-ink">{step.outcome}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
