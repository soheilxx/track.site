import type { ReactNode } from "react";
import { cn } from "@track-site/ui";
import type { Milestone } from "@/lib/marketing-copy/types";

/*
 * Customer milestones as a vertical timeline (docs/12 §4 "timeline/flow"): numbered markers on a
 * rail, the milestone text on the left and an optional product state on the right. An <ol> so the
 * order is announced; no cards.
 */
export function MilestoneTimeline({ items, youLabel, outcomeLabel, visuals }: { items: Milestone[]; youLabel: string; outcomeLabel: string; visuals?: Array<ReactNode | null> }) {
  return (
    <ol className="relative">
      {items.map((step, i) => {
        const last = i === items.length - 1;
        const visual = visuals?.[i] ?? null;
        return (
          <li key={step.title} className="relative grid gap-6 pl-14 md:grid-cols-12 md:gap-10 md:pl-20">
            <span aria-hidden="true" className={cn("absolute top-0 left-0 flex size-10 items-center justify-center rounded-full bg-primary font-display text-base font-semibold text-on-primary shadow-card md:size-12 md:text-lg")}>
              {i + 1}
            </span>
            {!last ? <span aria-hidden="true" className="absolute top-12 bottom-0 left-5 w-px bg-line-2 md:top-14 md:left-6" /> : null}
            <div className={cn("min-w-0 md:col-span-5", !last && "pb-12 md:pb-16")}>
              <h3 className="text-h3 font-semibold text-ink">{step.title}</h3>
              <p className="mt-3 text-body text-ink-2">{step.text}</p>
              <dl className="mt-5 grid gap-4 text-small sm:grid-cols-2 md:grid-cols-1">
                <div className="border-l-2 border-line-2 pl-3">
                  <dt className="text-micro font-semibold tracking-wide text-ink-3 uppercase">{youLabel}</dt>
                  <dd className="mt-1 text-ink-2">{step.you}</dd>
                </div>
                <div className="border-l-2 border-primary pl-3">
                  <dt className="text-micro font-semibold tracking-wide text-primary uppercase">{outcomeLabel}</dt>
                  <dd className="mt-1 text-ink">{step.outcome}</dd>
                </div>
              </dl>
            </div>
            {visual ? <div className={cn("min-w-0 md:col-span-7", !last && "pb-12 md:pb-16")}>{visual}</div> : null}
          </li>
        );
      })}
    </ol>
  );
}
