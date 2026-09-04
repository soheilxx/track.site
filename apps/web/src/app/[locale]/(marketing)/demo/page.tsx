import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Clock } from "lucide-react";
import { Container } from "@track-site/ui";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { Checklist, FormPanel, SplitLayout } from "@/components/marketing/page-shell";
import { NumberedTimeline } from "@/components/marketing/secondary/timeline";
import { FORM_COPY, SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, SECONDARY_COPY).demo;
  return pageMetadata({ locale, path: "/demo", title: seoTitle(d.title), description: seoDescription(d.intro) });
}

/** Demo request: the agenda as a numbered timeline on the left, the request form on the right. */
export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const d = pick(locale, SECONDARY_COPY).demo;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: d.title, path: "/demo" }], locale)} />
      <Container className="py-12 md:py-20">
        <SplitLayout
          aside={
            <>
              <p className="text-micro font-semibold tracking-wide text-primary uppercase">{d.eyebrow}</p>
              <h1 className="mt-4 font-display text-h1 font-semibold text-ink">{d.title}</h1>
              <p className="mt-5 text-lg text-ink-2">{d.intro}</p>
              <p className="mt-4 inline-flex items-center gap-2 text-small text-ink-3">
                <Clock className="size-4" aria-hidden="true" />
                {d.duration}
              </p>
              <h2 className="mt-10 text-h3 font-semibold text-ink">{d.agendaTitle}</h2>
              <NumberedTimeline compact items={d.agenda.map((title) => ({ title }))} className="mt-5" />
              <h2 className="mt-10 text-h3 font-semibold text-ink">{d.prepare.title}</h2>
              <Checklist items={d.prepare.items} className="mt-4" />
              <p className="mt-8 border-l-2 border-primary pl-4 text-small text-ink-2">{d.honest}</p>
            </>
          }
        >
          <FormPanel id="demo-form" title={d.formTitle}>
            <ContactForm kind="demo" locale={locale} copy={pick(locale, FORM_COPY)} messagePlaceholder={d.placeholder} />
          </FormPanel>
        </SplitLayout>
      </Container>
    </>
  );
}
