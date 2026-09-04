import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Container } from "@track-site/ui";
import { ProductDemoLazy } from "@/components/marketing/demo/product-demo-lazy";
import { DomainStartForm } from "@/components/marketing/domain-start-form";
import { Link } from "@/i18n/navigation";
import type { HomeCopy } from "@/lib/marketing-copy/types";

/**
 * Hero (supplement §4): left the value proposition, the domain start and verifiable trust signals;
 * right the interactive product demo (server-rendered placeholder, lazily hydrated).
 */
export function HomeHero({ copy }: { copy: HomeCopy }) {
  return (
    <section className="relative overflow-hidden">
      <div className="grid-dots pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden="true" />
      <Container width="wide" className="relative grid gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:py-20">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] border border-line bg-surface px-3 py-1 text-micro font-medium text-ink-2">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h1 className="mt-5 font-display text-h1 font-bold text-ink">{copy.title}</h1>
          <p className="mt-5 text-lg text-ink-2">{copy.subtitle}</p>
          <div className="mt-8">
            <DomainStartForm copy={{ label: copy.domainLabel, placeholder: copy.domainPlaceholder, help: copy.domainHelp, cta: copy.cta, invalid: copy.domainInvalid }} />
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-small text-ink-3">
            {(["eu", "consent", "signed", "noCode"] as const).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-ok" aria-hidden="true" />
                {copy.trust[k]}
              </li>
            ))}
          </ul>
          <Link href="/how-it-works" className="mt-6 inline-flex min-h-11 items-center gap-1 text-small font-medium text-primary underline-offset-4 hover:underline">
            {copy.ctaSecondary} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="min-w-0">
          <ProductDemoLazy copy={copy.demo} heading={copy.demoHeading} />
        </div>
      </Container>
    </section>
  );
}
