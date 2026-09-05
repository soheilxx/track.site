"use client";

import { useSyncExternalStore } from "react";
import { NO_DEVICE_HINTS, type DeviceHints } from "./tier";
import { isCoreMotion, type CoreMotion } from "./types";

/**
 * Motion preference sources of the Living AI Core as external stores (no effects, no hydration
 * mismatch — the server snapshots are the static defaults):
 *  - the per-user setting the dashboard layout renders as `data-ai-motion` on `<html>`;
 *  - the operating-system `prefers-reduced-motion` media query.
 */
const ATTRIBUTE = "data-ai-motion";
const REDUCED = "(prefers-reduced-motion: reduce)";

export function readAiMotionAttribute(): CoreMotion {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.getAttribute(ATTRIBUTE);
  return isCoreMotion(value) ? value : "system";
}

/** Writes the attribute immediately (optimistic UI); the server action persists the same value. */
export function setAiMotionAttribute(value: CoreMotion): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(ATTRIBUTE, value);
}

function subscribeAttribute(listener: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] });
  return () => observer.disconnect();
}

export function useAiMotionPreference(): CoreMotion {
  return useSyncExternalStore(subscribeAttribute, readAiMotionAttribute, () => "system");
}

function subscribeReduced(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(REDUCED);
  mql.addEventListener("change", listener);
  return () => mql.removeEventListener("change", listener);
}

function readReduced(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED).matches;
}

export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false);
}

/** `true` once React has hydrated on the client; `false` on the server and during hydration. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Coarse pointer = mobile-class device (no user-agent sniffing). */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

const finiteOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Device signals for the tier decision (`isConstrainedDevice`), read once per mount on the client.
 * On the server (Node also exposes a `navigator`) everything is unknown, so SSR never depends on it.
 */
export function readDeviceHints(): DeviceHints {
  if (typeof window === "undefined" || typeof navigator === "undefined") return NO_DEVICE_HINTS;
  const nav = navigator as Navigator & NavigatorHints;
  return {
    coarsePointer: isCoarsePointer(),
    saveData: nav.connection?.saveData === true,
    deviceMemory: finiteOrNull(nav.deviceMemory),
    hardwareConcurrency: finiteOrNull(nav.hardwareConcurrency),
  };
}
