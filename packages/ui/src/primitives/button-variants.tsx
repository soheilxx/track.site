import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, isValidElement, type AnchorHTMLAttributes, type ReactElement } from "react";
import { cn } from "../cn.ts";

/**
 * Server-safe half of the button family: the class recipe, the anchor styled as a button and the
 * spinner. Kept apart from <Button> (a client component, it owns an event handler) so server
 * components can call `buttonVariants()` on next-intl's <Link> without pulling in a client boundary.
 *
 * Button classes (docs/12 §3). Shared by <Button> and <LinkButton>; also apply them to next-intl's
 * <Link className={buttonVariants(...)}> — never nest a button inside a link.
 * Touch targets: ≥ 44 px on coarse pointers for every size; compact heights on fine pointers.
 */
export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-px disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-busy:cursor-progress",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-sm hover:bg-primary-strong",
        secondary: "border border-line-2 bg-surface text-ink hover:bg-surface-2",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "bg-bad text-white hover:brightness-95",
        link: "h-auto min-h-0 rounded-none px-0 text-primary underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        sm: "min-h-9 px-3 text-sm pointer-coarse:min-h-11",
        md: "min-h-10 px-4 text-sm pointer-coarse:min-h-11",
        lg: "min-h-12 px-6 text-base",
        icon: "size-10 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof buttonVariants> {
  /**
   * Render the single child (for example next-intl's <Link>) instead of a plain <a>, merging the
   * button classes and the remaining props into it.
   */
  asChild?: boolean;
  /** Visual + aria disabled state for a link that is temporarily unavailable. */
  disabled?: boolean;
}

/** Anchor styled as a button. Use for navigation; use <Button> for actions. */
export function LinkButton({ asChild = false, className, variant, size, disabled = false, children, ...props }: LinkButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  const disabledProps = disabled ? { "aria-disabled": true as const, tabIndex: -1 } : {};
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<Record<string, unknown>>;
    return cloneElement(child, { ...props, ...disabledProps, className: cn(classes, child.props.className as string | undefined) });
  }
  return (
    <a className={classes} {...disabledProps} {...props}>
      {children}
    </a>
  );
}

/** Loading indicator. Marked essential so it keeps spinning under reduced motion (it carries state). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true" data-motion="essential">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
