import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../cn.ts";
import { ScrollRegion } from "./scroll-region.tsx";

/**
 * Dense data table. On viewports below 48 rem each row stacks into a card and every cell shows its
 * column name from `data-label` (pass `label` on <Td>). Wrap wide tables in <Table> which scrolls
 * horizontally instead of the page; the wrapper is a keyboard-reachable region while it overflows
 * (named after `caption`).
 */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Stack rows on small screens (default true). */
  stack?: boolean;
  /** Accessible summary of the table; rendered as <caption> (visually hidden unless `showCaption`). */
  caption?: string;
  showCaption?: boolean;
  wrapperClassName?: string;
}

export function Table({ className, stack = true, caption, showCaption = false, wrapperClassName, children, ...props }: TableProps) {
  return (
    <ScrollRegion label={caption} className={wrapperClassName}>
      <table className={cn("w-full border-collapse text-sm text-ink tabular-nums", stack && "table-stack", className)} {...props}>
        {caption ? <caption className={cn("text-left text-sm text-ink-3", showCaption ? "mb-2" : "sr-only")}>{caption}</caption> : null}
        {children}
      </table>
    </ScrollRegion>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-line text-left text-xs font-medium tracking-wide text-ink-3 uppercase", className)} {...props} />;
}
export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}
export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors duration-[var(--motion-fast)] hover:bg-surface-2/60", className)} {...props} />;
}
export function Th({ className, scope = "col", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope={scope} className={cn("px-3 py-2 font-medium whitespace-nowrap", className)} {...props} />;
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Column name shown in the stacked mobile layout. */
  label?: string;
  numeric?: boolean;
}
export function Td({ className, label, numeric = false, ...props }: TdProps) {
  return <td data-label={label} className={cn("px-3 py-2 align-top", numeric && "text-right tabular-nums md:text-right", className)} {...props} />;
}
