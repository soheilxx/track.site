import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { TBody, Table, Td, Th, THead, Tr } from "@track-site/ui";
import { IntegrationGlyph } from "@/components/marketing/integrations/glyph";
import { JsonLd } from "@/components/marketing/json-ld";
import { legalRelated } from "@/components/marketing/legal-page";
import { PageIntro, PageSection, RelatedLinks, SectionHeading } from "@/components/marketing/secondary/shell";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { SUBPROCESSORS } from "@/lib/legal-copy";
import { SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { SUBPROCESSORS_UPDATED } from "@/lib/marketing-copy/secondary";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const s = pick(locale, SECONDARY_COPY).subprocessors;
  return pageMetadata({ locale, path: "/subprocessors", title: seoTitle(s.title), description: seoDescription(s.intro) });
}

/** Subprocessors: the processor table (stacked on small screens) and the customer-selected destination vendors. */
export default async function SubprocessorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, SECONDARY_COPY);
  const s = c.subprocessors;
  const vendors = INTEGRATIONS.filter((i) => i.group !== "commerce" && i.type !== "webhook");
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: s.title, path: "/subprocessors" }], locale)} />
      <PageIntro eyebrow={c.legal.eyebrow} title={s.title} text={s.intro} meta={`${c.common.updated}: ${SUBPROCESSORS_UPDATED} · ${s.updated}`} />

      <PageSection id="processors" labelledBy="processors-title">
        <SectionHeading id="processors-title" title={s.processorsTitle} level={2} className="[&>h2]:text-2xl" />
        <Table className="mt-6" caption={s.processorsTitle}>
          <THead>
            <tr>
              <Th>{s.columns.name}</Th>
              <Th>{s.columns.purpose}</Th>
              <Th>{s.columns.region}</Th>
              <Th>{s.columns.basis}</Th>
            </tr>
          </THead>
          <TBody>
            {SUBPROCESSORS.map((row) => (
              <Tr key={row.name}>
                <Td label={s.columns.name} className="font-medium text-ink">
                  {row.name}
                </Td>
                <Td label={s.columns.purpose} className="text-ink-2">
                  {row.purpose}
                </Td>
                <Td label={s.columns.region} className="text-ink-2">
                  {row.region}
                </Td>
                <Td label={s.columns.basis} className="text-ink-2">
                  {row.basis}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </PageSection>

      <PageSection id="vendors" labelledBy="vendors-title" tone="surface">
        <SectionHeading id="vendors-title" title={s.vendors} text={s.vendorsText} className="[&>h2]:text-2xl" />
        <ul className="mt-8 flex flex-wrap gap-2">
          {vendors.map((v) => (
            <li key={v.slug} className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] border border-line bg-ground py-1 pr-3.5 pl-1.5 text-small text-ink">
              <IntegrationGlyph monogram={v.monogram} category={v.category} size="sm" />
              {v.name}
            </li>
          ))}
        </ul>
        <RelatedLinks title={c.common.related} items={legalRelated(locale, "/subprocessors")} className="mt-12" />
      </PageSection>
    </>
  );
}
