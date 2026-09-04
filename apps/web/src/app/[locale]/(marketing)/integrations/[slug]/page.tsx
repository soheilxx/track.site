import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Alert, Badge, Container, Status } from "@track-site/ui";
import { relatedKnowledgeFor } from "@/components/marketing/integrations/catalog";
import { IntegrationFlowDiagram } from "@/components/marketing/integrations/diagrams";
import { IntegrationGlyph } from "@/components/marketing/integrations/glyph";
import { CheckList, Code, FactList, IntegrationBreadcrumbs, IntegrationsSection, Milestones, RelatedKnowledge } from "@/components/marketing/integrations/sections";
import { integrationText, publicIdLabel } from "@/components/marketing/integrations/text";
import { JsonLd } from "@/components/marketing/json-ld";
import { Faq, FinalCta, faqJsonLd } from "@/components/marketing/page-shell";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { INTEGRATIONS, integrationBySlug, integrationModes } from "@/lib/integrations-catalog";
import { CONTENT_TYPE_LABELS, KNOWLEDGE_PATH, articlePath, labelFor, listArticles } from "@/lib/knowledge";
import { INTEGRATIONS_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => INTEGRATIONS.map((i) => ({ locale, slug: i.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const i = integrationBySlug(slug);
  if (!i) return {};
  return pageMetadata({ locale, path: `/integrations/${slug}`, title: seoTitle(i.name), description: seoDescription(integrationText(i, locale).summary) });
}

/**
 * Integration detail page: what is sent (or received), the supported delivery modes as a data-flow
 * diagram, dedup field, required identifiers and credentials, consent purpose, three to four setup
 * milestones, related Tracking Knowledge articles and the FAQ. Every fact comes from the catalogue,
 * which is cross-checked against the connector registry in tests.
 */
export default async function IntegrationPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const i = integrationBySlug(slug);
  if (!i) notFound();
  const c = pick(locale, INTEGRATIONS_COPY);
  const d = c.detail;
  const text = integrationText(i, locale);
  const modes = integrationModes(i);
  const isSource = i.kind === "source";
  const faq = isSource ? d.faq.source : d.faq.destination;
  const steps = isSource ? d.setup.source : d.setup.destination;
  const related = relatedKnowledgeFor(i, await listArticles(locale), 3).map((a) => ({
    href: articlePath(a.slug),
    title: a.title,
    description: a.description,
    typeLabel: labelFor(CONTENT_TYPE_LABELS[a.contentType], locale),
    readingLabel: d.knowledge.minutes(a.readingMinutes),
  }));
  const clickIds = i.clickIds.join(", ");
  const sent = isSource
    ? d.receives.items
    : [d.sends.event, i.dedupField ? d.sends.eventId(i.dedupField) : d.sends.eventIdNoField, i.clickIds.length ? d.sends.clickIds(clickIds) : d.sends.noClickIds, d.sends.order, i.hashedMatching ? d.sends.hashed : d.sends.noHashed, d.sends.consent];
  const never = isSource ? d.receives.never : d.sends.never;
  const verificationText = `${c.verification[i.verification]}${i.verifiedAt ? ` · ${c.verifiedOn(i.verifiedAt)}` : ""}`;

  const facts = [
    {
      term: isSource ? d.facts.pairing : d.facts.dedup,
      value: (
        <>
          {i.dedupField ? <Code>{i.dedupField}</Code> : null}
          {i.dedupField ? " — " : ""}
          {i.dedup}
        </>
      ),
    },
    ...(isSource ? [] : [{ term: d.facts.clickIds, value: i.clickIds.length ? i.clickIds.map((id, n) => <span key={id}>{n > 0 ? ", " : ""}<Code>{id}</Code></span>) : d.facts.none }]),
    { term: d.facts.purpose, value: c.purposes[i.consentPurpose] },
    ...(i.apiVersion ? [{ term: d.facts.apiVersion, value: <Code>{i.apiVersion}</Code> }] : []),
    { term: d.facts.status, value: verificationText },
    ...(i.presets ? [{ term: d.facts.presets, value: i.presets.join(", ") }] : []),
    {
      term: d.facts.docs,
      value: i.docsUrl ? (
        <a href={i.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
          {d.facts.docsLink(i.shortName)} <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : (
        <Link href="/docs" className="text-primary underline-offset-4 hover:underline">
          {d.facts.ownDocs}
        </Link>
      ),
    },
  ];

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.breadcrumbs.label, path: "/integrations" }, { name: i.name, path: `/integrations/${slug}` }], locale), faqJsonLd(faq)]} />

      <section className="border-b border-line">
        <Container className="py-10 md:py-16">
          <IntegrationBreadcrumbs label={c.breadcrumbs.nav} items={[{ label: c.breadcrumbs.home, href: "/" }, { label: c.breadcrumbs.label, href: "/integrations" }, { label: i.name }]} />
          <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <IntegrationGlyph monogram={i.monogram} category={i.category} size="lg" className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="text-micro font-semibold tracking-wide text-primary uppercase">{d.eyebrow[i.kind]}</p>
              <h1 className="mt-2 font-display text-h1 text-ink">{i.name}</h1>
              <p className="mt-4 max-w-text text-body text-ink-2">{text.summary}</p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {modes.map((m) => (
                  <Badge key={m} tone="primary">
                    {c.modes[m]}
                  </Badge>
                ))}
                <Status tone="ok" indicator="icon" chip>
                  {verificationText}
                </Status>
                {i.access !== "open" ? (
                  <Status tone="warn" indicator="icon" chip>
                    {c.access[i.access]}
                  </Status>
                ) : null}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <IntegrationsSection>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <h2 className="font-display text-h2 text-ink">{d.flow.title(i.shortName)}</h2>
            <p className="mt-3 text-body text-ink-2">{d.flow.text[i.kind]}</p>
            <ul className="mt-6 space-y-3 text-small text-ink-2">
              {isSource ? (
                <>
                  <li>{d.sourceModes.browser}</li>
                  <li>{d.sourceModes.server}</li>
                </>
              ) : (
                <>
                  {modes.map((m) => (
                    <li key={m}>{d.modeDetail[m]}</li>
                  ))}
                  {i.browser && i.server ? <li>{i.dedupField ? d.hybrid(i.dedupField) : d.hybridNoField}</li> : null}
                </>
              )}
            </ul>
          </div>
          <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-card sm:p-6">
            <IntegrationFlowDiagram kind={i.kind} modes={modes} name={i.shortName} purposeLabel={c.purposes[i.consentPurpose]} copy={{ title: d.flow.diagramTitle(i.shortName), description: d.flow.text[i.kind], caption: d.flow.caption[i.kind], nodes: d.flow.nodes, edges: d.flow.edges }} />
          </div>
        </div>
        {text.accessNote ? (
          <Alert tone="warn" title={d.prerequisites} className="mt-10 max-w-text">
            {text.accessNote}
          </Alert>
        ) : null}
      </IntegrationsSection>

      <IntegrationsSection tone="surface" title={isSource ? d.receives.title : d.sends.title} text={isSource ? d.receives.intro : d.sends.intro}>
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <CheckList kind="sent" items={sent} />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{isSource ? d.receives.neverTitle : d.sends.neverTitle}</h3>
            <CheckList kind="never" items={never} className="mt-4" />
          </div>
        </div>
      </IntegrationsSection>

      <IntegrationsSection title={d.facts.title}>
        <FactList rows={facts} />
      </IntegrationsSection>

      <IntegrationsSection tone="surface" title={d.ids.title} text={d.ids.intro}>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{d.ids.publicIds}</h3>
            <FactList rows={i.publicIds.map((p) => ({ term: p.key, value: <>{publicIdLabel(text, p.key)}{p.optional ? <span className="text-ink-3"> ({c.optional})</span> : null}</> }))} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{d.ids.credentials}</h3>
            {i.credentials.length ? (
              <FactList
                rows={i.credentials.map((cred) => ({
                  term: cred.oauth ? `${c.credentialKinds[cred.kind]} · ${c.oauthProviders[cred.oauth] ?? cred.oauth}` : c.credentialKinds[cred.kind],
                  value: (
                    <>
                      <Code>{cred.kind}</Code> <span className="text-ink-3">— {d.ids.vault}{cred.optional ? `, ${c.optional}` : ""}</span>
                    </>
                  ),
                }))}
              />
            ) : (
              <p className="mt-3 text-small text-ink-2">{d.ids.noCredentials}</p>
            )}
          </div>
        </div>
      </IntegrationsSection>

      <IntegrationsSection title={d.consent.title}>
        <p className="max-w-text text-body text-ink-2">{isSource ? d.consent.source : d.consent.text[i.consentPurpose]}</p>
      </IntegrationsSection>

      <IntegrationsSection tone="surface" title={d.setup.title} text={d.setup.intro}>
        <Milestones steps={steps} />
      </IntegrationsSection>

      <IntegrationsSection title={d.knowledge.title} text={related.length ? d.knowledge.text : d.knowledge.none}>
        {related.length ? <RelatedKnowledge articles={related} /> : null}
        <p className={related.length ? "mt-6" : undefined}>
          <Link href={KNOWLEDGE_PATH} className="text-small font-medium text-primary underline-offset-4 hover:underline">
            {d.knowledge.all}
          </Link>
        </p>
      </IntegrationsSection>

      <IntegrationsSection tone="surface" title={d.faq.title}>
        <Faq items={faq} />
      </IntegrationsSection>

      <FinalCta title={d.cta.title(i.shortName)} text={d.cta.text} primary={{ label: d.cta.start, href: "/signup" }} secondary={{ label: d.cta.all, href: "/integrations" }} />
    </>
  );
}
