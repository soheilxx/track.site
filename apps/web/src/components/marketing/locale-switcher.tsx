"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { cn } from "@track-site/ui";
import { Link, usePathname } from "@/i18n/navigation";
import { ACTIVE_LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type AppLocale } from "@/i18n/routing";
import { switchTarget, useLocalizedPaths } from "./localized-paths";

/**
 * Language switcher: written-out native names (no flags), each link leading to the same page in the
 * target locale. Pages with localized slugs (Tracking Knowledge articles) register their per-locale
 * paths via `<LocalizedPathsFor>`, so the link goes to the translation of the same article, never to
 * `/<locale>/<current-slug>`. Only active locales are offered. The choice is a plain navigation — no
 * redirect logic — remembered in the NEXT_LOCALE cookie, which the dashboard reads for its UI
 * language. next-intl syncs that cookie only on full document requests, so a client-side transition
 * writes it explicitly here. That cookie is a user-requested preference (strictly necessary); it is
 * the only cookie the marketing site writes — see consent-dialog.tsx.
 *
 * Variants: `menu` (header: disclosure button + list; ArrowUp/Down/Home/End move, Escape closes and
 * returns focus, focus leaving or a click outside closes) and `inline` (footer and mobile drawer: the
 * list alone as chips inside a `<nav>`).
 */
export interface LocaleSwitcherProps {
  variant?: "menu" | "inline";
  /** Accessible name ("Language"), resolved by the server-rendered parent (header, footer, auth frame). */
  label: string;
  className?: string;
  /** Called after a language link is activated (the mobile drawer closes itself). */
  onNavigate?: () => void;
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function LocaleSwitcher({ variant = "menu", label, className, onNavigate }: LocaleSwitcherProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const localized = useLocalizedPaths();
  const name = label;
  const [open, setOpen] = useState(false);
  const focusFirst = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // keyboard open (ArrowDown) lands on the first language
  useEffect(() => {
    if (!open || !focusFirst.current) return;
    focusFirst.current = false;
    root.current?.querySelector<HTMLElement>("[data-locale-link]")?.focus();
  }, [open]);

  const select = useCallback(
    (target: AppLocale) => {
      rememberLocale(target);
      setOpen(false);
      onNavigate?.();
    },
    [onNavigate],
  );

  const list = (linkClass: (active: boolean) => string) => (
    <ul className={variant === "inline" ? "flex flex-wrap items-center gap-1" : "grid gap-0.5"}>
      {ACTIVE_LOCALES.map((l) => {
        const active = l === locale;
        return (
          <li key={l}>
            <Link href={switchTarget(localized, pathname, l)} locale={l} hrefLang={l} lang={l} aria-current={active ? "true" : undefined} data-locale-link="" onClick={() => select(l)} className={linkClass(active)}>
              {variant === "inline" && active ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
              {LOCALE_NAMES[l]}
              {variant === "menu" && active ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (variant === "inline") {
    return (
      <nav aria-label={name} className={cn("flex items-center gap-2", className)}>
        <Languages className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        {list((active) =>
          cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-chip)] border px-3 text-sm transition-colors duration-[var(--motion-fast)] ease-out pointer-coarse:min-h-11",
            active ? "border-line-2 bg-surface-2 font-medium text-ink" : "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
            focusRing,
          ),
        )}
      </nav>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    }
    const links = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-locale-link]") ?? []);
    const index = links.indexOf(event.target as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        focusFirst.current = true;
        setOpen(true);
        return;
      }
      links[index < 0 ? 0 : Math.min(index + 1, links.length - 1)]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      if (!open) return;
      event.preventDefault();
      if (index <= 0) button.current?.focus();
      else links[index - 1]?.focus();
      return;
    }
    if ((event.key === "Home" || event.key === "End") && open && index >= 0) {
      event.preventDefault();
      (event.key === "Home" ? links[0] : links[links.length - 1])?.focus();
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !event.currentTarget.contains(next)) setOpen(false);
  };

  const current = LOCALE_NAMES[locale as AppLocale] ?? locale;
  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control-sm)] border border-line bg-surface px-2.5 text-sm text-ink transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 pointer-coarse:min-h-11", focusRing)}
      >
        <Languages className="size-4 text-ink-3" aria-hidden="true" />
        <span className="sr-only">{name}: </span>
        <span lang={locale}>{current}</span>
        <ChevronDown className={cn("size-3.5 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out", open && "rotate-180")} aria-hidden="true" />
      </button>
      <nav id={listId} aria-label={name} hidden={!open} className="absolute right-0 z-50 mt-2 min-w-48 rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-pop">
        {list((active) => cn("flex min-h-10 items-center justify-between gap-3 rounded-[var(--radius-control-sm)] px-3 text-sm transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 pointer-coarse:min-h-11", active ? "font-medium text-ink" : "text-ink-2", focusRing))}
      </nav>
    </div>
  );
}

function rememberLocale(locale: AppLocale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    /* cookie storage unavailable: the URL still carries the locale */
  }
}
