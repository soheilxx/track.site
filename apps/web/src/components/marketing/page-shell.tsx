import type { ReactNode } from "react";
import { ArrowRight, ChevronDown, CircleCheck } from "lucide-react";
import { Container, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { FaqItem, SecondaryLinkItem, TitledText } from "@/lib/marketing-copy/types";

/**
 * Page scaffolding shared by every marketing page (docs/12 §1 containers, §4 page patterns:
 * alternate layouts, no card soup). Server components; links are next-intl <Link>s styled with
 * `buttonVariants`, never a button nested in a link; every target is ≥ 44 px on touch devices.
 *
 *   <PageIntro eyebrow title text meta primary secondary above>   page top: h1 + lead (+ CTAs, stage)
 *   <PageSection id labelledBy tone width spacing>                 one landmark section in a container
 *   <SectionHeading id eyebrow title text as align>                heading block of a section
 *   <Narrative text visual reverse />                              two-column narrative (text + figure)
 *   <SplitLayout aside>{panel}</SplitLayout>                       narrative (5/12) + panel or form (7/12)
 *   <ArrowLink /> <LinkList /> <TopicList /> <Checklist />         ruled lists instead of link grids
 *   <FormPanel /> <RelatedLinks />                                 one raised panel, related-page chips
 *   <Faq items /> + faqJsonLd(items)                               native disclosure list + JSON-LD
 *   <FinalCta … />                                                 closing band on the dark product stage
 *
 * Widths follow the token containers: `page` 1200 px (default), `text` 720 px, `wide` 1360 px.
 * Tones alternate `ground` and `surface`; `spacing="lg"` is the roomier rhythm of the feature pages.
 */
export type SectionWidth = "page" | "text" | "wide";
export type SectionTone = "ground" | "surface";
export type SectionSpacing = "md" | "lg";
type Align = "start" | "center";

export interface CtaLink {
  label: string;
  href: string;
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const toneClass: Record<SectionTone, string> = { ground: "bg-ground", surface: "bg-surface" };
const sectionPadding: Record<SectionSpacing, string> = { md: "py-12 md:py-20", lg: "py-16 md:py-24" };
const introPadding: Record<SectionSpacing, string> = { md: "pt-12 pb-12 md:pt-20 md:pb-16", lg: "pt-12 pb-16 md:pt-20 md:pb-24" };

/** Small uppercase label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-micro font-semibold tracking-wide text-primary uppercase", className)}>{children}</p>;
}

/** Primary (with arrow) and optional secondary call to action, both button-styled links. */
function CtaRow({ primary, secondary, className }: { primary: CtaLink; secondary?: CtaLink; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Link href={primary.href} className={buttonVariants({ size: "lg" })}>
        {primary.label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
      {secondary ? (
        <Link href={secondary.href} className={buttonVariants({ size: "lg", variant: "secondary" })}>
          {secondary.label}
        </Link>
      ) : null}
    </div>
  );
}

export interface PageIntroProps {
  eyebrow?: string;
  title: string;
  text: string;
  /** Meta line under the lead (last updated, checked at …). */
  meta?: ReactNode;
  primary?: CtaLink;
  secondary?: CtaLink;
  /** Content above the eyebrow (breadcrumbs). */
  above?: ReactNode;
  /** Content below the lead and CTAs (quick links, a product stage). */
  children?: ReactNode;
  width?: SectionWidth;
  spacing?: SectionSpacing;
  /** Subtle dot grid behind the intro. */
  pattern?: boolean;
  className?: string;
}

/** Page intro: eyebrow, h1, lead, optional meta line, CTAs and a slot below (the hero of every page). */
export function PageIntro({ eyebrow, title, text, meta, primary, secondary, above, children, width = "page", spacing = "md", pattern = true, className }: PageIntroProps) {
  return (
    <section className={cn("relative overflow-hidden", className)}>
      {pattern ? <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" /> : null}
      <Container width={width} className={cn("relative", introPadding[spacing])}>
        {above}
        <div className="max-w-page">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className={cn("max-w-4xl font-display text-h1 font-semibold text-ink", eyebrow && "mt-4")}>{title}</h1>
          <p className="mt-5 max-w-text text-lg text-ink-2">{text}</p>
          {meta ? <p className="mt-4 text-small text-ink-3">{meta}</p> : null}
          {primary ? <CtaRow primary={primary} secondary={secondary} className="mt-8" /> : null}
        </div>
        {children ? <div className={spacing === "lg" ? "mt-12 md:mt-16" : "mt-8"}>{children}</div> : null}
      </Container>
    </section>
  );
}

export interface PageSectionProps {
  id?: string;
  /** id of the heading that names the landmark. */
  labelledBy?: string;
  tone?: SectionTone;
  width?: SectionWidth;
  spacing?: SectionSpacing;
  className?: string;
  children: ReactNode;
}

/** Full-width section with the page container; `tone="surface"` alternates the ground colour. */
export function PageSection({ id, labelledBy, tone = "ground", width = "page", spacing = "md", className, children }: PageSectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("border-t border-line", toneClass[tone], className)}>
      <Container width={width} className={sectionPadding[spacing]}>
        {children}
      </Container>
    </section>
  );
}

export interface SectionHeadingProps {
  /** id of the heading (the section's `labelledBy`). */
  id?: string;
  eyebrow?: string;
  title?: string;
  text?: string;
  /** Heading level; `h2` for page sections, `h3` inside a section. */
  as?: "h2" | "h3";
  align?: Align;
  className?: string;
}

/** Heading block of a section: optional eyebrow, h2 (or h3), lead text; `align="center"` for stage intros. */
export function SectionHeading({ id, eyebrow, title, text, as: Heading = "h2", align = "start", className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-text", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {title ? (
        <Heading id={id} className={cn("font-display font-semibold text-ink", Heading === "h2" ? "text-h2" : "text-h3", eyebrow && "mt-3")}>
          {title}
        </Heading>
      ) : null}
      {text ? <p className="mt-4 text-body text-ink-2 md:text-lg">{text}</p> : null}
    </div>
  );
}

