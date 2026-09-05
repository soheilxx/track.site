import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Check, Info } from "lucide-react";
import { Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { FinalCta, faqJsonLd } from "@/components/marketing/page-shell";
import { ComparisonMatrix } from "@/components/marketing/pricing/comparison-matrix";
import { EnterprisePanel } from "@/components/marketing/pricing/enterprise-panel";
import { EventDefinition } from "@/components/marketing/pricing/event-definition";
import { IncludedStrip } from "@/components/marketing/pricing/included-strip";
import { IntervalProvider, IntervalToggle } from "@/components/marketing/pricing/interval";
import { OverageSection } from "@/components/marketing/pricing/overage-section";
import { PlanCards } from "@/components/marketing/pricing/plan-cards";
import { PricingFaq } from "@/components/marketing/pricing/pricing-faq";
import { CONTACT_SALES_HREF, fill, formatInteger, formatList, planHrefMap, signupHref } from "@/components/marketing/pricing/pricing-helpers";
import { PricingToolsLazy } from "@/components/marketing/pricing/pricing-tools-lazy";
import { PricingSection } from "@/components/marketing/pricing/section";
import { TrialNote } from "@/components/marketing/pricing/trial-note";
import { PRICING_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";
import { featureMatrix, publicOveragePacks, publicPlans, publicTrial, publicUsagePolicy, sharedPaidFeatures } from "@/server/pricing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, PRICING_COPY);
  return pageMetadata({ locale, path: "/pricing", title: seoTitle(c.eyebrow), description: seoDescription(c.text) });
}

/**
 * Pricing (supplement §5). Every price, limit, pack and trial value comes from the tariff catalogue
 * through `@/server/pricing`; the page is static — nothing here depends on Stripe at request time.
 * Layout: focused hero with the interval toggle → three main cards → tax note → Enterprise stage →
 * included-in-every-plan list → plan finder + calculator stage → comparison matrix → event
 * definition with diagram → overage and cost control → trial strip → FAQ → closing CTA.
 *
 * Hydration budget: the plan cards and the matrix CTAs receive their signup links resolved here
 * (`planHrefMap`), and the finder/calculator stage is a lazily hydrated island with a server-rendered
 * initial state, so the tariff catalogue and the tools stay out of the page's hydration bundle.
 */
export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, PRICING_COPY);
  const plans = publicPlans(locale);
  const paid = plans.filter((p) => p.monthly && p.yearly && !p.contactSales);
  const enterprise = plans.find((p) => p.contactSales);
  const matrix = featureMatrix(locale);
  const shared = sharedPaidFeatures(locale);
  const packs = publicOveragePacks();
  const trial = publicTrial();
  const usage = publicUsagePolicy(locale);
  // catalogue values referenced in running text (hero facts, FAQ) so wording never restates a number
  const vars = {
    trialDays: formatInteger(trial.days, locale),
    trialEvents: formatInteger(trial.maxEvents, locale),
    trialPlan: trial.planName,
    thresholds: formatList(
      usage.thresholds.map((t) => `${formatInteger(t, locale)} %`),
      locale,
    ),
  };
  const facts = c.hero.facts.map((f) => fill(f, vars));
  const faq = c.faq.map((f) => ({ q: fill(f.q, vars), a: fill(f.a, vars) }));

  const offers = paid.flatMap((p) => {
    if (!p.monthly || !p.yearly) return [];
    return [
      { "@type": "Offer", name: `${p.name} (${c.interval.monthly})`, price: p.monthly.amount, priceCurrency: p.monthly.currency, category: "subscription" },
      { "@type": "Offer", name: `${p.name} (${c.interval.yearly})`, price: p.yearly.amount, priceCurrency: p.yearly.currency, category: "subscription" },
    ];
  });

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.eyebrow, path: "/pricing" }], locale), faqJsonLd(faq), { "@context": "https://schema.org", "@type": "SoftwareApplication", name: BRAND_NAME, applicationCategory: "BusinessApplication", operatingSystem: "Web", offers }]} />
      <IntervalProvider>
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          <Container className="relative py-14 md:py-20">
            <div className="max-w-text">
              <p className="text-micro font-semibold tracking-wide text-primary uppercase">{c.eyebrow}</p>
              <h1 className="mt-3 font-display text-h1 font-bold text-ink">{c.title}</h1>
              <p className="mt-5 text-lg text-ink-2">{c.text}</p>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-small text-ink-3">
              {facts.map((f) => (
                <li key={f} className="inline-flex items-start gap-1.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" strokeWidth={2.5} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <IntervalToggle copy={c.interval} className="mt-8" />
          </Container>
        </section>

        <section aria-label={c.plansLabel} className="bg-ground">
          <Container width="wide" className="py-12 md:py-16">
            <PlanCards locale={locale} plans={paid} copy={c.plan} trial={{ planId: trial.planId, days: trial.days }} hrefs={planHrefMap(paid)} />
            <div className="mt-6 flex items-start gap-2 text-small text-ink-3">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-medium text-ink-2">{c.tax.title}: </span>
                {c.tax.text}
              </p>
            </div>
            {enterprise ? (
              <div className="mt-10 md:mt-12">
                <EnterprisePanel plan={enterprise} copy={c.enterprise} />
              </div>
            ) : null}
          </Container>
        </section>

        <PricingSection id="included" title={c.includedSection.title} text={c.includedSection.text} tone="muted">
          <IncludedStrip features={shared} note={c.includedSection.note} />
        </PricingSection>

        <PricingSection id="tools" title={c.tools.title} text={c.tools.text} width="wide">
          <PricingToolsLazy locale={locale} plans={paid} finder={c.finder} calculator={c.calculator} thresholds={usage.thresholds} />
        </PricingSection>

        <PricingSection id="compare" title={c.matrix.title} text={c.matrix.text} tone="muted" width="wide">
          <ComparisonMatrix locale={locale} plans={plans} matrix={matrix} copy={c.matrix} labels={{ recommended: c.recommended, start: c.start, contactSales: c.contactSales }} />
        </PricingSection>

        <PricingSection id="events" title={c.whatCounts}>
          <EventDefinition text={c.whatCountsText} notCounted={usage.notCounted} copy={c.events} />
        </PricingSection>

        <PricingSection id="overage" title={c.overageTitle} tone="muted">
          <OverageSection locale={locale} intro={c.overageText} packs={packs} policy={usage} enterpriseName={enterprise?.name ?? "Enterprise"} copy={c.overageSection} />
        </PricingSection>

        <TrialNote locale={locale} trial={trial} copy={c.trial} />

        <PricingSection id="faq" title={c.faqTitle}>
          <PricingFaq items={faq} />
        </PricingSection>

        <FinalCta title={c.cta} text={c.ctaText} primary={{ label: c.start, href: signupHref(trial.planId, "monthly") }} secondary={{ label: c.contactSales, href: CONTACT_SALES_HREF }} />
      </IntervalProvider>
    </>
  );
}
