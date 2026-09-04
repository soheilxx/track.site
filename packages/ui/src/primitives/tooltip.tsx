"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "../cn.ts";

export interface TooltipProps {
  /** Short, non-essential text. Anything required to operate the control belongs in a label. */
  content: ReactNode;
  /** A single focusable trigger (button, link). It receives aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  /** Delay before showing on hover (ms); focus shows immediately. */
  delay?: number;
}

const sideClasses: Record<NonNullable<TooltipProps["side"]>, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/** Tooltip shown on hover and keyboard focus, dismissed with Escape. Never the only place for information. */
export function Tooltip({ content, children, side = "top", className, delay = 150 }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => {
    if (timer) clearTimeout(timer);
  }, [timer]);

  const show = (immediate: boolean) => {
    if (timer) clearTimeout(timer);
    if (immediate) {
      setOpen(true);
      return;
    }
    setTimer(setTimeout(() => setOpen(true), delay));
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setOpen(false);
  };

  const trigger = isValidElement(children) ? cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" ") }) : children;

  return (
    <span className={cn("relative inline-flex", className)} onMouseEnter={() => show(false)} onMouseLeave={hide} onFocus={() => show(true)} onBlur={hide}>
      {trigger}
      <span
        role="tooltip"
        id={id}
        data-state={open ? "open" : "closed"}
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-64 rounded-[var(--radius-control-sm)] bg-ink px-2.5 py-1.5 text-xs font-medium text-ground shadow-pop transition-opacity duration-[var(--motion-fast)] ease-out",
          sideClasses[side],
          open ? "opacity-100" : "opacity-0",
        )}
        hidden={!open}
      >
        {content}
      </span>
    </span>
  );
}
