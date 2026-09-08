"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { formatRemaining } from "./labels";

const TICK_MS = 30_000;

/** The wall clock at 30-second granularity as an external store: no state set inside an effect, no hydration mismatch. */
function subscribe(onTick: () => void): () => void {
  const id = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(id);
}
const clientTick = () => Math.floor(Date.now() / TICK_MS);

/**
 * Remaining window of an active grant, refreshed every 30 seconds. The server render uses the server's clock
 * (`now`), the client takes over after hydration; once the window is over the page is refreshed a single
 * time so the grant moves to the history. Not a live region: a ticking value would be announced far too often.
 */
export function Countdown({ endsAt, now }: { endsAt: string; now: string }) {
  const t = useTranslations("opsBreakGlass");
  const router = useRouter();
  const tick = useSyncExternalStore(subscribe, clientTick, () => Math.floor(new Date(now).getTime() / TICK_MS));
  const remaining = Math.max(0, new Date(endsAt).getTime() - tick * TICK_MS);
  const refreshed = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [remaining, router]);
  return (
    <span className="text-xs text-ink-3 tabular-nums" data-testid="break-glass-countdown">
      {remaining === 0 ? t("active.countdown.expired") : t("active.countdown.remaining", { time: formatRemaining(t, remaining) })}
    </span>
  );
}
