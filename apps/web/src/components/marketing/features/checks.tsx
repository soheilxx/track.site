import { Check, ChevronDown } from "lucide-react";
import type { CheckGroup } from "@/lib/marketing-copy/how-it-works";

/*
 * Collapsible "what Track checks" list. Native <details>/<summary>: keyboard operable, announced
 * as expandable, no client JavaScript. The summary is a ≥ 44 px target with a visible focus ring;
 * the chevron rotates via transform only (neutralised under reduced motion by the global rule).
 */
export function TechnicalChecks({ title, summary, intro, groups, headingId }: { title: string; summary: string; intro: string; groups: CheckGroup[]; headingId: string }) {
  return (
    <details className="group rounded-[var(--radius-panel)] border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-ink [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:px-8">
        <span>
          <h2 id={headingId} className="text-h3 font-semibold text-ink">
            {title}
          </h2>
          <span className="mt-1 block text-small font-normal text-ink-3">{summary}</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-ink-3 transition-transform duration-[var(--motion-base)] ease-in-out group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line px-5 py-6 md:px-8 md:py-8">
        <p className="max-w-text text-body text-ink-2">{intro}</p>
        <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-base font-semibold text-ink">{group.title}</h3>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-small text-ink-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
