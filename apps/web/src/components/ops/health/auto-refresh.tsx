"use client";

import { Pause, Play, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Status } from "@track-site/ui";

/**
 * Client island of the health page: re-renders the server page every `intervalMs` while the tab is visible
 * (`router.refresh()` re-runs the loader; the page is force-dynamic), a manual refresh and a pause toggle.
 * `updatedLabel` is formatted on the server so server and client render identical markup; the relative age
 * appears after mount only.
 */
export function AutoRefresh({ generatedAt, updatedLabel, intervalMs }: { generatedAt: string; updatedLabel: string; intervalMs: number }) {
  const t = useTranslations("opsHealth.refresh");
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [pending, startTransition] = useTransition();
  const [ageSeconds, setAgeSeconds] = useState<number | null>(null);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  useEffect(() => {
    const at = Date.parse(generatedAt);
    if (Number.isNaN(at)) return;
    const update = () => setAgeSeconds(Math.max(0, Math.round((Date.now() - at) / 1000)));
    update();
    const id = setInterval(update, 5_000);
    return () => clearInterval(id);
  }, [generatedAt]);

  const seconds = Math.round(intervalMs / 1000);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ops-health-refresh">
      <p className="text-sm text-ink-3 tabular-nums">
        {t("updatedAt", { time: updatedLabel })}
        {ageSeconds !== null ? ` · ${t("ago", { seconds: ageSeconds })}` : null}
      </p>
      <Status tone={enabled ? "ok" : "neutral"} chip live className="text-xs">
        {enabled ? t("auto", { seconds }) : t("paused")}
      </Status>
      <Button
        size="sm"
        variant="secondary"
        onClick={refresh}
        loading={pending}
        loadingLabel={t("refreshing")}
        leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}
      >
        {t("now")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={enabled}
        onClick={() => setEnabled((v) => !v)}
        leadingIcon={enabled ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      >
        {t("toggle")}
      </Button>
    </div>
  );
}
