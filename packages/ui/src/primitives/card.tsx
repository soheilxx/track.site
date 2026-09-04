import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../cn.ts";

/**
 * Card levels (docs/12 §3): `flat` (hairline only, for lists and tables), `raised` (hairline + soft
 * shadow, the default), `panel` (product panel: larger radius, surface-2 ground, for stages and
 * previews). Use cards sparingly — not every text block is a card.
 */
export const cardVariants = cva("min-w-0 bg-surface text-ink", {
  variants: {
    variant: {
      flat: "rounded-[var(--radius-card)] border border-line",
      raised: "rounded-[var(--radius-card)] border border-line shadow-card",
      panel: "rounded-[var(--radius-panel)] border border-line bg-surface-2 shadow-card",
    },
    interactive: {
      true: "transition-[box-shadow,border-color,transform] duration-[var(--motion-fast)] ease-out hover:border-line-2 hover:shadow-pop focus-within:border-primary",
    },
  },
  defaultVariants: { variant: "raised" },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, interactive }), className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-line px-5 py-4", className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-ink", className)} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-3", className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 border-t border-line px-5 py-4", className)} {...props} />;
}
