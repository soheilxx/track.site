import type { ReactNode } from "react";
import { cn } from "@track-site/ui";

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  /** semantic emphasis of the value; the label carries the meaning, the colour only underlines it */
  tone?: "bad" | "warn" | "neutral";
}

/** Dense definition list of measured totals (same shape as the Team summary); every value is a real count. */
export function StatList({ label, items, className }: { label: string; items: StatItem[]; className?: string }) {
  return (
    <dl aria-label={label} className={cn("grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.key} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{item.label}</dt>
          <dd className={cn("mt-1 font-medium tabular-nums", item.tone === "bad" ? "text-bad" : item.tone === "warn" ? "text-warn" : "text-ink")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
