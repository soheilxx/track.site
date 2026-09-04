import type { ReactNode } from "react";
import { Container, cn } from "@track-site/ui";

/**
 * Section of the pricing page: landmark with its own heading (docs/12 §4 typography), a page or
 * wide container and a deliberate ground/surface alternation. Not a card.
 */
export function PricingSection({ id, eyebrow, title, text, tone = "default", width = "page", children, className }: { id: string; eyebrow?: string; title: string; text?: string; tone?: "default" | "muted"; width?: "page" | "wide"; children: ReactNode; className?: string }) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("border-t border-line", tone === "muted" ? "bg-surface" : "bg-ground", className)}>
      <Container width={width} className="py-16 md:py-20">
        <div className="max-w-text">
          {eyebrow ? <p className="text-micro font-semibold tracking-wide text-primary uppercase">{eyebrow}</p> : null}
          <h2 id={headingId} className={cn("font-display text-h2 font-semibold text-ink", eyebrow && "mt-3")}>
            {title}
          </h2>
          {text ? <p className="mt-4 text-body text-ink-2">{text}</p> : null}
        </div>
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}
