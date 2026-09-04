import { ArrowRight, CircleCheck } from "lucide-react";
import { useId } from "react";
import { buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { KnowledgeCtaItem } from "@/lib/marketing-copy/knowledge-article";

/*
 * Editorial blocks around the article body (supplement §6). Server components, all on the reading
 * measure of the text column. Sections are named by their heading; nothing here is a card grid.
 */

/** Same measure as `.prose-track` so the blocks align with the running text. */
const MEASURE = "max-w-[70ch]";

/** Key takeaways from the front matter; rendered only when the article has some. */
export function KeyTakeaways({ heading, items }: { heading: string; items: string[] }) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} data-article-takeaways="" className={cn(MEASURE, "rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 shadow-card")}>
      <h2 id={id} className="text-micro font-semibold tracking-wide text-ink-3 uppercase">
        {heading}
      </h2>
      <ul className="mt-3 space-y-2 text-small text-ink-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Linked primary sources from the front matter (documentation, standards); the host is shown next to each title. */
export function PrimarySources({ heading, text, sources }: { heading: string; text: string; sources: Array<{ title: string; url: string }> }) {
  const id = useId();
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby={id} data-article-sources="" className={cn(MEASURE, "mt-12 border-t border-line pt-6")}>
      <h2 id={id} className="font-display text-h3 font-semibold text-ink">
        {heading}
      </h2>
      <p className="mt-1 text-small text-ink-3">{text}</p>
      <ol className="mt-4 space-y-2 text-small">
        {sources.map((s) => (
          <li key={s.url} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <a href={s.url} rel="noopener noreferrer" className="inline-flex min-h-6 items-center text-primary underline underline-offset-[3px] hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {s.title}
            </a>
            <span className="text-ink-3 break-all">{hostOf(s.url)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Contextual, restrained product CTA chosen by topic (one secondary link, no banner). */
export function TrackCta({ eyebrow, item, href }: { eyebrow: string; item: KnowledgeCtaItem; href: string }) {
  const id = useId();
  return (
    <aside aria-labelledby={id} data-article-cta="" data-print="hide" className={cn(MEASURE, "mt-10 rounded-[var(--radius-panel)] border border-line bg-surface-2 p-6")}>
      <p className="text-micro font-semibold tracking-[0.08em] text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-h3 font-semibold text-ink">
        {item.title}
      </h2>
      <p className="mt-2 text-small text-ink-2">{item.text}</p>
      <Link href={href} className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-4")}>
        {item.label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </aside>
  );
}

/** The responsible editor: the existing editorial team record (name, role, bio) — never an invented person. */
export function ResponsibleEditor({ heading, name, role, bio }: { heading: string; name: string; role: string; bio: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-article-editor="" className={cn(MEASURE, "mt-10 border-t border-line pt-6")}>
      <h2 id={id} className="text-micro font-semibold tracking-wide text-ink-3 uppercase">
        {heading}
      </h2>
      <p className="mt-2 font-semibold text-ink">{name}</p>
      {role ? <p className="text-small text-ink-3">{role}</p> : null}
      {bio ? <p className="mt-2 text-small text-ink-2">{bio}</p> : null}
    </section>
  );
}
