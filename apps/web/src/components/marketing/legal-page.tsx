import { Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import type { LegalDoc, Operator } from "@/lib/legal-copy";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";

/** Renders a legal / trust document with an operator block; missing operator data is stated, never invented. */
export function LegalPage({ doc, path, locale, operator, extra }: { doc: LegalDoc; path: string; locale: string; operator?: Operator; extra?: React.ReactNode }) {
  const de = locale === "de";
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "track.site", path: "/" }, { name: doc.title, path }], locale), { "@context": "https://schema.org", "@type": "WebPage", name: doc.title, url: absoluteUrl(path, locale), dateModified: doc.updated, inLanguage: locale }]} />
      <Container className="max-w-3xl py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{doc.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{doc.intro}</p>
        <p className="mt-2 text-xs text-ink-3">{de ? "Stand" : "Last updated"}: {doc.updated}</p>
        {operator ? <OperatorBlock operator={operator} locale={locale} /> : null}
        <div className="mt-10 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.title}>
              <h2 className="font-display text-xl font-semibold text-ink">{s.title}</h2>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-3 text-ink-2">
                  {p}
                </p>
              ))}
              {s.bullets ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-2">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        {extra}
      </Container>
    </>
  );
}

export function OperatorBlock({ operator, locale }: { operator: Operator; locale: string }) {
  const de = locale === "de";
  const rows: Array<[string, string | null]> = [
    [de ? "Unternehmen" : "Company", operator.company],
    [de ? "Anschrift" : "Address", operator.address],
    [de ? "Vertretungsberechtigte" : "Represented by", operator.representatives],
    [de ? "E-Mail" : "E-mail", operator.email],
    [de ? "Telefon" : "Phone", operator.phone],
    [de ? "Registereintrag" : "Register", operator.register],
    [de ? "USt-IdNr." : "VAT ID", operator.vatId],
    [de ? "Datenschutzbeauftragte:r" : "Data protection officer", operator.dpo],
  ];
  const missing = rows.filter(([, v]) => !v).length;
  return (
    <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-ink whitespace-pre-line">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {missing ? <p className="mt-4 text-xs text-warn">{de ? "Diese Angaben werden vom Betreiber vor dem Start veröffentlicht (Umgebungsvariablen LEGAL_*)." : "These details are published by the operator before launch (LEGAL_* environment variables)."}</p> : null}
    </div>
  );
}
