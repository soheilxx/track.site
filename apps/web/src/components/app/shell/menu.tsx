"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@track-site/ui";

/**
 * Accessible dropdown menu for the shell (workspace switcher, environment indicator, account menu):
 * a trigger button with `aria-haspopup="menu"`, a popover with `role="menu"`, roving focus with the
 * arrow keys, Home/End, Escape (closes and restores focus), outside click and Tab close it. Items
 * with `checked` are `menuitemradio`s (the current organization, site or environment). Touch
 * targets are ≥ 44 px on coarse pointers; the checked state is shown with an icon and a
 * highlight, never with colour alone.
 */
export interface MenuItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Navigates (rendered as a link); otherwise `onSelect` runs. */
  href?: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
}

export interface MenuSection {
  id: string;
  label?: ReactNode;
  items: MenuItem[];
}

export interface MenuProps {
  /** Accessible name of the menu (and of the trigger when `triggerLabel` is not given). */
  label: string;
  /** Visible trigger content. */
  children: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  /** Non-interactive header inside the popover (e.g. the signed-in user). */
  header?: ReactNode;
  sections: MenuSection[];
  align?: "start" | "end";
  panelClassName?: string;
  disabled?: boolean;
  /** Extra attributes for the trigger. */
  triggerProps?: Record<string, unknown>;
  /** Set by <Tooltip> when the menu is its trigger; forwarded to the trigger button. */
  "aria-describedby"?: string;
}

const ITEM = "flex w-full min-h-10 items-center gap-2.5 rounded-[var(--radius-control-sm)] px-2.5 py-2 text-left text-sm text-ink-2 outline-none transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary pointer-coarse:min-h-11 data-[checked=true]:bg-primary-soft data-[checked=true]:text-primary aria-disabled:pointer-events-none aria-disabled:opacity-50";

export function Menu({ label, children, triggerLabel, triggerClassName, header, sections, align = "start", panelClassName, disabled = false, triggerProps, "aria-describedby": describedBy }: MenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = useCallback(() => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []), []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openAndFocus = useCallback(
    (position: "first" | "last") => {
      setOpen(true);
      requestAnimationFrame(() => {
        const list = items();
        (position === "first" ? list[0] : list[list.length - 1])?.focus();
      });
    },
    [items],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAndFocus("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus("last");
    }
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        list[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        list[list.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={triggerLabel}
        aria-describedby={describedBy}
        disabled={disabled}
        className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-sm font-medium text-ink outline-none transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 pointer-coarse:min-h-11", triggerClassName)}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        {...triggerProps}
      >
        {children}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          className={cn("absolute top-full z-40 mt-1 w-max min-w-64 max-w-[min(24rem,calc(100vw-1rem))] rounded-[var(--radius-control)] border border-line bg-surface p-1 text-ink shadow-pop", align === "end" ? "right-0" : "left-0", panelClassName)}
        >
          {header ? <div className="border-b border-line px-2.5 py-2">{header}</div> : null}
          {sections.map((section, sectionIndex) => {
            const radio = section.items.some((item) => item.checked !== undefined);
            return (
              <div key={section.id} role="group" aria-label={typeof section.label === "string" ? section.label : undefined} className={cn(sectionIndex > 0 && "mt-1 border-t border-line pt-1")}>
                {section.label ? (
                  <p aria-hidden="true" className="px-2.5 pb-1 pt-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                    {section.label}
                  </p>
                ) : null}
                {section.items.map((item) => {
                  const content = (
                    <>
                      {item.icon ? <span className="shrink-0 text-ink-3">{item.icon}</span> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        {item.description ? <span className="block truncate text-xs text-ink-3">{item.description}</span> : null}
                      </span>
                      {item.checked ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                    </>
                  );
                  const role = radio ? "menuitemradio" : "menuitem";
                  const common = {
                    role,
                    tabIndex: -1,
                    "aria-checked": radio ? Boolean(item.checked) : undefined,
                    "aria-disabled": item.disabled || undefined,
                    "data-checked": item.checked ? "true" : undefined,
                    className: cn(ITEM, item.tone === "danger" && "text-bad hover:text-bad"),
                  } as const;
                  if (item.href) {
                    return (
                      <Link key={item.id} href={item.href} {...common} onClick={() => close(false)}>
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={item.id}
                      type="button"
                      {...common}
                      disabled={item.disabled}
                      onClick={() => {
                        close(true);
                        item.onSelect?.();
                      }}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