/** 5/12 + 7/12 grid, stacked below `lg`; `reverse` swaps the columns on large screens. */
function TwoColumns({ first, second, reverse = false, align = "start", gap, className }: { first: ReactNode; second: ReactNode; reverse?: boolean; align?: "start" | "center"; gap: string; className?: string }) {
  return (
    <div className={cn("grid lg:grid-cols-12", align === "center" && "items-center", gap, className)}>
      <div className={cn("min-w-0 lg:col-span-5", reverse && "lg:order-2")}>{first}</div>
      <div className={cn("min-w-0 lg:col-span-7", reverse && "lg:order-1")}>{second}</div>
    </div>
  );
}

/** Two-column narrative: text on one side, a diagram or product view on the other (`reverse` swaps). */
export function Narrative({ reverse = false, text, visual, className }: { reverse?: boolean; text: ReactNode; visual: ReactNode; className?: string }) {
  return <TwoColumns first={text} second={visual} reverse={reverse} align="center" gap="gap-8 lg:gap-12" className={className} />;
}

/** Two-column page: narrative on one side (5/12), a panel or form on the other (7/12). */
export function SplitLayout({ aside, children, reverse = false, className }: { aside: ReactNode; children: ReactNode; reverse?: boolean; className?: string }) {
  return <TwoColumns first={aside} second={children} reverse={reverse} gap="gap-12 lg:gap-16" className={className} />;
}

/** Text link with an arrow; ≥ 44 px tall on touch devices. */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control-sm)] text-small font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11", focusRing, className)}>
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
          <Link href={item.href} className={cn("group flex items-center justify-between gap-4 py-4", focusRing)}>
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
            <Link href={item.href} className={cn("inline-flex min-h-10 items-center rounded-[var(--radius-chip)] border border-line bg-surface px-4 text-small font-medium text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:border-line-2 hover:text-ink pointer-coarse:min-h-11", focusRing)}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Native disclosure list: keyboard operable, answers stay in the HTML for search engines. */
export function Faq({ items }: { items: FaqItem[] }) {
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

/** schema.org FAQPage mirroring the visible questions only. */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

/** Closing call to action on the dark product stage: primary CTA with arrow, optional secondary link. */
export function FinalCta({ title, text, primary, secondary }: { title: string; text: string; primary: CtaLink; secondary?: CtaLink }) {
  return (
    <section className="surface-stage border-t border-line">
      <Container className="py-16 md:py-24">
        <div className="max-w-text">
          <h2 className="font-display text-h2 font-semibold text-ink">{title}</h2>
          <p className="mt-4 text-lg text-ink-2">{text}</p>
        </div>
        <CtaRow primary={primary} secondary={secondary} className="mt-8" />
      </Container>
    </section>
  );
}
