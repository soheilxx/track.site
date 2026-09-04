"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Button, Input, Label } from "@track-site/ui";

const noSubscription = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => "";

/** Copies the absolute scenario URL; the visible read-only field is the fallback when the clipboard is unavailable. */
export function ShareLink({ path }: { path: string }) {
  const t = useTranslations("consent.simulator.share");
  const id = useId();
  // The origin is only known in the browser; the server renders the path and hydration swaps it in.
  const origin = useSyncExternalStore(noSubscription, clientOrigin, serverOrigin);
  const href = `${origin}${path}`;
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={id}>{t("url")}</Label>
          <Input id={id} readOnly value={href} onFocus={(e) => e.currentTarget.select()} className="mt-1 font-mono text-xs" />
        </div>
        <Button variant="secondary" onClick={() => void copy()} leadingIcon={status === "copied" ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}>
          {t("copy")}
        </Button>
      </div>
      <p className="text-xs text-ink-3">{t("hint")}</p>
      <p role="status" aria-live="polite" className="min-h-4 text-xs text-ink-2">
        {status === "copied" ? t("copied") : status === "failed" ? t("failed") : ""}
      </p>
    </div>
  );
}
