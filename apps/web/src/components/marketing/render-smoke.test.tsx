import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeAiSetup } from "@/components/marketing/home/ai-setup";
import { HomeFinalCta } from "@/components/marketing/home/final-cta";
import { HomeFlow } from "@/components/marketing/home/flow";
import { HomeHero } from "@/components/marketing/home/hero";
import { HomeKnowledge } from "@/components/marketing/home/knowledge";
import { HomeOutcomes } from "@/components/marketing/home/outcomes";
import { HomePlatforms } from "@/components/marketing/home/platforms";
import { HomePricingTeaser } from "@/components/marketing/home/pricing-teaser";
import { HomeTrust } from "@/components/marketing/home/trust";
import { HomeUseCases } from "@/components/marketing/home/use-cases";
import { HubEditorial } from "@/components/marketing/knowledge/hub/editorial";
import { HubProvider } from "@/components/marketing/knowledge/hub/provider";
import { DirectorySection, FeaturedStory, FreshLists, HubHero, LearningPaths, PlatformGuides, ProductCta, TopicWorlds } from "@/components/marketing/knowledge/hub/sections";
import { buildHubSearchResponse, getHubData, hubCopy, hubLabels, islandCopy } from "@/components/marketing/knowledge/hub/server";
import { ComparisonMatrix } from "@/components/marketing/pricing/comparison-matrix";
import { EnterprisePanel } from "@/components/marketing/pricing/enterprise-panel";
import { EventDefinition } from "@/components/marketing/pricing/event-definition";
import { IncludedStrip } from "@/components/marketing/pricing/included-strip";
import { IntervalProvider, IntervalToggle } from "@/components/marketing/pricing/interval";
import { OverageSection } from "@/components/marketing/pricing/overage-section";
import { PlanCards } from "@/components/marketing/pricing/plan-cards";
import { PricingFaq } from "@/components/marketing/pricing/pricing-faq";
import { PricingTools } from "@/components/marketing/pricing/pricing-tools";
import { TrialNote } from "@/components/marketing/pricing/trial-note";
import { KNOWLEDGE_NAME, KNOWLEDGE_PATH, KNOWLEDGE_TAXONOMY } from "@/lib/knowledge";
import { HOME_COPY, PRICING_COPY, pick } from "@/lib/marketing-copy";
import { localizedPath } from "@/lib/seo";
import { featureMatrix, publicOveragePacks, publicPlans, publicTrial, publicUsagePolicy, sharedPaidFeatures } from "@/server/pricing";

/*
 * Render smoke test: the section components of the marketing home, the pricing page and the
 * Tracking Knowledge hub are rendered with react-dom/server exactly as the pages compose them, with
 * real copy, the tariff catalogue and the knowledge content. It catches a section that throws, a
 * server/client boundary that breaks outside a browser and copy that leaks `undefined` into the
 * markup — without a dev server or a browser.
 */
vi.mock("server-only", () => ({}));
// `next/dynamic` with `ssr: false` bails out to client rendering on the server; render its placeholder instead
vi.mock("next/dynamic", () => ({ default: (_loader: unknown, options?: { loading?: () => ReactNode }) => options?.loading ?? (() => null) }));
// the app router is not mounted outside Next: hooks return inert values so client islands render their initial state
vi.mock("next/navigation", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
  return { ...actual, useRouter: () => router, usePathname: () => "/en", useSearchParams: () => new URLSearchParams() };
});

const LOCALE = "en";
const MESSAGES_DIR = path.join(process.cwd(), "messages", LOCALE);
const messages: Record<string, unknown> = Object.assign({}, ...readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(MESSAGES_DIR, f), "utf8")) as Record<string, unknown>));

function render(node: ReactNode): string {
  return renderToString(
    <NextIntlClientProvider locale={LOCALE} messages={messages} timeZone="Europe/Berlin">
      {node}
    </NextIntlClientProvider>,
  );
}

/** Text as React escapes it in HTML attributes and text nodes. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** No section may leak a missing value into the markup. */
function expectCleanMarkup(html: string) {
  expect(html.length).toBeGreaterThan(2000);
  expect(html).not.toMatch(/>\s*(?:undefined|null|NaN)\s*</);
  expect(html).not.toContain("[object Object]");
}

