import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Breadcrumbs, Container, cn, type BreadcrumbItem, type LinkRenderer } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

/**
 * Layout primitives of the integrations pages (server components). Sections alternate ground /
 * surface tones; facts are definition lists and hairline rows, not cards (docs/12 §4).
 */
export function IntegrationsSection({ id, title, text, tone = "ground", children, className }: { id?: string; title?: string; text?: string; tone?: "ground" | "surface"; children?: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("border-t border-line", tone === "surface" && "bg-surface", className)}>
      <Container className="py-12 md:py-16">
        {title ? <h2 className="font-display text-h2 text-ink">{title}</h2> : null}
        {text ? <p className="mt-3 max-w-text text-body text-ink-2">{text}</p> : null}
        {children ? <div className={title || text ? "mt-8" : undefined}>{children}</div> : null}
      </Container>
    </section>
  );
}

const BreadcrumbLink: LinkRenderer = ({ href, ...rest }) => <Link href={href} {...rest} />;

export function IntegrationBreadcrumbs({ items, label }: { items: BreadcrumbItem[]; label: string }) {
  return <Breadcrumbs items={items} label={label} linkComponent={BreadcrumbLink} />;
}

/** Term/value rows with hairlines; stacks on small screens. */
export function FactList({ rows }: { rows: Array<{ term: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <div key={r.term} className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-small font-medium text-ink-3">{r.term}</dt>
          <dd className="min-w-0 text-body text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-[var(--radius-control-sm)] bg-surface-2 px-1.5 py-0.5 font-mono text-small text-ink">{children}</code>;
}

/** Bullet list with an icon per item: `sent` (check) or `never` (cross). Icon + text, never colour alone. */
export function CheckList({ items, kind, className }: { items: ReactNode[]; kind: "sent" | "never"; className?: string }) {
  const Icon = kind === "sent" ? Check : X;
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-small text-ink-2">
          <span className={cn("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full", kind === "sent" ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-3")}>
            <Icon className="size-3.5" aria-hidden="true" strokeWidth={2.5} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Three to four customer-facing milestones as a numbered timeline. */
export function Milestones({ steps }: { steps: Array<{ title: string; text: string }> }) {
  return (
    <ol className={cn("grid gap-8 md:grid-cols-2", steps.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {steps.map((s, i) => (
        <li key={s.title} className="min-w-0">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-small font-bold text-on-primary tabular-nums">{i + 1}</span>
            {i < steps.length - 1 ? <span aria-hidden="true" className="hidden h-px flex-1 bg-line-2 md:block" /> : null}
          </div>
          <h3 className="mt-4 font-display text-h3 text-ink">{s.title}</h3>
          <p className="mt-2 text-small text-ink-2">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export interface RelatedArticle {
  href: string;
  title: string;
  description: string;
  typeLabel: string;
  readingLabel: string;
}

/** Related Tracking Knowledge articles as hairline rows with a stretched link. */
export function RelatedKnowledge({ articles }: { articles: RelatedArticle[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {articles.map((a) => (
        <li key={a.href} className="relative grid gap-1 rounded-[var(--radius-control)] px-2 py-4 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2/60 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-6 sm:px-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">
              <Link href={a.href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                {a.title}
              </Link>
            </h3>
            <p className="mt-1 text-small text-ink-2">{a.description}</p>
          </div>
          <p className="text-micro text-ink-3 sm:text-right">
            {a.typeLabel} · {a.readingLabel}
          </p>
        </li>
      ))}
    </ul>
  );
}
