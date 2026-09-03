import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal-copy";
import { pick } from "@/lib/marketing-copy";
import { alternatesFor } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, LEGAL)["data-processing"];
  return { title: seoTitle(d.title), description: seoDescription(d.intro), alternates: alternatesFor("/data-processing", locale) };
}

export default async function DataProcessingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage doc={pick(locale, LEGAL)["data-processing"]} path="/data-processing" locale={locale} />;
}