describe("marketing sections render on the server", () => {
  it("home: hero with the demo placeholder, platforms, outcomes, flow, AI setup, use cases, trust, knowledge, pricing teaser and final CTA", async () => {
    const copy = pick(LOCALE, HOME_COPY);
    const knowledge = await HomeKnowledge({ copy, locale: LOCALE });
    const html = render(
      <>
        <HomeHero copy={copy} />
        <HomePlatforms copy={copy} />
        <HomeOutcomes copy={copy} />
        <HomeFlow copy={copy} />
        <HomeAiSetup copy={copy} />
        <HomeUseCases copy={copy} />
        <HomeTrust copy={copy} />
        {knowledge}
        <HomePricingTeaser copy={copy} locale={LOCALE} />
        <HomeFinalCta copy={copy} />
      </>,
    );
    expectCleanMarkup(html);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(escapeHtml(copy.title));
    for (const title of [copy.outcomes.title, copy.flow.title, copy.aiSetup.title, copy.useCases.title, copy.trustSection.title, copy.knowledge.title, copy.pricing.title, copy.finalCta.title]) expect(html).toContain(escapeHtml(title));
    // the demo hydrates lazily: the server markup carries the labelled sample-data placeholder
    expect(html).toContain(escapeHtml(copy.demo.label));
    // one localized start link per CTA, never a button inside a link
    expect(html).toContain(`href="/${LOCALE}/pricing"`);
    expect(html).not.toMatch(/<a [^>]*>\s*<button/);
  });

  it("pricing: toggle, plan cards, enterprise panel, included strip, tools, comparison matrix, event definition, overage, trial and FAQ", () => {
    const c = pick(LOCALE, PRICING_COPY);
    const plans = publicPlans(LOCALE);
    const paid = plans.filter((p) => p.monthly && p.yearly && !p.contactSales);
    const enterprise = plans.find((p) => p.contactSales);
    const trial = publicTrial();
    const usage = publicUsagePolicy(LOCALE);
    expect(paid.length).toBe(3);
    expect(enterprise).toBeDefined();
    const html = render(
      <IntervalProvider>
        <IntervalToggle copy={c.interval} />
        <PlanCards locale={LOCALE} plans={paid} copy={c.plan} trial={{ planId: trial.planId, days: trial.days }} />
        <EnterprisePanel plan={enterprise!} copy={c.enterprise} />
        <IncludedStrip features={sharedPaidFeatures(LOCALE)} note={c.includedSection.note} />
        <PricingTools locale={LOCALE} plans={paid} finder={c.finder} calculator={c.calculator} thresholds={usage.thresholds} />
        <ComparisonMatrix locale={LOCALE} plans={plans} matrix={featureMatrix(LOCALE)} copy={c.matrix} labels={{ recommended: c.recommended, start: c.start, contactSales: c.contactSales }} />
        <EventDefinition text={c.whatCountsText} notCounted={usage.notCounted} copy={c.events} />
        <OverageSection locale={LOCALE} intro={c.overageText} packs={publicOveragePacks()} policy={usage} enterpriseName={enterprise!.name} copy={c.overageSection} />
        <TrialNote locale={LOCALE} trial={trial} copy={c.trial} />
        <PricingFaq items={c.faq} />
      </IntervalProvider>,
    );
    expectCleanMarkup(html);
    for (const p of paid) {
      expect(html).toContain(`data-plan="${p.id}"`);
      // every CTA carries the validated plan and the toggle's (monthly) default interval into signup
      expect(html).toContain(`href="/${LOCALE}/signup?plan=${p.id}&amp;interval=monthly"`);
    }
    expect(html).toContain(escapeHtml(c.matrix.title));
    expect(html).toContain(`href="/${LOCALE}/contact?topic=enterprise"`);
    expect(html).not.toMatch(/<a [^>]*>\s*<button/);
  });

  it("knowledge hub: hero + search, featured story, topic worlds, learning paths, guides, fresh lists, directory and product CTA", async () => {
    const c = hubCopy(LOCALE);
    const labels = hubLabels(LOCALE);
    const [response, data] = await Promise.all([buildHubSearchResponse(LOCALE, { q: "" }), getHubData(LOCALE)]);
    expect(response.corpus).toBeGreaterThan(0);
    expect(data.topics.length).toBeGreaterThan(0);
    const html = render(
      <>
        <HubProvider locale={LOCALE} copy={islandCopy(LOCALE)} taxonomy={KNOWLEDGE_TAXONOMY} initial={response}>
          <HubHero copy={c} corpus={response.corpus} topicCount={data.topics.length} languages={data.languages} formAction={localizedPath(KNOWLEDGE_PATH, LOCALE)} rssHref={localizedPath(`${KNOWLEDGE_PATH}/feed.xml`, LOCALE)} />
          <HubEditorial>
            {data.featured ? <FeaturedStory article={data.featured} locale={LOCALE} copy={c} labels={labels} /> : null}
            <TopicWorlds topics={data.topics} copy={c} />
            <LearningPaths paths={data.paths} copy={c} labels={labels} />
            <PlatformGuides platforms={data.guides.platforms} shopSystems={data.guides.shopSystems} copy={c} />
            <FreshLists published={data.published} updated={data.updated} locale={LOCALE} copy={c} labels={labels} />
          </HubEditorial>
          <DirectorySection copy={c} />
        </HubProvider>
        <ProductCta copy={c} />
      </>,
    );
    expectCleanMarkup(html);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(KNOWLEDGE_NAME);
    for (const title of [c.topics.title, c.paths.title, c.guides.title, c.fresh.newTitle, c.directory.title, c.cta.title]) expect(html).toContain(escapeHtml(title));
    // the directory lists the initial result set server-side (no JavaScript needed to read it)
    expect(count(html, `href="/${LOCALE}${KNOWLEDGE_PATH}/`)).toBeGreaterThanOrEqual(response.corpus);
    expect(html).not.toMatch(/<a [^>]*>\s*<button/);
  });
});
