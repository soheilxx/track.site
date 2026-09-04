import { ArrowRight, Check } from "lucide-react";
import { ProductStage, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { FeatureDetailCopy, FeatureUiCopy } from "@/lib/marketing-copy/features";
import { FeatureIndexView } from "./feature-view";
import { Narrative } from "./section";

/*
 * The six capabilities on /features as alternating two-column narratives (text + product view)
 * instead of a grid of identical cards. Dark and light stages alternate for rhythm; the title links
 * to the detail page, the "read more" link is a button-styled <Link> (never a nested button).
 */
export function FeatureIndex({ features, ui, more }: { features: FeatureDetailCopy[]; ui: FeatureUiCopy; more: string }) {
  return (
    <div className="space-y-20 md:space-y-28">
      {features.map((f, i) => {
        const dark = i % 2 === 0;
        const href = `/features/${f.slug}`;
        return (
          <Narrative
            key={f.slug}
            reverse={i % 2 === 1}
            text={
              <div>
                <h3 className="font-display text-h3 font-semibold text-ink md:text-2xl">
                  <Link href={href} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    {f.title}
                  </Link>
                </h3>
                <p className="mt-3 text-body text-ink-2 md:text-lg">{f.benefit}</p>
                <ul className="mt-5 space-y-2">
                  {f.bullets.slice(0, 2).map((b) => (
                    <li key={b} className="flex items-start gap-2 text-small text-ink-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link href={href} className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-6")}>
                  {more}
                  <ArrowRight className="size-4" aria-hidden="true" />
                  <span className="sr-only">: {f.title}</span>
                </Link>
              </div>
            }
            visual={
              <ProductStage as="div" tone={dark ? "dark" : "light"} dots={dark} padding="md">
                <FeatureIndexView slug={f.slug} ui={ui} />
              </ProductStage>
            }
          />
        );
      })}
    </div>
  );
}
