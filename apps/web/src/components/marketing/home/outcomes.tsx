import { CheckCircle2 } from "lucide-react";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { HomeSection } from "./section";

/** Three customer outcomes instead of a feature wall; each names where the demo proves it. */
export function HomeOutcomes({ copy }: { copy: HomeCopy }) {
  const c = copy.outcomes;
  return (
    <HomeSection id="outcomes" eyebrow={c.eyebrow} title={c.title} text={c.text}>
      <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
        {c.items.map((item, i) => (
          <li key={item.title} className="flex flex-col border-t-2 border-primary pt-5">
            <span className="font-display text-small font-bold text-primary tabular-nums">0{i + 1}</span>
            <h3 className="mt-2 font-display text-h3 font-semibold text-ink">{item.title}</h3>
            <p className="mt-3 text-body text-ink-2">{item.text}</p>
            <p className="mt-4 inline-flex items-start gap-2 text-small text-ink-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
              {item.proof}
            </p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
}
