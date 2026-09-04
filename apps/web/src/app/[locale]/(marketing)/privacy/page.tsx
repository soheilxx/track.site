import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL, operatorFromEnv } from "@/lib/legal-copy";
import { pick } from "@/lib/marketing-copy";
import { pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, LEGAL).privacy;
  return pageMetadata({ locale, path: "/privacy", title: seoTitle(d.title), description: seoDescription(d.intro) });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage doc={pick(locale, LEGAL).privacy} path="/privacy" locale={locale} operator={operatorFromEnv()} />;
}
