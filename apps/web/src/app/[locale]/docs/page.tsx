import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CodeBlock, ProductStage, TBody, Table, Td, Th, THead, Tr } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { PipelineDiagram } from "@/components/marketing/secondary/diagrams";
import { ArrowLink, PageIntro, PageSection, SectionHeading } from "@/components/marketing/secondary/shell";
import { NumberedTimeline } from "@/components/marketing/secondary/timeline";
import { PageToc } from "@/components/marketing/secondary/toc";
import { SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, SECONDARY_COPY).docs;
  return pageMetadata({ locale, path: "/docs", title: seoTitle(d.title), description: seoDescription(d.intro) });
}

/**
 * Documentation: quickstart as a three-step timeline, the event path as a diagram, the guides at
 * reading measure beside a sticky table of contents, and the endpoint reference as a table.
 */
export default async function DocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, SECONDARY_COPY);
  const d = c.docs;
  const toc = [...d.guides.map((g) => ({ id: g.id, label: g.title })), { id: "reference", label: d.reference.title }];
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: d.title, path: "/docs" }], locale), { "@context": "https://schema.org", "@type": "TechArticle", headline: d.title, description: d.intro, inLanguage: locale }]} />
      <PageIntro eyebrow={d.eyebrow} title={d.title} text={d.intro}>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <ArrowLink href="/integrations">{d.links.integrations}</ArrowLink>
          <ArrowLink href="/tracking-knowledge">{d.links.knowledge}</ArrowLink>
          <ArrowLink href="/support">{d.links.support}</ArrowLink>
        </div>
      </PageIntro>

      <PageSection id="quickstart" labelledBy="quickstart-title" tone="surface">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading id="quickstart-title" title={d.quickstart.title} text={d.quickstart.text} />
          </div>
          <div className="min-w-0 lg:col-span-8">
            <NumberedTimeline items={d.quickstart.steps} outcomeLabel={d.quickstart.outcomeLabel} />
          </div>
        </div>
      </PageSection>

      <PageSection id="flow" labelledBy="flow-title">
        <SectionHeading id="flow-title" title={d.flow.title} text={d.flow.text} />
        <ProductStage as="div" tone="light" className="mt-8">
          <PipelineDiagram copy={d.flow} title={d.flow.title} caption={d.flow.caption} />
        </ProductStage>
      </PageSection>

      <PageSection id="guides" labelledBy="guides-title" tone="surface">
        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          <PageToc label={d.toc} items={toc} />
          <div className="min-w-0">
            <h2 id="guides-title" className="font-display text-h2 font-semibold text-ink">
              {d.guidesTitle}
            </h2>
            <div className="mt-8 space-y-12">
              {d.guides.map((g) => (
                <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="max-w-text scroll-mt-28">
                  <h3 id={`${g.id}-title`} className="text-h3 font-semibold text-ink">
                    {g.title}
                  </h3>
                  <p className="mt-3 text-body text-ink-2">{g.text}</p>
                  {g.code ? <CodeBlock className="mt-4" code={g.code} language={g.language} title={g.codeTitle} tone="stage" copyLabel={c.common.copy} copiedLabel={c.common.copied} /> : null}
                  {g.bullets ? (
                    <ul className="mt-4 list-disc space-y-1.5 pl-5 text-small text-ink-2">
                      {g.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
            </div>

            <section id="reference" aria-labelledby="reference-title" className="mt-16 scroll-mt-28">
              <h3 id="reference-title" className="text-h3 font-semibold text-ink">
                {d.reference.title}
              </h3>
              <p className="mt-2 max-w-text text-small text-ink-2">{d.reference.text}</p>
              <Table className="mt-6" caption={d.reference.title}>
                <THead>
                  <tr>
                    <Th>{d.reference.columns.endpoint}</Th>
                    <Th>{d.reference.columns.purpose}</Th>
                    <Th>{d.reference.columns.notes}</Th>
                  </tr>
                </THead>
                <TBody>
                  {d.reference.rows.map((r) => (
                    <Tr key={r.endpoint}>
                      <Td label={d.reference.columns.endpoint}>
                        <code className="font-mono text-[13px] text-ink">{r.endpoint}</code>
                      </Td>
                      <Td label={d.reference.columns.purpose} className="text-ink-2">
                        {r.purpose}
                      </Td>
                      <Td label={d.reference.columns.notes} className="text-ink-2">
                        {r.notes}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </section>
          </div>
        </div>
      </PageSection>
    </>
  );
}
