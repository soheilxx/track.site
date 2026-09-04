import type { Metadata } from "next";
import { Check } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Container } from "@track-site/ui";
import { hasIntegrationQuery, parseIntegrationQuery, toSearchable } from "@/components/marketing/integrations/catalog";
import { IntegrationsOverviewDiagram } from "@/components/marketing/integrations/diagrams";
import { IntegrationsExplorer, type ExplorerCopy, type ExplorerItem } from "@/components/marketing/integrations/explorer";
import { IntegrationsSection } from "@/components/marketing/integrations/sections";
import { JsonLd } from "@/components/marketing/json-ld";
import { FinalCta } from "@/components/marketing/page-shell";
import { INTEGRATIONS, INTEGRATION_MODES, catalogLang } from "@/lib/integrations-catalog";
import { INTEGRATIONS_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, absoluteUrl, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, INTEGRATIONS_COPY);
  const query = parseIntegrationQuery(await searchParams);
  return pageMetadata({
    locale,
    path: "/integrations",
    title: seoTitle(c.eyebrow),
    description: seoDescription(c.text),
    // filtered listings carry no content of their own: follow, but do not index
    ...(hasIntegrationQuery(query) ? { robots: { index: false, follow: true } } : {}),
  });
}

/**
 * Integrations overview (supplement §4): hero with the data-flow diagram, URL-synchronised search +
 * filters (Ads / Analytics / Commerce / Affiliate / Own systems × Browser / Server / Offline), the
 * three delivery modes explained, closing CTA. The initial result set is rendered on the server from
 * the URL so a shared filtered link never flashes the unfiltered list.
 */
export default async function IntegrationsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, INTEGRATIONS_COPY);
  const lang = catalogLang(locale);
  const query = parseIntegrationQuery(await searchParams);
  const items: ExplorerItem[] = INTEGRATIONS.map((i) => ({
    ...toSearchable(i, lang),
    monogram: i.monogram,
    kind: i.kind,
    accessNote: i.accessNote?.[lang] ?? null,
    access: i.access,
    verification: i.verification,
  }));
  const explorerCopy: ExplorerCopy = { ...c.explorer, categories: c.categories, categoryText: c.categoryText, modes: c.modes, access: c.access, verificationShort: c.verificationShort };
  const destinations = INTEGRATIONS.filter((i) => i.kind === "destination").length;
  const presets = INTEGRATIONS.find((i) => i.type === "affiliate")?.presets?.length ?? 0;
  const shops = INTEGRATIONS.filter((i) => i.kind === "source").length;
  const stats = [c.stats.destinations(destinations), c.stats.presets(presets), c.stats.shops(shops)];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.eyebrow, path: "/integrations" }], locale),
          { "@context": "https://schema.org", "@type": "ItemList", name: c.eyebrow, itemListElement: INTEGRATIONS.map((i, n) => ({ "@type": "ListItem", position: n + 1, name: i.name, url: absoluteUrl(`/integrations/${i.slug}`, locale) })) },
        ]}
      />
      <section className="border-b border-line">
        <Container className="grid gap-10 py-14 md:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <p className="text-micro font-semibold tracking-wide text-primary uppercase">{c.eyebrow}</p>
            <h1 className="mt-3 font-display text-h1 text-ink">{c.title}</h1>
            <p className="mt-5 max-w-text text-body text-ink-2">{c.text}</p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              {stats.map((s) => (
                <li key={s} className="inline-flex items-center gap-2 text-small font-medium text-ink-2">
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-card sm:p-6">
            <IntegrationsOverviewDiagram copy={c.diagram} />
          </div>
        </Container>
      </section>

      <IntegrationsSection>
        <Suspense fallback={null}>
          <IntegrationsExplorer items={items} copy={explorerCopy} initial={query} />
        </Suspense>
      </IntegrationsSection>

      <IntegrationsSection tone="surface" title={c.modesSection.title} text={c.modesSection.text}>
        <div className="grid gap-8 md:grid-cols-3">
          {INTEGRATION_MODES.map((m) => (
            <div key={m} className="min-w-0">
              <h3 className="font-display text-h3 text-ink">{c.modes[m]}</h3>
              <p className="mt-2 text-small text-ink-2">{c.modeText[m]}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 max-w-text border-l-2 border-primary pl-5">
          <h3 className="text-base font-semibold text-ink">{c.modesSection.hybridTitle}</h3>
          <p className="mt-2 text-small text-ink-2">{c.modesSection.hybridText}</p>
        </div>
      </IntegrationsSection>

      <FinalCta title={c.cta} text={c.ctaText} primary={{ label: c.start, href: "/signup" }} secondary={{ label: c.how, href: "/how-it-works" }} />
    </>
  );
}
