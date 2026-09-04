import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { OperatorBlock, legalRelated } from "@/components/marketing/legal-page";
import { PageIntro, RelatedLinks } from "@/components/marketing/page-shell";
import { operatorFromEnv } from "@/lib/legal-copy";
import { SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const s = pick(locale, SECONDARY_COPY).imprint;
  return pageMetadata({ locale, path: "/imprint", title: seoTitle(s.title), description: seoDescription(s.intro), robots: { index: true, follow: false } });
}

/** Imprint: operator identity from the environment (missing values are stated), then the statutory notes as prose. */
export default async function ImprintPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, SECONDARY_COPY);
  const s = c.imprint;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: s.title, path: "/imprint" }], locale)} />
      <PageIntro eyebrow={c.legal.eyebrow} title={s.title} text={s.intro} />
      <div className="border-t border-line">
        <Container width="text" className="py-10 md:py-16">
          <section aria-labelledby="operator-title">
            <h2 id="operator-title" className="font-display text-2xl font-semibold text-ink">
              {c.legal.operator.title}
            </h2>
            <OperatorBlock operator={operatorFromEnv()} locale={locale} className="mt-4" />
          </section>
          <div className="prose-track mt-12">
            <p>{s.dispute}</p>
            <p>{s.liability}</p>
          </div>
          <RelatedLinks title={c.common.related} items={legalRelated(locale, "/imprint")} className="mt-12" />
        </Container>
      </div>
    </>
  );
}
