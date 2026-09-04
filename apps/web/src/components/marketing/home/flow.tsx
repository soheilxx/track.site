import { ArrowRight } from "lucide-react";
import { CodeBlock, ProductStage } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { HomeCopy } from "@/lib/marketing-copy/types";
import { FlowDiagram } from "./flow-diagram";
import { HomeSection } from "./section";

/** The public snippet as documented on /docs. */
export const SNIPPET = `<script async src="https://cdn.track.site/v1/tracker.js" data-site-id="TRACKING_ID"></script>`;

/** Visual flow "Snippet → Track → Platforms": steps on the left, the data-flow diagram and the snippet on a product stage. */
export function HomeFlow({ copy }: { copy: HomeCopy }) {
  const c = copy.flow;
  return (
    <HomeSection id="how-it-works" eyebrow={c.eyebrow} title={c.title} text={c.text} tone="surface" width="wide">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
        <ol className="space-y-8">
          {c.steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-small font-bold text-primary">{i + 1}</span>
              <div>
                <h3 className="text-h3 font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-body text-ink-2">{s.text}</p>
              </div>
            </li>
          ))}
          <li className="pl-13">
            <Link href="/how-it-works" className="inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline">
              {c.more} <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </li>
        </ol>
        <ProductStage as="div" tone="dark" dots padding="md">
          <FlowDiagram copy={copy} />
          <div className="mt-6">
            <p className="text-small font-semibold text-ink">{c.snippetTitle}</p>
            <CodeBlock code={SNIPPET} language="html" copyLabel={c.copy} copiedLabel={c.copied} tone="stage" wrap className="mt-2" />
          </div>
        </ProductStage>
      </div>
    </HomeSection>
  );
}
