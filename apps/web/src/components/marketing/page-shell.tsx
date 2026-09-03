import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Card, Container, buttonVariants } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

/**
 * Shared building blocks for marketing pages: hero, sections, feature cards, CTA. Links are
 * locale-neutral (next-intl's Link adds the prefix); CTAs are button-styled links, never a button
 * nested inside a link.
 */
export function PageHero({ eyebrow, title, text, cta, children }: { eyebrow?: string; title: string; text: string; cta?: { label: string; href: string }; children?: ReactNode }) {
  return (
    <section className="border-b border-line">
      <Container className="py-14 md:py-20">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p> : null}
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">{text}</p>
        {cta ? (
          <div className="mt-8">
            <Link href={cta.href} className={buttonVariants({ size: "lg" })}>
              {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
        {children}
      </Container>
    </section>
  );
}

export function Section({ title, text, children, id, tone = "default" }: { title?: string; text?: string; children?: ReactNode; id?: string; tone?: "default" | "muted" }) {
  return (
    <section id={id} className={tone === "muted" ? "border-t border-line bg-surface" : "border-t border-line"}>
      <Container className="py-14 md:py-16">
        {title ? <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h2> : null}
        {text ? <p className="mt-3 max-w-3xl text-lg text-ink-2">{text}</p> : null}
        {children ? <div className={title || text ? "mt-8" : ""}>{children}</div> : null}
      </Container>
    </section>
  );
}

export function FeatureGrid({ items, columns = 3 }: { items: Array<{ title: string; text: string; href?: string }>; columns?: 2 | 3 | 4 }) {
  const cols = columns === 2 ? "md:grid-cols-2" : columns === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";
  return (
    <ul className={`grid gap-4 ${cols}`}>
      {items.map((it) => (
        <li key={it.title}>
          <Card className="h-full p-5">
            <h3 className="text-base font-semibold text-ink">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{it.text}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: Array<{ title: string; text: string }> }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((s, i) => (
        <li key={s.title}>
          <Card className="h-full p-5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary">{i + 1}</span>
            <h3 className="mt-3 text-base font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{s.text}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {items.map((f) => (
        <div key={f.q} className="p-5">
          <dt className="font-semibold text-ink">{f.q}</dt>
          <dd className="mt-2 text-sm text-ink-2">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FinalCta({ title, text, primary, secondary }: { title: string; text: string; primary: { label: string; href: string }; secondary?: { label: string; href: string } }) {
  return (
    <section className="border-t border-line bg-ink text-white">
      <Container className="py-14 md:py-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 max-w-2xl text-white/80">{text}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
            {primary.label}
          </Link>
          {secondary ? (
            <Link href={secondary.href} className="inline-flex items-center gap-1 self-center text-sm font-medium text-white/90 hover:underline">
              {secondary.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose prose-neutral max-w-3xl text-ink-2 prose-headings:font-display prose-headings:text-ink prose-a:text-primary">{children}</div>;
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}
