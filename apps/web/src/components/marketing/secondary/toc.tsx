import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

export interface TocItem {
  id: string;
  label: string;
}

/**
 * In-page table of contents for long documents: a sticky rail beside the text on desktop and a
 * native <details> above it on small screens. Plain anchor links (no scroll-spy script), so the
 * component stays a server component and costs nothing to hydrate.
 */
export function PageToc({ label, items, footer, className }: { label: string; items: TocItem[]; footer?: ReactNode; className?: string }) {
  const list = (
    <ul className="border-l border-line">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="-ml-px flex min-h-10 items-center border-l-2 border-transparent py-1.5 pr-2 pl-4 text-small text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:border-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11"
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("min-w-0 lg:sticky lg:top-24 lg:self-start", className)}>
      <details className="group rounded-[var(--radius-control)] border border-line bg-surface lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-small font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {label}
          <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out group-open:rotate-180" aria-hidden="true" />
        </summary>
        <nav aria-label={label} className="px-4 pb-3">
          {list}
          {footer ? <div className="mt-3">{footer}</div> : null}
        </nav>
      </details>
      <nav aria-label={label} className="hidden lg:block">
        <p className="text-micro font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
        <div className="mt-3">{list}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </nav>
    </div>
  );
}
