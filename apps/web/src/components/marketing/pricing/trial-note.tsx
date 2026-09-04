import { Check } from "lucide-react";
import { Container, buttonVariants } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { PricingPageCopy } from "@/lib/marketing-copy/pricing";
import type { PublicTrial } from "@/server/pricing";
import { fill, formatInteger, signupHref } from "./pricing-helpers";

/** The 14-day Growth trial as configured in the catalogue: no card, capped events, no auto-conversion. */
export function TrialNote({ locale, trial, copy }: { locale: string; trial: PublicTrial; copy: PricingPageCopy["trial"] }) {
  const vars = { plan: trial.planName, days: formatInteger(trial.days, locale), events: formatInteger(trial.maxEvents, locale) };
  return (
    <section aria-labelledby="trial-title" className="border-t border-line bg-surface">
      <Container className="py-12 md:py-14">
        <div className="grid gap-8 rounded-[var(--radius-panel)] border border-line bg-ground p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-12">
          <div className="min-w-0">
            <h2 id="trial-title" className="font-display text-h3 font-semibold text-ink">
              {fill(copy.title, vars)}
            </h2>
            <p className="mt-2 text-body text-ink-2">{fill(copy.text, vars)}</p>
            <div className="mt-6">
              <Link href={signupHref(trial.planId, "monthly")} className={buttonVariants({ size: "lg" })}>
                {fill(copy.cta, vars)}
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {copy.facts.map((f) => (
              <li key={f} className="flex items-start gap-2 text-small text-ink-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
                <span>{fill(f, vars)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
