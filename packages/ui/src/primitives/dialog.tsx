"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn.ts";
import { IconButton } from "./button.tsx";

/**
 * Modal layer shared by <Dialog> and <Sheet>: portal into <body>, `inert` on every other body child,
 * focus trap, Escape to close, scroll lock, focus restored to the opener. No external library.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalLayerProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  panelClassName: string;
  overlayClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnOverlayClick?: boolean;
  children: ReactNode;
}

function ModalLayer({ open, onClose, labelledBy, describedBy, panelClassName, overlayClassName, initialFocusRef, closeOnOverlayClick = true, children }: ModalLayerProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // portal host, created on the client only
  useEffect(() => {
    if (!open) return;
    const node = document.createElement("div");
    node.setAttribute("data-modal-host", "");
    document.body.appendChild(node);
    setHost(node);
    return () => {
      node.remove();
      setHost(null);
    };
  }, [open]);

  // inert background, scroll lock, focus management
  useEffect(() => {
    if (!open || !host) return;
    const opener = document.activeElement as HTMLElement | null;
    const others = Array.from(document.body.children).filter((el) => el !== host && !el.hasAttribute("inert"));
    for (const el of others) el.setAttribute("inert", "");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const target = initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
    target?.focus({ preventScroll: true });

    return () => {
      for (const el of others) el.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, host, initialFocusRef]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || !host) return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex", overlayClassName)} onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" aria-hidden="true" onClick={closeOnOverlayClick ? onClose : undefined} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1} className={cn("relative outline-none", panelClassName)}>
        {children}
      </div>
    </div>,
    host,
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions row; put the primary action last. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Accessible name of the close button (localize it). */
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const dialogSizes = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" } as const;

/** Centered modal dialog. `open` is controlled; render it always and toggle `open`. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", closeLabel = "Close", initialFocusRef, className }: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = description ? `${id}-desc` : undefined;
  return (
    <ModalLayer open={open} onClose={onClose} labelledBy={titleId} describedBy={descId} initialFocusRef={initialFocusRef} overlayClassName="items-end justify-center p-0 sm:items-center sm:p-6" panelClassName={cn("flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-t-[var(--radius-panel)] border border-line bg-surface text-ink shadow-pop sm:max-h-[calc(100dvh-3rem)] sm:rounded-[var(--radius-panel)]", dialogSizes[size], className)}>
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-1 text-sm text-ink-3">
              {description}
            </p>
          ) : null}
        </div>
        <IconButton label={closeLabel} onClick={onClose} className="-mt-1 -mr-2 shrink-0">
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
      {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2 text-sm text-ink-2">{children}</div> : null}
      {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">{footer}</div> : null}
    </ModalLayer>
  );
}

export interface SheetProps extends Omit<DialogProps, "size"> {
  side?: "right" | "left" | "bottom";
}

const sheetSides = {
  right: { overlay: "justify-end", panel: "h-full w-full max-w-md border-l" },
  left: { overlay: "justify-start", panel: "h-full w-full max-w-md border-r" },
  bottom: { overlay: "items-end", panel: "max-h-[85dvh] w-full rounded-t-[var(--radius-panel)] border-t" },
} as const;

/** Edge-anchored panel (navigation drawer, mobile filters, assistant on small screens). */
export function Sheet({ open, onClose, title, description, children, footer, side = "right", closeLabel = "Close", initialFocusRef, className }: SheetProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = description ? `${id}-desc` : undefined;
  const s = sheetSides[side];
  return (
    <ModalLayer open={open} onClose={onClose} labelledBy={titleId} describedBy={descId} initialFocusRef={initialFocusRef} overlayClassName={s.overlay} panelClassName={cn("flex flex-col border-line bg-surface text-ink shadow-pop", s.panel, className)}>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-1 text-sm text-ink-3">
              {description}
            </p>
          ) : null}
        </div>
        <IconButton label={closeLabel} onClick={onClose} className="-mt-1 -mr-2 shrink-0">
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-ink-2">{children}</div>
      {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">{footer}</div> : null}
    </ModalLayer>
  );
}
