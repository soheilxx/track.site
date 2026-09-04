import type { ReactNode } from "react";
import { Container, cn } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { anchorId } from "@/components/marketing/secondary/anchor";
import { PageIntro, RelatedLinks } from "@/components/marketing/secondary/shell";
import { PageToc, type TocItem } from "@/components/marketing/secondary/toc";
import type { LegalDoc, Operator } from "@/lib/legal-copy";
import { SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";

/** Locale-neutral paths of the legal and trust documents, for the related-pages row. */
export const LEGAL_PATHS = { privacy: "/privacy", terms: "/terms", dpa: "/data-processing", subprocessors: "/subprocessors", imprint: "/imprint", security: "/security" } as const;

/** Related-page chips for a legal document, excluding the page itself. */
export function legalRelated(locale: string, currentPath: string): Array<{ label: string; href: string }> {
  const labels = pick(locale, SECONDARY_COPY).legal.related;
  return (Object.keys(LEGAL_PATHS) as Array<keyof typeof LEGAL_PATHS>).filter((k) => LEGAL_PATHS[k] !== currentPath).map((k) => ({ label: labels[k], href: LEGAL_PATHS[k] }));
}

/**
 * Readable legal / trust document: intro, sticky table of contents on desktop (collapsed above the
 * text on small screens), prose at reading measure, an operator block where the law requires one.
 * Missing operator data is stated, never invented.
 */
export function LegalPage({ doc, path, locale, operator, extra, extraToc = [] }: { doc: LegalDoc; path: string; locale: string; operator?: Operator; extra?: ReactNode; extraToc?: TocItem[] }) {
  const c = pick(locale, SECONDARY_COPY);
  const sections = doc.sections.map((s, i) => ({ ...s, id: anchorId(s.title, i) }));
  const toc: TocItem[] = [...(operator ? [{ id: "operator", label: c.legal.operator.title }] : []), ...sections.map((s) => ({ id: s.id, label: s.title })), ...extraToc];
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: doc.title, path }], locale), { "@context": "https://schema.org", "@type": "WebPage", name: doc.title, url: absoluteUrl(path, locale), dateModified: doc.updated, inLanguage: locale }]} />
      <PageIntro eyebrow={c.legal.eyebrow} title={doc.title} text={doc.intro} meta={`${c.common.updated}: ${doc.updated}`} />
      <div className="border-t border-line">
        <Container className="py-10 md:py-16">
          <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
            <PageToc label={c.common.onThisPage} items={toc} />
            <article className="min-w-0">
              {operator ? (
                <section id="operator" aria-labelledby="operator-title" className="max-w-text scroll-mt-28">
                  <h2 id="operator-title" className="font-display text-2xl font-semibold text-ink">
                    {c.legal.operator.title}
                  </h2>
                  <OperatorBlock operator={operator} locale={locale} className="mt-4" />
                </section>
              ) : null}
              <div className={cn("prose-track [&>section:first-child>h2]:mt-0", operator && "mt-12")}>
                {sections.map((s) => (
                  <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28">
                    <h2 id={`${s.id}-title`}>{s.title}</h2>
                    {s.paragraphs.map((p, i) => (
                      <p key={i} className="mt-3">
                        {p}
                      </p>
                    ))}
                    {s.bullets ? (
                      <ul className="mt-3">
                        {s.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>
              {extra}
              <RelatedLinks title={c.common.related} items={legalRelated(locale, path)} className="mt-12" />
            </article>
          </div>
        </Container>
      </div>
    </>
  );
}

/** Operator identity as a definition list; every missing value is shown as such with a note. */
export function OperatorBlock({ operator, locale, className }: { operator: Operator; locale: string; className?: string }) {
  const labels = pick(locale, SECONDARY_COPY).legal.operator;
  const rows: Array<[string, string | null]> = [
    [labels.company, operator.company],
    [labels.address, operator.address],
    [labels.representatives, operator.representatives],
    [labels.email, operator.email],
    [labels.phone, operator.phone],
    [labels.register, operator.register],
    [labels.vatId, operator.vatId],
    [labels.dpo, operator.dpo],
  ];
  const missing = rows.filter(([, v]) => !v).length;
  return (
    <div className={className}>
      <dl className="divide-y divide-line border-y border-line text-small">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
            <dt className="text-ink-3">{k}</dt>
            <dd className="whitespace-pre-line text-ink">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {missing ? <p className="mt-4 text-small text-warn">{labels.missing}</p> : null}
    </div>
  );
}
