import type { ReactNode } from "react";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Container, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { SecondaryLinkItem } from "@/lib/marketing-copy/secondary";
import type { TitledText } from "@/lib/marketing-copy";

/*
 * Page scaffolding of the secondary public pages (docs/12 §4: alternate patterns, no card soup).
 * Server components; links are next-intl <Link>s, never a button inside a link. Kept under
 * components/marketing/secondary so the concurrently edited page-shell and feature sections stay
 * untouched; consolidate with them once the marketing redesign lands.
 */

/** Page intro: eyebrow, h1, lead, optional meta line and a slot for quick links below. */
export function PageIntro({ eyebrow, title, text, meta, children, width = "page", pattern = true }: { eyebrow?: string; title: string; text: string; meta?: ReactNode; children?: ReactNode; width?: "page" | "text" | "wide"; pattern?: boolean }) {
  return (
    <section className="relative overflow-hidden">
      {pattern ? <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" /> : null}
      <Container width={width} className="relative pt-12 pb-12 md:pt-20 md:pb-16">
        {eyebrow ? <p className="text-micro font-semibold tracking-wide text-primary uppercase">{eyebrow}</p> : null}
        <h1 className={cn("max-w-4xl font-display text-h1 font-semibold text-ink", eyebrow && "mt-4")}>{title}</h1>
        <p className="mt-5 max-w-text text-lg text-ink-2">{text}</p>
        {meta ? <p className="mt-4 text-small text-ink-3">{meta}</p> : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </Container>
    </section>
  );
}

/** Full-width section with the page container; `tone="surface"` alternates the ground colour. */
export function PageSection({ id, labelledBy, tone = "ground", width = "page", className, children }: { id?: string; labelledBy?: string; tone?: "ground" | "surface"; width?: "page" | "text" | "wide"; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("border-t border-line", tone === "surface" ? "bg-surface" : "bg-ground", className)}>
      <Container width={width} className="py-12 md:py-20">
        {children}
      </Container>
    </section>
  );
}

/** Heading block of a section: optional eyebrow, h2 (or h3 with `level`), lead text. */
export function SectionHeading({ id, eyebrow, title, text, level = 2, className }: { id: string; eyebrow?: string; title: string; text?: string; level?: 2 | 3; className?: string }) {
  const Tag = level === 3 ? "h3" : "h2";
  return (
    <div className={cn("max-w-text", className)}>
      {eyebrow ? <p className="text-micro font-semibold tracking-wide text-primary uppercase">{eyebrow}</p> : null}
      <Tag id={id} className={cn("font-display font-semibold text-ink", level === 3 ? "text-h3" : "text-h2", eyebrow && "mt-3")}>
        {title}
      </Tag>
      {text ? <p className="mt-4 text-body text-ink-2 md:text-lg">{text}</p> : null}
    </div>
  );
}

/** Two-column page: narrative on one side (5/12), a panel or form on the other (7/12). */
export function SplitLayout({ aside, children, reverse = false, className }: { aside: ReactNode; children: ReactNode; reverse?: boolean; className?: string }) {
  return (
    <div className={cn("grid gap-12 lg:grid-cols-12 lg:gap-16", className)}>
      <div className={cn("min-w-0 lg:col-span-5", reverse && "lg:order-2")}>{aside}</div>
      <div className={cn("min-w-0 lg:col-span-7", reverse && "lg:order-1")}>{children}</div>
    </div>
  );
}

/** Text link with an arrow; ≥ 44 px tall on touch devices. */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control-sm)] text-small font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11", className)}>
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

/** Ruled list of internal links (title + one line), the non-card alternative to a link grid. */
export function LinkList({ items, className }: { items: SecondaryLinkItem[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="group flex items-center justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span className="min-w-0">
              <span className="block font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{item.title}</span>
              <span className="mt-0.5 block text-small text-ink-2">{item.text}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Definition list of topics (term + one line); used where a card grid would be card soup. */
export function TopicList({ items, className }: { items: TitledText[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => (
        <div key={item.title} className="grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="font-semibold text-ink">{item.title}</dt>
          <dd className="text-small text-ink-2">{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Checklist with an icon per item (icon + text, never colour alone). */
export function Checklist({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-small text-ink-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Raised panel around a form with its own heading (one panel per page, not a card grid). */
export function FormPanel({ id, title, children, footer, className }: { id: string; title: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-card sm:p-8", className)}>
      <h2 id={`${id}-title`} className="font-display text-h3 font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-5 border-t border-line pt-4 text-small text-ink-3">{footer}</div> : null}
    </section>
  );
}

/** Row of related-page chips at the end of a document. */
export function RelatedLinks({ title, items, className }: { title: string; items: Array<{ label: string; href: string }>; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={title} className={cn("border-t border-line pt-6", className)}>
      <h2 className="text-micro font-semibold tracking-wide text-ink-3 uppercase">{title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="inline-flex min-h-10 items-center rounded-[var(--radius-chip)] border border-line bg-surface px-4 text-small font-medium text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:border-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
