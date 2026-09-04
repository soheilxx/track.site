import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Building2 } from "lucide-react";
import { Banner, Container } from "@track-site/ui";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { FormPanel, LinkList, SplitLayout, TopicList } from "@/components/marketing/page-shell";
import { FORM_COPY, SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = pick(locale, SECONDARY_COPY).contact;
  return pageMetadata({ locale, path: "/contact", title: seoTitle(c.title), description: seoDescription(c.intro) });
}

/** Contact: topics as a definition list and alternative paths on the left, the form on the right. */
export default async function ContactPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ topic?: string }> }) {
  const { locale } = await params;
  const { topic } = await searchParams;
  setRequestLocale(locale);
  const c = pick(locale, SECONDARY_COPY).contact;
  const enterprise = topic === "enterprise";
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.title, path: "/contact" }], locale), { "@context": "https://schema.org", "@type": "ContactPage", name: c.title }]} />
      <Container className="py-12 md:py-20">
        <SplitLayout
          aside={
            <>
              <p className="text-micro font-semibold tracking-wide text-primary uppercase">{c.eyebrow}</p>
              <h1 className="mt-4 font-display text-h1 font-semibold text-ink">{c.title}</h1>
              <p className="mt-5 text-lg text-ink-2">{c.intro}</p>
              <h2 className="mt-10 text-h3 font-semibold text-ink">{c.topics.title}</h2>
              <TopicList items={c.topics.items} className="mt-4" />
              <h2 className="mt-10 text-h3 font-semibold text-ink">{c.other.title}</h2>
              <LinkList items={c.other.items} className="mt-4" />
            </>
          }
        >
          {enterprise ? (
            <Banner tone="neutral" icon={<Building2 className="size-4" aria-hidden="true" />} className="mb-6">
              {c.enterprise}
            </Banner>
          ) : null}
          <FormPanel id="contact-form" title={c.formTitle}>
            <ContactForm kind="contact" locale={locale} topic={enterprise ? "enterprise" : undefined} copy={pick(locale, FORM_COPY)} />
          </FormPanel>
        </SplitLayout>
      </Container>
    </>
  );
}
