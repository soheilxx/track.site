import { Check, Minus } from "lucide-react";
import { cn } from "@track-site/ui";
import type { Comparison } from "@/lib/marketing-copy/features";

/*
 * Before/after comparison (docs/12 §4 "comparison"). Rendered as a real table so the aspect, the
 * "before" and the "after" cell stay associated for assistive technology; below 48 rem the rows
 * stack and every cell carries its column name. The after column is marked by an icon and text,
 * never by colour alone.
 */
export function BeforeAfter({ comparison, className }: { comparison: Comparison; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface", className)}>
      <table className="table-stack w-full border-collapse text-left text-sm">
        <caption className="sr-only">{comparison.title}</caption>
        <thead className="border-b border-line bg-surface-2 text-micro font-semibold tracking-wide text-ink-3 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 md:w-[22%] md:px-6">
              <span className="sr-only">{comparison.title}</span>
            </th>
            <th scope="col" className="px-4 py-3 md:px-6">
              <span className="inline-flex items-center gap-2">
                <Minus className="size-3.5" aria-hidden="true" />
                {comparison.beforeLabel}
              </span>
            </th>
            <th scope="col" className="px-4 py-3 text-primary md:px-6">
              <span className="inline-flex items-center gap-2">
                <Check className="size-3.5" aria-hidden="true" />
                {comparison.afterLabel}
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {comparison.rows.map((row) => (
            <tr key={row.aspect}>
              <th scope="row" data-label={comparison.title} className="px-4 py-4 align-top font-semibold text-ink md:px-6">
                {row.aspect}
              </th>
              <td data-label={comparison.beforeLabel} className="px-4 py-4 align-top text-ink-3 md:px-6">
                <span className="inline-flex items-start gap-2">
                  <Minus className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{row.before}</span>
                </span>
              </td>
              <td data-label={comparison.afterLabel} className="px-4 py-4 align-top text-ink md:px-6">
                <span className="inline-flex items-start gap-2">
                  <Check className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{row.after}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
