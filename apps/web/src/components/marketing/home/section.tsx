import type { ReactNode } from "react";
import { Container, cn } from "@track-site/ui";

/**
 * Section frame for the home page. Sections alternate `tone` (ground / surface) and layouts on
 * purpose (docs/12 §4: no card soup); the header block is optional so product stages can start
 * with their own composition.
 */
export function HomeSection({ id, eyebrow, title, text, tone = "ground", width = "page", align = "start", children, className, labelledBy }: { id?: string; eyebrow?: string; title?: string; text?: string; tone?: "ground" | "surface"; width?: "page" | "wide"; align?: "start" | "center"; children: ReactNode; className?: string; labelledBy?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : labelledBy} className={cn("border-t border-line", tone === "surface" && "bg-surface", className)}>
      <Container width={width} className="py-16 md:py-20 lg:py-24">
        {eyebrow || title || text ? (
          <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
            {eyebrow ? <p className="text-small font-semibold tracking-wide text-primary uppercase">{eyebrow}</p> : null}
            {title ? (
              <h2 id={headingId} className="mt-3 font-display text-h2 font-semibold text-ink">
                {title}
              </h2>
            ) : null}
            {text ? <p className="mt-4 text-lg text-ink-2">{text}</p> : null}
          </div>
        ) : null}
        <div className={cn((eyebrow || title || text) && "mt-10 md:mt-12")}>{children}</div>
      </Container>
    </section>
  );
}
