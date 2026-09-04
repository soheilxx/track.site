import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container, ProductStage, TBody, Table, Td, Th, THead, Tr } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { legalRelated } from "@/components/marketing/legal-page";
import { anchorId } from "@/components/marketing/secondary/anchor";
import { SecurityFlowDiagram } from "@/components/marketing/secondary/diagrams";
import { PageIntro, PageSection, RelatedLinks, SectionHeading } from "@/components/marketing/page-shell";
import { PageToc } from "@/components/marketing/secondary/toc";
import { LEGAL, operatorFromEnv } from "@/lib/legal-copy";
import { SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, absoluteUrl, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, LEGAL).security;
  return pageMetadata({ locale, path: "/security", title: seoTitle(d.title), description: seoDescription(d.intro) });
}

/**
 * Security: the protected event path as a diagram on a dark stage, the controls as readable prose
 * beside a sticky table of contents, the same controls condensed into a table, and the disclosure
 * contact. The texts come from legal-copy.ts unchanged.
 */
export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, SECONDARY_COPY);
  const s = c.security;
  const d = pick(locale, LEGAL).security;
  const op = operatorFromEnv();
  const sections = d.sections.map((x, i) => ({ ...x, id: anchorId(x.title, i) }));
  const toc = [...sections.map((x) => ({ id: x.id, label: x.title })), { id: "controls", label: s.controls.title }, { id: "report", label: s.report.title }];
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: d.title, path: "/security" }], locale), { "@context": "https://schema.org", "@type": "WebPage", name: d.title, url: absoluteUrl("/security", locale), dateModified: d.updated, inLanguage: locale }]} />
      <PageIntro eyebrow={s.eyebrow} title={d.title} text={d.intro} meta={`${c.common.updated}: ${d.updated}`} />

      <PageSection id="flow" labelledBy="flow-title" tone="surface">
        <SectionHeading id="flow-title" title={s.flow.title} text={s.flow.text} />
        <ProductStage as="div" tone="dark" dots className="mt-8">
          <SecurityFlowDiagram copy={s.flow} title={s.flow.title} caption={s.flow.caption} />
        </ProductStage>
      </PageSection>

      <div className="border-t border-line">
        <Container className="py-10 md:py-16">
          <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
            <PageToc label={c.common.onThisPage} items={toc} />
            <article className="min-w-0">
              <div className="prose-track [&>section:first-child>h2]:mt-0">
                {sections.map((x) => (
                  <section key={x.id} id={x.id} aria-labelledby={`${x.id}-title`} className="scroll-mt-28">
                    <h2 id={`${x.id}-title`}>{x.title}</h2>
                    {x.paragraphs.map((p, i) => (
                      <p key={i} className="mt-3">
                        {p}
                      </p>
                    ))}
                    {x.bullets ? (
                      <ul className="mt-3">
                        {x.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>

              <section id="controls" aria-labelledby="controls-title" className="mt-14 scroll-mt-28">
                <h2 id="controls-title" className="font-display text-2xl font-semibold text-ink">
                  {s.controls.title}
                </h2>
                <p className="mt-2 max-w-text text-small text-ink-2">{s.controls.text}</p>
                <Table className="mt-6" caption={s.controls.title}>
                  <THead>
                    <tr>
                      <Th>{s.controls.columns.control}</Th>
                      <Th>{s.controls.columns.scope}</Th>
                      <Th>{s.controls.columns.mechanism}</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {s.controls.rows.map((r) => (
                      <Tr key={r.control}>
                        <Td label={s.controls.columns.control} className="font-medium text-ink">
                          {r.control}
                        </Td>
                        <Td label={s.controls.columns.scope} className="text-ink-2">
                          {r.scope}
                        </Td>
                        <Td label={s.controls.columns.mechanism} className="text-ink-2">
                          {r.mechanism}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </section>

              <section id="report" aria-labelledby="report-title" className="mt-14 max-w-text scroll-mt-28 rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
                <h2 id="report-title" className="font-display text-2xl font-semibold text-ink">
                  {s.report.title}
                </h2>
                <p className="mt-3 text-body text-ink-2">
                  {s.report.text}{" "}
                  {op.email ? (
                    <a href={`mailto:${op.email}`} className="font-medium text-primary underline underline-offset-4">
                      {op.email}
                    </a>
                  ) : (
                    <span className="text-warn">{s.report.missing}</span>
                  )}
                  . {s.report.ack}
                </p>
              </section>

              <RelatedLinks title={c.common.related} items={legalRelated(locale, "/security")} className="mt-12" />
            </article>
          </div>
        </Container>
      </div>
    </>
  );
}
