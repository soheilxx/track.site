import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { CodeBlock, ProductStage, TBody, Tab, TabList, TabPanel, Table, Tabs, Td, Th, THead, Tr } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { TechnicalChecks } from "@/components/marketing/features/checks";
import { FaqList, faqJsonLd } from "@/components/marketing/features/faq";
import { modeFlow } from "@/components/marketing/features/feature-view";
import { FlowDiagram } from "@/components/marketing/features/flow-diagram";
import { MilestoneTimeline } from "@/components/marketing/features/milestones";
import { AiSetupView, HealthScoreView, PublishedVersionView } from "@/components/marketing/features/product-views";
import { FinalCta, Narrative, PageIntro, PageSection, SectionHeading } from "@/components/marketing/page-shell";
import { pick } from "@/lib/marketing-copy";
import { FEATURE_UI_COPY } from "@/lib/marketing-copy/features";
import { HOW_IT_WORKS } from "@/lib/marketing-copy/how-it-works";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, HOW_IT_WORKS);
  return pageMetadata({ locale, path: "/how-it-works", title: seoTitle(c.eyebrow), description: seoDescription(c.intro) });
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, HOW_IT_WORKS);
  const ui = pick(locale, FEATURE_UI_COPY);
  const hero = modeFlow("hybrid", ui);
  const milestoneVisuals = [
    <div key="snippet">
      <CodeBlock code={c.snippet.code} language="html" title={c.snippet.title} copyLabel={c.snippet.copy} copiedLabel={c.snippet.copied} wrap />
      <p className="mt-3 text-small text-ink-3">{c.snippet.note}</p>
    </div>,
    <AiSetupView key="setup" ui={ui} />,
    <PublishedVersionView key="published" published={c.published} ui={ui} />,
    <HealthScoreView key="health" ui={ui} />,
  ];
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.eyebrow, path: "/how-it-works" }], locale),
          faqJsonLd(c.faq),
          { "@context": "https://schema.org", "@type": "HowTo", name: c.title, description: c.intro, step: c.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.text })) },
        ]}
      />

      <PageIntro width="wide" spacing="lg" eyebrow={c.eyebrow} title={c.title} text={c.intro} primary={{ label: c.cta, href: "/signup" }} secondary={{ label: c.ctaSecondary, href: "/features" }}>
        <ProductStage tone="dark" dots padding="md">
          <FlowDiagram title={c.stage.title} description={c.stage.description} caption={c.stage.caption} labels={ui.diagram} paths={hero.paths} gate={hero.gate} destinations={hero.destinations} />
        </ProductStage>
      </PageIntro>

      <PageSection spacing="lg" tone="surface" labelledBy="milestones-title">
        <SectionHeading id="milestones-title" title={c.milestonesTitle} text={c.milestonesText} />
        <div className="mt-12 md:mt-16">
          <MilestoneTimeline items={c.steps} youLabel={c.youLabel} outcomeLabel={c.outcomeLabel} visuals={milestoneVisuals} />
        </div>
      </PageSection>

      <PageSection spacing="lg" labelledBy="flows-title">
        <SectionHeading id="flows-title" title={c.flows.title} text={c.flows.text} />
        <Tabs defaultValue="hybrid" className="mt-10">
          <TabList aria-label={c.flows.tabsLabel} variant="pill">
            {c.flows.items.map((tab) => (
              <Tab key={tab.id} value={tab.id}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
          {c.flows.items.map((tab) => {
            const flow = modeFlow(tab.id, ui);
            return (
              <TabPanel key={tab.id} value={tab.id} keepMounted className="pt-8">
                <Narrative
                  text={
                    <div>
                      <h3 className="text-h3 font-semibold text-ink">{tab.title}</h3>
                      <p className="mt-3 text-body text-ink-2">{tab.text}</p>
                      <ul className="mt-5 space-y-2">
                        {tab.points.map((p) => (
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
                      <FlowDiagram title={tab.title} description={ui.diagram.describe(flow.paths, flow.gate)} labels={ui.diagram} paths={flow.paths} gate={flow.gate} destinations={flow.destinations} />
                    </ProductStage>
                  }
                />
              </TabPanel>
            );
          })}
        </Tabs>
      </PageSection>

      <PageSection spacing="lg" tone="surface" labelledBy="checks-title">
        <TechnicalChecks headingId="checks-title" title={c.checks.title} summary={c.checks.summary} intro={c.checks.intro} groups={c.checks.groups} />
      </PageSection>

      <PageSection spacing="lg" labelledBy="architecture-title">
        <SectionHeading id="architecture-title" title={c.architectureTitle} text={c.architectureText} />
        <div className="mt-10 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
          <Table caption={c.architectureTitle}>
            <THead>
              <tr>
                <Th className="px-5 py-3 md:w-[24%]">{c.architectureColumns.component}</Th>
                <Th className="px-5 py-3">{c.architectureColumns.responsibility}</Th>
              </tr>
            </THead>
            <TBody>
              {c.architecture.map((row) => (
                <Tr key={row.title}>
                  <Td label={c.architectureColumns.component} className="px-5 py-4 font-semibold text-ink">
                    {row.title}
                  </Td>
                  <Td label={c.architectureColumns.responsibility} className="px-5 py-4 text-ink-2">
                    {row.text}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </PageSection>

      <PageSection spacing="lg" tone="surface" labelledBy="faq-title">
        <SectionHeading id="faq-title" title={c.faqTitle} />
        <div className="mt-8">
          <FaqList items={c.faq} />
        </div>
      </PageSection>

      <FinalCta title={c.closing.title} text={c.closing.text} primary={{ label: c.closing.cta, href: "/signup" }} secondary={{ label: c.closing.secondary, href: "/docs" }} />
    </>
  );
}
