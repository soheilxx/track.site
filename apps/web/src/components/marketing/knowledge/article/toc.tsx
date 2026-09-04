import { ChevronDown } from "lucide-react";
import { cn } from "@track-site/ui";
import type { TocHeading } from "@/lib/knowledge-article";

/**
 * Table of contents of an article: a native `<details>` above the text on small screens, a rail
 * beside it from `lg` (the page makes the wrapper sticky). Plain anchor links to the rehype-slug
 * ids — no scroll-spy script, nothing to hydrate. Omitted for articles with fewer than two headings.
 */
export function ArticleToc({ headings, label, className }: { headings: TocHeading[]; label: string; className?: string }) {
  if (headings.length < 2) return null;
  const list = (
    <ul className="border-l border-line">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className={cn(
              "-ml-px flex min-h-10 items-center border-l-2 border-transparent py-1.5 pr-2 text-small text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:border-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
              h.depth === 3 ? "pl-8" : "pl-4",
            )}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <div data-article-toc="" data-print="hide" className={cn("min-w-0", className)}>
      <details className="group rounded-[var(--radius-control)] border border-line bg-surface lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-small font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {label}
          <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out group-open:rotate-180" aria-hidden="true" />
        </summary>
        <nav aria-label={label} className="px-4 pb-3">
          {list}
        </nav>
      </details>
      <nav aria-label={label} className="hidden lg:block">
        <p className="text-micro font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
        <div className="mt-3 max-h-[calc(100dvh-8rem)] overflow-y-auto">{list}</div>
      </nav>
    </div>
  );
}
