import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL, operatorFromEnv } from "@/lib/legal-copy";
import { pick } from "@/lib/marketing-copy";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const d = pick(locale, LEGAL).security;
  return { title: d.title, description: d.intro, alternates: alternatesFor("/security", locale) };
}

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const d = pick(locale, LEGAL).security;
  const op = operatorFromEnv();
  const de = locale === "de";
  return (
    <LegalPage
      doc={d}
      path="/security"
      locale={locale}
      extra={
        <section className="mt-10 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold text-ink">{de ? "Sicherheitslücken melden" : "Report a vulnerability"}</h2>
          <p className="mt-2 text-sm text-ink-2">{de ? "Bitte melde Schwachstellen verantwortungsvoll an" : "Please report vulnerabilities responsibly to"} {op.email ? <a href={`mailto:${op.email}`} className="text-primary hover:underline">{op.email}</a> : <span className="text-warn">{de ? "die im Impressum veröffentlichte Adresse" : "the address published in the imprint"}</span>}. {de ? "Wir bestätigen innerhalb von zwei Werktagen und veröffentlichen keine Meldenden ohne Zustimmung." : "We acknowledge within two business days and never name reporters without consent."}</p>
        </section>
      }
    />
  );
}
