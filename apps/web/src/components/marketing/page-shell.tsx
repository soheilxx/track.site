import type { ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

/**
 * Section and container helpers for marketing pages (docs/12 §1 containers, §4 page patterns).
 * Server components; links are locale-neutral (next-intl's Link adds the prefix); CTAs are links
 * styled with `buttonVariants`, never a button nested in a link.
 *
 * Widths follow the token containers: `page` 1200 px (default), `text` 720 px (reading), `wide`
 * 1360 px (product stages). Tones: `default` (ground), `muted` (surface), `stage` (dark product
 * band via `.surface-stage`, which re-scopes every token so children built from tokens render dark).
 *
 *   <PageHero eyebrow title text cta secondary />        page top: h1 + lead + CTAs
 *   <Section eyebrow title text tone width spacing>       one section, optional heading block
 *   <SectionHeading />                                    heading block for hand-built sections
 *   <SplitSection … figure={<Diagram/>} reverse />        two-column narrative (text + figure)
 *   <FeatureGrid items columns />                         hairline grid of short items (no card soup)
 *   <Steps items />                                       numbered flow
 *   <Faq items /> + faqJsonLd(items)                      native disclosure list + JSON-LD
 *   <FinalCta … />                                        dark closing band
 *   <Prose>                                               `.prose-track` reading block
 */
export type SectionWidth = "page" | "text" | "wide";
export type SectionTone = "default" | "muted" | "stage";
type Align = "start" | "center";

const widthClass: Record<SectionWidth, string> = { page: "container-page", text: "container-text", wide: "container-wide" };
const toneClass: Record<SectionTone, string> = { default: "border-t border-line", muted: "border-t border-line bg-surface", stage: "surface-stage" };
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Small uppercase label above a heading; cobalt on light, stage-primary inside a stage. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-micro font-semibold tracking-[0.08em] text-primary uppercase", className)}>{children}</p>;
}

export interface PageHeroProps {
  eyebrow?: string;
  title: string;
  text: string;
  cta?: { label: string; href: string };
  secondary?: { label: string; href: string };
  width?: SectionWidth;
  align?: Align;
  className?: string;
  /** Extra content below the CTAs (domain form, product stage, breadcrumbs …). */
  children?: ReactNode;
}

