import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Breadcrumbs, ProductStage, type LinkRenderer } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { BeforeAfter } from "@/components/marketing/features/comparison";
import { FaqList, faqJsonLd } from "@/components/marketing/features/faq";
import { FeatureFlowDiagram, FeatureProductView } from "@/components/marketing/features/feature-view";
import { FinalCta, Narrative, PageIntro, PageSection, SectionHeading } from "@/components/marketing/page-shell";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pick } from "@/lib/marketing-copy";
import { FEATURES, FEATURE_DETAIL_COPY, FEATURE_UI_COPY } from "@/lib/marketing-copy/features";
import { FEATURE_PAGES } from "@/lib/routes";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => FEATURE_PAGES.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const f = pick(locale, FEATURES).find((x) => x.slug === slug);
  if (!f) return {};
  return pageMetadata({ locale, path: `/features/${slug}`, title: seoTitle(f.title), description: seoDescription(f.short) });
}

/** next-intl's <Link> as the breadcrumb link renderer (locale prefix added automatically). */
const BreadcrumbLink: LinkRenderer = ({ href, ...rest }) => <Link href={href} {...rest} />;

export default async function FeaturePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const all = pick(locale, FEATURES);
  const f = all.find((x) => x.slug === slug);
  if (!f) notFound();
  const l = pick(locale, FEATURE_DETAIL_COPY);
  const ui = pick(locale, FEATURE_UI_COPY);
  const others = all.filter((x) => x.slug !== slug);
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: l.features, path: "/features" }, { name: f.title, path: `/features/${slug}` }], locale), faqJsonLd(f.faq)]} />

      <PageIntro
        width="wide"
        spacing="lg"
        eyebrow={l.features}
        title={f.title}
        text={f.benefit}
        primary={{ label: l.start, href: "/signup" }}
        secondary={{ label: l.pricing, href: "/pricing" }}
        above={<Breadcrumbs className="mb-8" label={l.breadcrumb} linkComponent={BreadcrumbLink} items={[{ label: BRAND_NAME, href: "/" }, { label: l.features, href: "/features" }, { label: f.title }]} />}
      >
        <ProductStage tone="dark" dots padding="md">
          <FeatureProductView slug={slug} ui={ui} />
          <p className="mt-4 text-small text-ink-2">{f.viewCaption}</p>
        </ProductStage>
      </PageIntro>

      <PageSection spacing="lg" tone="surface" labelledBy="flow-title">
        <Narrative
          text={
            <div>
              <h2 id="flow-title" className="font-display text-h2 font-semibold text-ink">
                {f.flow.title}
              </h2>
              <p className="mt-4 text-body text-ink-2 md:text-lg">{f.intro}</p>
              <p className="mt-4 text-body text-ink-2">{f.flow.text}</p>
            </div>
          }
          visual={
            <ProductStage as="div" tone="light" padding="md">
              <FeatureFlowDiagram slug={slug} ui={ui} title={f.flow.title} caption={f.flow.caption} />
            </ProductStage>
          }
        />
      </PageSection>

      <PageSection spacing="lg" labelledBy="built-title">
        <SectionHeading id="built-title" title={l.howBuilt} text={l.howBuiltText} />
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {f.sections.map((s, i) => (
            <li key={s.title} className="border-t border-line-2 pt-5">
              <p className="font-display text-small font-semibold text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-h3 font-semibold text-ink">{s.title}</h3>
              <p className="mt-3 text-body text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection spacing="lg" tone="surface" labelledBy="compare-title">
        <SectionHeading id="compare-title" title={f.comparison.title} text={f.comparison.text} />
        <BeforeAfter comparison={f.comparison} className="mt-10" />
      </PageSection>

      <PageSection spacing="lg" labelledBy="proof-title">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <SectionHeading id="proof-title" title={l.proof} text={l.proofText} />
          </div>
          <ul className="grid gap-3 lg:col-span-7">
            {f.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 border-b border-line pb-3 text-body text-ink">
                <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </PageSection>

      <PageSection spacing="lg" tone="surface" labelledBy="faq-title">
        <SectionHeading id="faq-title" title={l.faq} />
        <div className="mt-8">
          <FaqList items={f.faq} />
        </div>
      </PageSection>

      <PageSection spacing="lg" labelledBy="more-title">
        <SectionHeading id="more-title" title={l.more} text={l.moreText} />
        <ul className="mt-8 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((x) => (
            <li key={x.slug} className="border-t border-line py-4">
              <Link href={`/features/${x.slug}`} className="inline-block min-h-11 rounded-sm py-1 font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {x.title}
              </Link>
              <p className="text-small text-ink-2">{x.short}</p>
            </li>
          ))}
        </ul>
      </PageSection>

      <FinalCta title={l.cta} text={l.ctaText} primary={{ label: l.start, href: "/signup" }} secondary={{ label: l.pricing, href: "/pricing" }} />
    </>
  );
}
