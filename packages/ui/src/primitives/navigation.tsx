import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

/** Link renderer so navigation primitives can use next-intl's <Link> without depending on it. */
export type LinkRenderer = ComponentType<{ href: string; className?: string; children?: ReactNode; "aria-current"?: "page" | undefined; "aria-label"?: string }>;

function DefaultLink({ href, ...rest }: { href: string; className?: string; children?: ReactNode; "aria-current"?: "page" | undefined; "aria-label"?: string }) {
  return <a href={href} {...rest} />;
}

export interface BreadcrumbItem {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  /** Accessible name of the landmark (localize: "Breadcrumb" / "Navigationspfad"). */
  label?: string;
  linkComponent?: LinkRenderer;
}

/** `<nav aria-label>` + `<ol>`; the last item carries aria-current="page". */
export function Breadcrumbs({ items, label = "Breadcrumb", linkComponent, className, ...props }: BreadcrumbsProps) {
  const LinkC = linkComponent ?? DefaultLink;
  return (
    <nav aria-label={label} className={cn("text-sm text-ink-3", className)} {...props}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-line-2" aria-hidden="true" /> : null}
              {item.href && !last ? (
                <LinkC href={item.href} className="rounded-sm py-1 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {item.label}
                </LinkC>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("py-1", last && "font-medium text-ink")}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  page: number;
  pageCount: number;
  /** Builds the href for a page (server-rendered lists). */
  hrefFor?: (page: number) => string;
  /** Callback for client-side lists; used when `hrefFor` is absent. */
  onPageChange?: (page: number) => void;
  linkComponent?: LinkRenderer;
  /** Localized labels. */
  labels?: { nav?: string; previous?: string; next?: string; page?: (n: number) => string };
  /** Number of page buttons around the current page. */
  siblings?: number;
}

function range(page: number, pageCount: number, siblings: number): Array<number | "gap"> {
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - siblings; p <= page + siblings; p += 1) if (p >= 1 && p <= pageCount) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

const pageButton = "inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-control-sm)] px-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 pointer-coarse:min-w-11";

/** Pagination as a `<nav>`; page links or buttons, current page with aria-current. */
export function Pagination({ page, pageCount, hrefFor, onPageChange, linkComponent, labels, siblings = 1, className, ...props }: PaginationProps) {
  if (pageCount <= 1) return null;
  const LinkC = linkComponent ?? DefaultLink;
  const l = { nav: labels?.nav ?? "Pagination", previous: labels?.previous ?? "Previous page", next: labels?.next ?? "Next page", page: labels?.page ?? ((n: number) => `Page ${n}`) };
  const items = range(page, pageCount, siblings);

  const render = (target: number, content: ReactNode, ariaLabel: string, current = false, disabled = false) => {
    const cls = cn(pageButton, current ? "bg-primary text-on-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink", disabled && "pointer-events-none opacity-40");
    if (hrefFor && !disabled) {
      return (
        <LinkC href={hrefFor(target)} className={cls} aria-current={current ? "page" : undefined} aria-label={ariaLabel}>
          {content}
        </LinkC>
      );
    }
    return (
      <button type="button" className={cls} aria-current={current ? "page" : undefined} aria-label={ariaLabel} disabled={disabled} onClick={() => onPageChange?.(target)}>
        {content}
      </button>
    );
  };

  return (
    <nav aria-label={l.nav} className={cn("flex items-center justify-center", className)} {...props}>
      <ul className="flex items-center gap-1">
        <li>{render(page - 1, <ChevronLeft className="size-4" aria-hidden="true" />, l.previous, false, page <= 1)}</li>
        {items.map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-3">
              …
            </li>
          ) : (
            <li key={item}>{render(item, item, l.page(item), item === page)}</li>
          ),
        )}
        <li>{render(page + 1, <ChevronRight className="size-4" aria-hidden="true" />, l.next, false, page >= pageCount)}</li>
      </ul>
    </nav>
  );
}
