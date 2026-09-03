"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/routing";

/**
 * Per-locale paths of the current page for pages whose URL differs per language (Tracking
 * Knowledge articles with localized slugs). The marketing layout provides the store, the article
 * page registers its paths with `LocalizedPathsFor`, and the language switcher resolves its links
 * through `switchTarget()` so a language change lands on the translation of the same article
 * (supplement §7) instead of on `/<locale>/<current-slug>`.
 *
 * The registration happens in an effect: the server-rendered switcher links use the locale-neutral
 * pathname (correct whenever slugs are shared), and the client corrects them right after hydration
 * for articles whose slugs diverge. Plain `.ts` (no JSX) so the pure `switchTarget` is unit-testable
 * under the app's `jsx: preserve` tsconfig.
 */
export interface LocalizedPaths {
  /** Locale-neutral path per locale that has a published version, e.g. `{ en: "/tracking-knowledge/a", de: "/tracking-knowledge/b" }`. */
  paths: Partial<Record<AppLocale, string>>;
  /** Target for locales without a version of this page (e.g. the knowledge index), never a 404. */
  fallback: string;
}

interface Store {
  value: LocalizedPaths | null;
  set: (value: LocalizedPaths | null) => void;
}

const LocalizedPathsContext = createContext<Store>({ value: null, set: () => undefined });

export function LocalizedPathsProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<LocalizedPaths | null>(null);
  const store = useMemo<Store>(() => ({ value, set }), [value]);
  return createElement(LocalizedPathsContext.Provider, { value: store }, children);
}

/** Registers the per-locale paths of the page that renders it; cleared again when the page unmounts. */
export function LocalizedPathsFor({ paths, fallback }: LocalizedPaths): null {
  const { set } = useContext(LocalizedPathsContext);
  const key = JSON.stringify(paths);
  useEffect(() => {
    set({ paths: JSON.parse(key) as LocalizedPaths["paths"], fallback });
    return () => set(null);
  }, [key, fallback, set]);
  return null;
}

export function useLocalizedPaths(): LocalizedPaths | null {
  return useContext(LocalizedPathsContext).value;
}

/**
 * Locale-neutral path the switcher should link to for `locale`: the registered translation when the
 * page has localized paths, its fallback when that locale has no version, otherwise the current
 * pathname (same page, other language).
 */
export function switchTarget(localized: LocalizedPaths | null, pathname: string, locale: AppLocale): string {
  if (!localized) return pathname;
  return localized.paths[locale] ?? localized.fallback;
}
