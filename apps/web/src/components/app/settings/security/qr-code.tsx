"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@track-site/ui";
import { encodeQr, toSvgPath } from "./qr";

/**
 * Inline SVG QR code (rendered client-side by `qr.ts`, no dependency, no network). Always dark on
 * white regardless of the theme — scanners need the contrast — with the standard four-module quiet
 * zone. Renders `fallback` (null by default) when the value does not fit version 10, so the caller
 * can say that the manual key is the way in.
 */
export function QrCode({ value, label, className, fallback = null }: { value: string; label: string; className?: string; fallback?: ReactNode }) {
  const matrix = useMemo(() => encodeQr(value, "M"), [value]);
  if (!matrix) return fallback;
  const size = matrix.size + 8;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn("block h-auto w-full max-w-[14rem] rounded-[var(--radius-control)] border border-line", className)}
      data-testid="security-qr"
      data-qr-version={matrix.version}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={toSvgPath(matrix)} fill="#111111" />
    </svg>
  );
}
