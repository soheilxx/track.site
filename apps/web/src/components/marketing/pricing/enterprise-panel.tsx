import { Check, ShieldCheck } from "lucide-react";
import { ProductStage, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { PricingCopy } from "@/lib/marketing-copy/types";
import type { PublicPlan } from "@/server/pricing";
import { CONTACT_SALES_HREF } from "./pricing-helpers";

/**
 * Enterprise as a wide custom panel below the three main cards (supplement §5): a dark product
 * stage with the benefits from the catalogue, verifiable trust signals and its own CTA.
 */
export function EnterprisePanel({ plan, copy }: { plan: PublicPlan; copy: PricingCopy["enterprise"] }) {
  const headingId = `plan-${plan.id}-title`;
  return (
    <ProductStage as="div" tone="dark" dots padding="lg" aria-labelledby={headingId} role="region">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-h2 font-semibold text-ink">
            {plan.name}
          </h2>
          <p className="mt-2 text-h3 font-medium text-ink-2">{copy.lead}</p>
          <p className="mt-6 font-display text-4xl font-bold tracking-tight text-ink">{copy.price}</p>
          <p className="mt-1 text-small text-ink-3">{plan.audience}</p>
          <p className="mt-6 max-w-text text-body text-ink-2">{copy.text}</p>
          {/* the CTAs may wrap onto two lines instead of overflowing the panel at 320 px (fr: "Contacter l’équipe commerciale") */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={CONTACT_SALES_HREF} className={cn(buttonVariants({ size: "lg" }), "max-w-full whitespace-normal text-center")}>
              {copy.cta}
            </Link>
            <Link href="/demo" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "max-w-full whitespace-normal text-center")}>
              {copy.secondary}
            </Link>
          </div>
          <p className="mt-4 text-small text-ink-3">{copy.overage}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <h3 className="text-small font-semibold tracking-wide text-ink-3 uppercase">{copy.benefitsTitle}</h3>
            <ul className="mt-3 space-y-2 text-small text-ink-2">
              {plan.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-small font-semibold tracking-wide text-ink-3 uppercase">{copy.trustTitle}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {copy.trust.map((t) => (
                <li key={t} className="inline-flex items-start gap-1.5 rounded-[var(--radius-chip)] border border-line bg-surface px-3 py-1.5 text-micro font-medium text-ink-2">
                  <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </ProductStage>
  );
}
