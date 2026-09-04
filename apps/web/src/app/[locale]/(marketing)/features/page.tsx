import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { ProductStage, Tab, TabList, TabPanel, Tabs } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { BeforeAfter } from "@/components/marketing/features/comparison";
import { FeatureIndex } from "@/components/marketing/features/feature-index";
import { scenarioFlow } from "@/components/marketing/features/feature-view";
import { FlowDiagram } from "@/components/marketing/features/flow-diagram";
import { FinalCta, Narrative, PageIntro, PageSection, SectionHeading } from "@/components/marketing/page-shell";
import { pick } from "@/lib/marketing-copy";
import { FEATURES, FEATURES_PAGE_COPY, FEATURE_UI_COPY } from "@/lib/marketing-copy/features";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, FEATURES_PAGE_COPY);
  return pageMetadata({ locale, path: "/features", title: seoTitle(c.eyebrow), description: seoDescription(c.text) });
}

export default async function FeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, FEATURES_PAGE_COPY);
  const ui = pick(locale, FEATURE_UI_COPY);
  const features = pick(locale, FEATURES);
  const hero = scenarioFlow("granted", ui);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.eyebrow, path: "/features" }], locale)} />

      <PageIntro width="wide" spacing="lg" eyebrow={c.eyebrow} title={c.title} text={c.text} primary={{ label: c.cta, href: "/signup" }} secondary={{ label: c.ctaSecondary, href: "/how-it-works" }}>
        <ProductStage tone="dark" dots padding="md">
          <FlowDiagram title={c.stage.title} description={c.stage.description} caption={c.stage.caption} labels={ui.diagram} paths={hero.paths} gate={hero.gate} destinations={hero.destinations} />
        </ProductStage>
      </PageIntro>

      <PageSection spacing="lg" tone="surface" labelledBy="scenarios-title">
        <SectionHeading id="scenarios-title" title={c.scenarios.title} text={c.scenarios.text} />
        <Tabs defaultValue="granted" className="mt-10">
          <TabList aria-label={c.scenarios.tabsLabel} variant="pill">
            {c.scenarios.items.map((s) => (
              <Tab key={s.id} value={s.id}>
                {s.label}
              </Tab>
            ))}
          </TabList>
          {c.scenarios.items.map((s) => {
            const flow = scenarioFlow(s.id, ui);
            return (
              <TabPanel key={s.id} value={s.id} keepMounted className="pt-8">
                <Narrative
                  text={
                    <div>
                      <h3 className="text-h3 font-semibold text-ink">{s.title}</h3>
                      <p className="mt-3 text-body text-ink-2">{s.text}</p>
                      <ul className="mt-5 space-y-2">
                        {s.points.map((p) => (
                          <li key={p} className="flex items-start gap-2 text-small text-ink-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  }
                  visual={
                    <ProductStage as="div" tone="light" padding="md">
                      <FlowDiagram title={s.title} description={ui.diagram.describe(flow.paths, flow.gate)} labels={ui.diagram} paths={flow.paths} gate={flow.gate} destinations={flow.destinations} />
                    </ProductStage>
                  }
                />
              </TabPanel>
            );
          })}
        </Tabs>
      </PageSection>

      <PageSection spacing="lg" labelledBy="index-title">
        <SectionHeading id="index-title" title={c.index.title} text={c.index.text} />
        <div className="mt-14 md:mt-20">
          <FeatureIndex features={features} ui={ui} more={c.index.more} />
        </div>
      </PageSection>

      <PageSection spacing="lg" tone="surface" labelledBy="comparison-title">
        <SectionHeading id="comparison-title" title={c.comparison.title} text={c.comparison.text} />
        <BeforeAfter comparison={c.comparison} className="mt-10" />
      </PageSection>

      <PageSection spacing="lg" labelledBy="trust-title">
        <SectionHeading id="trust-title" title={c.trust.title} />
        <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {c.trust.items.map((item) => (
            <div key={item.title} className="border-t border-line-2 pt-4">
              <dt className="font-semibold text-ink">{item.title}</dt>
              <dd className="mt-2 text-small text-ink-2">{item.text}</dd>
            </div>
          ))}
        </dl>
      </PageSection>

      <FinalCta title={c.closing.title} text={c.closing.text} primary={{ label: c.closing.cta, href: "/signup" }} secondary={{ label: c.closing.secondary, href: "/pricing" }} />
    </>
  );
}
