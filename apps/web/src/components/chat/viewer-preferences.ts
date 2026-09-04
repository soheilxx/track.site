"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-viewer conveniences (panel open/minimised, panel width) stored in localStorage and exposed
 * as an external store, so components derive their state from it during render — no mount
 * effects, no hydration mismatch (the server snapshot is always `null`). Storage may be missing or
 * blocked (private mode); every access is guarded and the app renders correctly without it.
 */
const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function read(key: string): string | null {
  if (!cache.has(key)) {
    try {
      cache.set(key, window.localStorage.getItem(key));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key) ?? null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setViewerPreference(key: string, value: string | null): void {
  cache.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the in-memory value still applies for this page view */
  }
  for (const listener of listeners) listener();
}

/** Stored preference (`null` on the server, before hydration and when nothing is stored). */
export function useViewerPreference(key: string): string | null {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}

/** Media query as an external store; `null` on the server and during hydration. */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (listener) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", listener);
      return () => mql.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}
