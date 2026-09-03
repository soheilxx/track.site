"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@track-site/ui";
import { Link, usePathname } from "@/i18n/navigation";
import { ACTIVE_LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type AppLocale } from "@/i18n/routing";
import { switchTarget, useLocalizedPaths } from "./localized-paths";

/**
 * Language switcher: written-out native names (no flags), a disclosure button with a list of links
 * that each lead to the same page in the target locale. Pages with localized slugs (Tracking
 * Knowledge articles) register their per-locale paths via `<LocalizedPathsFor>`, so the link goes
 * to the translation of the same article, never to `/<locale>/<current-slug>`. Only active locales
 * are offered. The choice is a plain navigation — no redirect logic — and is remembered in the
 * NEXT_LOCALE cookie, which the dashboard reads for its UI language. next-intl syncs that cookie
 * only on full document requests, so a client-side transition writes it explicitly here.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const localized = useLocalizedPaths();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const current = LOCALE_NAMES[locale as AppLocale] ?? locale;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Languages className="h-4 w-4 text-ink-3" aria-hidden="true" />
        <span className="sr-only">{t("language")}: </span>
        <span lang={locale}>{current}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <nav id={listId} aria-label={t("language")} hidden={!open} className="absolute right-0 z-50 mt-1 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
        <ul>
          {ACTIVE_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <li key={l}>
                <Link
                  href={switchTarget(localized, pathname, l)}
                  locale={l}
                  hrefLang={l}
                  lang={l}
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    rememberLocale(l);
                    setOpen(false);
                  }}
                  className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-2", active ? "font-medium text-ink" : "text-ink-2")}
                >
                  {LOCALE_NAMES[l]}
                  {active ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
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
