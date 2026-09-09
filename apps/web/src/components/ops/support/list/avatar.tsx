import { cn } from "@track-site/ui";
import { initials } from "./format";

/**
 * Initials avatar of an operator. The name is announced through the visually hidden text unless the
 * avatar is `decorative` — next to a visible label (the assignee cell of the queue) the initials are
 * purely visual, so the name is neither read twice nor glued to the label's text.
 */
export function OperatorAvatar({ name, size = "md", className, title, decorative = false }: { name: string; size?: "sm" | "md"; className?: string; title?: string; decorative?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary", size === "sm" ? "size-6 text-[10px]" : "size-7 text-xs", className)} title={title} aria-hidden={decorative ? "true" : undefined}>
      <span aria-hidden="true">{initials(name)}</span>
      {decorative ? null : <span className="sr-only">{title ?? name}</span>}
    </span>
  );
}
