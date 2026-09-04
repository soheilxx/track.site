import { Briefcase, ShoppingCart, UserRoundCheck } from "lucide-react";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { HomeSection } from "./section";

const ICONS = [ShoppingCart, UserRoundCheck, Briefcase];

/** E-commerce, lead and agency use cases as three columns separated by rules (no cards). */
export function HomeUseCases({ copy }: { copy: HomeCopy }) {
  const c = copy.useCases;
  return (
    <HomeSection id="use-cases" eyebrow={c.eyebrow} title={c.title} text={c.text} tone="surface">
      <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {c.items.map((item, i) => {
          const Icon = ICONS[i] ?? Briefcase;
          return (
            <article key={item.title} className="py-6 md:px-8 md:py-2 md:first:pl-0 md:last:pr-0">
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-display text-h3 font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-body text-ink-2">{item.text}</p>
              <ul className="mt-4 space-y-2 text-small text-ink-2">
                {item.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </HomeSection>
  );
}
