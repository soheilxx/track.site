import { cn } from "@track-site/ui";
import { initials } from "./format";

/** Initials avatar of an operator (the name is announced through the visually hidden text). */
export function OperatorAvatar({ name, size = "md", className, title }: { name: string; size?: "sm" | "md"; className?: string; title?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary", size === "sm" ? "size-6 text-[10px]" : "size-7 text-xs", className)} title={title}>
      <span aria-hidden="true">{initials(name)}</span>
      <span className="sr-only">{title ?? name}</span>
    </span>
  );
}