export function PageHero({ eyebrow, title, text, cta, secondary, width = "page", align = "start", className, children }: PageHeroProps) {
  const centered = align === "center";
  return (
    <section className={cn("border-b border-line", className)}>
      <div className={cn(widthClass[width], "py-12 md:py-16 lg:py-20", centered && "text-center")}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className={cn("max-w-[22ch] font-display text-h1 font-bold text-ink", eyebrow && "mt-3", centered && "mx-auto")}>{title}</h1>
        <p className={cn("mt-5 max-w-text text-lg text-ink-2", centered && "mx-auto")}>{text}</p>
        {cta || secondary ? (
          <div className={cn("mt-8 flex flex-wrap gap-3", centered && "justify-center")}>
            {cta ? (
              <Link href={cta.href} className={buttonVariants({ size: "lg" })}>
                {cta.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
            {secondary ? (
              <Link href={secondary.href} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                {secondary.label}
              </Link>
            ) : null}
          </div>
        ) : null}
        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </section>
  );
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title?: string;
  text?: string;
  /** Heading level; `h2` for page sections, `h3` inside a section. */
  as?: "h2" | "h3";
  align?: Align;
  className?: string;
}

export function SectionHeading({ eyebrow, title, text, as: Heading = "h2", align = "start", className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-text", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {title ? <Heading className={cn("font-display font-semibold text-ink", Heading === "h2" ? "text-h2" : "text-h3", eyebrow && "mt-3")}>{title}</Heading> : null}
      {text ? <p className="mt-4 text-lg text-ink-2">{text}</p> : null}
    </div>
  );
}

export interface SectionProps {
  id?: string;
  eyebrow?: string;
  title?: string;
  text?: string;
  children?: ReactNode;
  tone?: SectionTone;
  width?: SectionWidth;
  spacing?: "md" | "lg";
  align?: Align;
  headingLevel?: "h2" | "h3";
  className?: string;
}

export function Section({ id, eyebrow, title, text, children, tone = "default", width = "page", spacing = "md", align = "start", headingLevel = "h2", className }: SectionProps) {
  const hasHeading = Boolean(eyebrow || title || text);
  return (
    <section id={id} className={cn(toneClass[tone], className)}>
      <div className={cn(widthClass[width], spacing === "lg" ? "py-16 md:py-24" : "py-12 md:py-16")}>
        {hasHeading ? <SectionHeading eyebrow={eyebrow} title={title} text={text} as={headingLevel} align={align} /> : null}
        {children ? <div className={cn(hasHeading && "mt-8 md:mt-10")}>{children}</div> : null}
      </div>
    </section>
  );
}

export interface SplitSectionProps {
  id?: string;
  eyebrow?: string;
  title: string;
  text?: string;
  /** Diagram, product stage or preview shown next to the text. */
  figure: ReactNode;
  /** Figure first on large screens. */
  reverse?: boolean;
  tone?: SectionTone;
  width?: SectionWidth;
  className?: string;
  /** Extra content under the text (bullets, CTA link). */
  children?: ReactNode;
}

/** Two-column narrative: text + figure, stacked below `lg`. */
export function SplitSection({ id, eyebrow, title, text, figure, reverse = false, tone = "default", width = "page", className, children }: SplitSectionProps) {
  return (
    <section id={id} className={cn(toneClass[tone], className)}>
      <div className={cn(widthClass[width], "grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2 lg:gap-16")}>
        <div className={cn("min-w-0", reverse && "lg:order-2")}>
          <SectionHeading eyebrow={eyebrow} title={title} text={text} />
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
        <div className={cn("min-w-0", reverse && "lg:order-1")}>{figure}</div>
      </div>
    </section>
  );
}

/** Short items in one hairline grid (one border, no stacked card boxes). */
export function FeatureGrid({ items, columns = 3 }: { items: Array<{ title: string; text: string; href?: string }>; columns?: 2 | 3 | 4 }) {
  const cols = columns === 2 ? "md:grid-cols-2" : columns === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";
  return (
    <ul className={cn("grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line", cols)}>
      {items.map((item) => (
        <li key={item.title} className="bg-surface p-6">
          <h3 className="text-base font-semibold text-ink">
            {item.href ? (
              <Link href={item.href} className={cn("inline-flex min-h-6 items-center rounded-sm underline-offset-4 transition-colors duration-[var(--motion-fast)] ease-out hover:text-primary hover:underline", focusRing)}>
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </h3>
          <p className="mt-2 text-small text-ink-2">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Numbered flow: markers joined by a hairline on large screens, stacked below. */
export function Steps({ items }: { items: Array<{ title: string; text: string }> }) {
  return (
    <ol className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
      {items.map((step, index) => (
        <li key={step.title}>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-sm font-bold text-primary tabular-nums">
              {index + 1}
            </span>
            {index < items.length - 1 ? <span aria-hidden="true" className="hidden h-px flex-1 bg-line-2 lg:block" /> : null}
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
          <p className="mt-2 text-small text-ink-2">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Native disclosure list: keyboard operable, answers stay in the HTML for search engines. */
export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group py-2">
          <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-[var(--radius-control-sm)] py-2 font-medium text-ink [&::-webkit-details-marker]:hidden", focusRing)}>
            <span>{item.q}</span>
            <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="max-w-text pb-4 text-small text-ink-2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Closing band on the dark product stage with the primary CTA and an optional secondary link. */
export function FinalCta({ title, text, primary, secondary }: { title: string; text: string; primary: { label: string; href: string }; secondary?: { label: string; href: string } }) {
  return (
    <section className="surface-stage border-t border-line">
      <div className="container-page py-16 md:py-20">
        <div className="max-w-text">
          <h2 className="font-display text-h2 font-semibold text-ink">{title}</h2>
          <p className="mt-4 text-lg text-ink-2">{text}</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
            {primary.label}
          </Link>
          {secondary ? (
            <Link href={secondary.href} className={buttonVariants({ variant: "secondary", size: "lg" })}>
              {secondary.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Reading block on the token measure (65–75 ch). */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("prose-track", className)}>{children}</div>;
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}
