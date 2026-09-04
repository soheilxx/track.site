"use client";

import { type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { cn } from "../cn.ts";
import { buttonVariants, Spinner } from "./button-variants.tsx";

/**
 * Action button (docs/12 §3). A client component: it owns the click handler that blocks clicks while
 * loading, so server components can render it (children and icons serialize) without shipping an
 * event handler of their own. The class recipe and <LinkButton> live in button-variants.tsx so that
 * server components can style links with `buttonVariants()` — never nest a button inside a link.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner, sets aria-busy and blocks clicks while keeping focus on the button. */
  loading?: boolean;
  /** Visually hidden text announced while loading, e.g. "Saving…". */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({ className, variant, size, loading = false, loadingLabel, leadingIcon, trailingIcon, children, type = "button", disabled, onClick, ...props }: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled}
      aria-disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : leadingIcon}
      {children}
      {trailingIcon}
      {loading && loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
    </button>
  );
}

/** Square button whose only content is an icon; `label` is required and becomes the accessible name. */
export function IconButton({ label, children, size = "icon", variant = "ghost", ...props }: Omit<ButtonProps, "aria-label"> & { label: string }) {
  return (
    <Button aria-label={label} title={label} size={size} variant={variant} {...props}>
      {children}
    </Button>
  );
}
