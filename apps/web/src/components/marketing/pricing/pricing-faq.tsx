import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/lib/marketing-copy";

/** FAQ as native disclosure widgets: keyboard operable, no script, no card soup. */
export function PricingFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="max-w-text border-y border-line">
      {items.map((f) => (
        <details key={f.q} className="group border-b border-line last:border-b-0">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span>{f.q}</span>
            <ChevronDown className="size-5 shrink-0 text-ink-3 motion-safe:transition-transform motion-safe:duration-[var(--motion-base)] group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="pb-5 text-body text-ink-2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
