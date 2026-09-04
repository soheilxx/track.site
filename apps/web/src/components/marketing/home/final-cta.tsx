import { ArrowRight } from "lucide-react";
import { Container, buttonVariants } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { HomeCopy } from "@/lib/marketing-copy/types";

/** Focused closing call to action on a dark stage: one primary action, one secondary link. */
export function HomeFinalCta({ copy }: { copy: HomeCopy }) {
  const c = copy.finalCta;
  return (
    <section aria-labelledby="final-cta-title" className="surface-stage border-t border-stage-line">
      <Container className="py-16 text-center md:py-20">
        <h2 id="final-cta-title" className="mx-auto max-w-2xl font-display text-h2 font-semibold text-ink">
          {c.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-2">{c.text}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            {c.cta} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/demo" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            {c.secondary}
          </Link>
        </div>
      </Container>
    </section>
  );
}
