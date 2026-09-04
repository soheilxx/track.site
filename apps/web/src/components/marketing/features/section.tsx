import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Container, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";

/*
 * Section scaffolding for the feature and how-it-works pages (docs/12 §4: alternate patterns, no
 * card soup). Server components; links are button-styled <Link>s, never a button inside a link.
 * Kept under components/marketing/features so the concurrently edited page-shell stays untouched;
 * consolidate with it once the marketing redesign lands.
 */

export function MarketingSection({ id, tone = "ground", width = "page", labelledBy, className, children }: { id?: string; tone?: "ground" | "surface"; width?: "page" | "text" | "wide"; labelledBy?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("border-t border-line", tone === "surface" ? "bg-surface" : "bg-ground", className)}>
      <Container width={width} className="py-16 md:py-24">
        {children}
      </Container>
    </section>
  );
}

/** Heading block of a section: optional eyebrow, h2, lead text; `align="center"` for stage intros. */
export function SectionHeading({ id, eyebrow, title, text, align = "start", className }: { id: string; eyebrow?: string; title: string; text?: string; align?: "start" | "center"; className?: string }) {
  return (
    <div className={cn("max-w-text", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <p className="text-micro font-semibold tracking-wide text-primary uppercase">{eyebrow}</p> : null}
      <h2 id={id} className={cn("font-display text-h2 font-semibold text-ink", eyebrow && "mt-3")}>
        {title}
      </h2>
      {text ? <p className="mt-4 text-body text-ink-2 md:text-lg">{text}</p> : null}
    </div>
  );
}

/** Page hero: eyebrow, h1, lead, primary + secondary CTA. Children render below (e.g. a product stage). */
export function FeatureHero({ eyebrow, title, text, primary, secondary, children, above }: { eyebrow: string; title: string; text: string; primary: { label: string; href: string }; secondary?: { label: string; href: string }; children?: ReactNode; above?: ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="grid-dots pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <Container width="wide" className="relative pt-12 pb-16 md:pt-20 md:pb-24">
        {above}
        <div className="max-w-page">
          <p className="text-micro font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl font-display text-h1 font-semibold text-ink">{title}</h1>
          <p className="mt-6 max-w-text text-lg text-ink-2">{text}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
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
        </div>
        {children ? <div className="mt-12 md:mt-16">{children}</div> : null}
      </Container>
    </section>
  );
}

/** Two-column narrative: text on one side, a diagram or product view on the other (`reverse` swaps). */
export function Narrative({ reverse = false, text, visual, className }: { reverse?: boolean; text: ReactNode; visual: ReactNode; className?: string }) {
  return (
    <div className={cn("grid items-center gap-8 lg:grid-cols-12 lg:gap-12", className)}>
      <div className={cn("min-w-0 lg:col-span-5", reverse && "lg:order-2")}>{text}</div>
      <div className={cn("min-w-0 lg:col-span-7", reverse && "lg:order-1")}>{visual}</div>
    </div>
  );
}

/** Closing call to action on a dark stage. */
export function ClosingCta({ title, text, primary, secondary }: { title: string; text: string; primary: { label: string; href: string }; secondary?: { label: string; href: string } }) {
  return (
    <section className="surface-stage border-t border-line">
      <Container className="py-16 md:py-24">
        <div className="max-w-text">
          <h2 className="font-display text-h2 font-semibold text-ink">{title}</h2>
          <p className="mt-4 text-lg text-ink-2">{text}</p>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
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
      </Container>
    </section>
  );
}
