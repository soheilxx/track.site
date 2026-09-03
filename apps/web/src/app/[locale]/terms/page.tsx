import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL, operatorFromEnv } from "@/lib/legal-copy";
import { pick } from "@/lib/marketing-copy";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, LEGAL).terms;
  return { title: d.title, description: d.intro, alternates: alternatesFor("/terms", locale) };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage doc={pick(locale, LEGAL).terms} path="/terms" locale={locale} operator={operatorFromEnv()} />;
}
