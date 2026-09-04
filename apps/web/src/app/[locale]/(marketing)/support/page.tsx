import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@track-site/ui";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { Checklist, FormPanel, LinkList, SplitLayout } from "@/components/marketing/page-shell";
import { FORM_COPY, SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const s = pick(locale, SECONDARY_COPY).support;
  return pageMetadata({ locale, path: "/support", title: seoTitle(s.title), description: seoDescription(s.intro) });
}

/** Support: self-help paths and the checklist on the left, the request form on the right. */
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = pick(locale, SECONDARY_COPY).support;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: s.title, path: "/support" }], locale)} />
      <Container className="py-12 md:py-20">
        <SplitLayout
          aside={
            <>
              <p className="text-micro font-semibold tracking-wide text-primary uppercase">{s.eyebrow}</p>
              <h1 className="mt-4 font-display text-h1 font-semibold text-ink">{s.title}</h1>
              <p className="mt-5 text-lg text-ink-2">{s.intro}</p>
              <h2 className="mt-10 text-h3 font-semibold text-ink">{s.before.title}</h2>
              <LinkList items={s.before.items} className="mt-4" />
              <h2 className="mt-10 text-h3 font-semibold text-ink">{s.include.title}</h2>
              <Checklist items={s.include.items} className="mt-4" />
            </>
          }
        >
          <FormPanel id="support-form" title={s.formTitle} footer={s.reply}>
            <ContactForm kind="support" locale={locale} copy={pick(locale, FORM_COPY)} messagePlaceholder={s.placeholder} />
          </FormPanel>
        </SplitLayout>
      </Container>
    </>
  );
}
