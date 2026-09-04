import { ChevronRight } from "lucide-react";
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

/** Link renderer so navigation primitives can use next-intl's <Link> without depending on it. */
export type LinkRenderer = ComponentType<{ href: string; className?: string; children?: ReactNode; "aria-current"?: "page" | undefined; "aria-label"?: string }>;

export function DefaultLink({ href, ...rest }: { href: string; className?: string; children?: ReactNode; "aria-current"?: "page" | undefined; "aria-label"?: string }) {
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
