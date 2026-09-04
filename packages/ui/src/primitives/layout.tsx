import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Card } from "./card.tsx";

/**
 * Page container. `width`: `page` (1200 px, default), `text` (720 px, reading), `wide` (1360 px,
 * product stages). Matches the .container-* utilities in tokens.css.
 */
export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: "page" | "text" | "wide";
}
export function Container({ className, width = "page", ...props }: ContainerProps) {
  return <div className={cn(width === "text" ? "container-text" : width === "wide" ? "container-wide" : "container-page", className)} {...props} />;
}

export interface ProductStageProps extends HTMLAttributes<HTMLElement> {
  /** `dark` re-scopes every token to the stage palette; `light` is a raised panel on the ground. */
  tone?: "dark" | "light";
  /** Subtle dot pattern behind the content. */
  dots?: boolean;
  /** Element to render (section by default; use `div` inside another section). */
  as?: "section" | "div" | "figure";
  /** Inner padding: `none` for full-bleed previews, `md` (default), `lg`. */
  padding?: "none" | "md" | "lg";
}

/** Wide product stage (docs/12 §4): the wrapper for demos, previews and diagrams. */
export function ProductStage({ tone = "dark", dots = false, as = "section", padding = "md", className, children, ...props }: ProductStageProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "relative isolate overflow-hidden rounded-[var(--radius-panel)] border",
        tone === "dark" ? "surface-stage border-stage-line shadow-stage" : "border-line bg-surface shadow-card",
        padding === "md" && "p-4 sm:p-6 lg:p-8",
        padding === "lg" && "p-6 sm:p-10 lg:p-14",
        className,
      )}
      {...props}
    >
      {dots ? <div aria-hidden="true" className={cn("grid-dots pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]", tone === "dark" ? "opacity-60" : "opacity-50")} /> : null}
      {children}
    </Tag>
  );
}

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-[var(--radius-chip)] px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-ink-2",
      primary: "bg-primary-soft text-primary",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      bad: "bg-bad-soft text-bad",
      info: "bg-info-soft text-info",
      violet: "bg-violet-soft text-violet",
      cyan: "bg-cyan-soft text-cyan-strong",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2", className)}>{children}</kbd>;
}

/** Screen-reader-only text. */
export function VisuallyHidden({ children, as: Tag = "span" }: { children: ReactNode; as?: "span" | "div" }) {
  return <Tag className="sr-only">{children}</Tag>;
}

export function StatCard({ label, value, hint, tone = "neutral", children, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad"; children?: ReactNode; className?: string }) {
  const tones = { neutral: "text-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad" };
  return (
    <Card className={cn("p-5", className)}>
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className={cn("mt-2 font-display text-3xl font-semibold tracking-tight break-words tabular-nums", tones[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-3">{hint}</p> : null}
      {children ? <div className="mt-3 w-full">{children}</div> : null}
    </Card>
  );
}
