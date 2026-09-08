"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Banner } from "@track-site/ui";
import { presenceHeartbeatAction, presenceLeaveAction } from "@/server/ops/actions/support-ticket";
import type { PresenceView } from "@/server/support/presence";
import { PRESENCE_HEARTBEAT_MS, PRESENCE_STALE_MS, TICKET_TYPING_EVENT, TYPING_WINDOW_MS } from "./constants";

/** Drops everyone whose last heartbeat is older than the staleness window (`now` on the server's clock). */
const fresh = (list: PresenceView[], now: number): PresenceView[] => list.filter((o) => now - Date.parse(o.lastSeenAt) <= PRESENCE_STALE_MS);

/**
 * Collision detection: heartbeats every 15 s through a server action (`viewing`, or `typing` while the
 * composer changed within the last 10 s — a typing burst sends one heartbeat at once), the other operators
 * on the ticket in a live banner ("Marco is viewing this ticket" / "… is typing"). Rows older than 45 s
 * are dropped by the loader and, on every tick, locally as well — also when the heartbeat itself fails
 * (session expired, network gone), so the server-rendered list never outlives the staleness window. The
 * local pruning measures on the server's clock (`serverNow` of the render, then of every heartbeat, plus
 * the time elapsed here since) — a browser clock that is off by a minute would otherwise hide everyone or
 * keep them forever. The row is removed when the page is left, after a heartbeat still in flight settled.
 */
export function PresenceBanner({ ticketId, initial, serverNow }: { ticketId: string; initial: PresenceView[]; serverNow: string }) {
  const t = useTranslations("supportTicket");
  const [others, setOthers] = useState<PresenceView[]>(initial);
  const lastTyped = useRef(0);
  const lastMode = useRef<"viewing" | "typing">("viewing");
  const inFlight = useRef<Promise<void> | null>(null);
  // the render's server time (captured once; later refreshes replace the whole list through the heartbeat)
  const rendered = useRef(serverNow);
  // server clock minus browser clock: from the render's server time first, then from every heartbeat
  const skew = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    if (skew.current === null) {
      const at = Date.parse(rendered.current);
      skew.current = Number.isFinite(at) ? at - Date.now() : 0;
    }
    const serverClock = () => Date.now() + (skew.current ?? 0);
    const prune = () =>
      setOthers((current) => {
        const kept = fresh(current, serverClock());
        return kept.length === current.length ? current : kept;
      });
    const beat = async () => {
      // what we know goes stale on its own — with or without a successful heartbeat
      prune();
      if (inFlight.current || document.visibilityState === "hidden") return;
      const mode = Date.now() - lastTyped.current < TYPING_WINDOW_MS ? "typing" : "viewing";
      lastMode.current = mode;
      const run = (async () => {
        try {
          const result = await presenceHeartbeatAction({ ticketId, mode });
          const at = result.now ? Date.parse(result.now) : Number.NaN;
          if (Number.isFinite(at)) skew.current = at - Date.now();
          if (active && result.ok) setOthers(fresh(result.others, serverClock()));
          else if (active) prune();
        } catch {
          // a missed heartbeat is harmless: the row goes stale after 45 s, and the local list is pruned each tick
          if (active) prune();
        }
      })();
      inFlight.current = run;
      try {
        await run;
      } finally {
        if (inFlight.current === run) inFlight.current = null;
      }
    };
    void beat();
    const interval = window.setInterval(() => void beat(), PRESENCE_HEARTBEAT_MS);
    const onTyping = () => {
      lastTyped.current = Date.now();
      if (lastMode.current !== "typing") void beat();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void beat();
    };
    window.addEventListener(TICKET_TYPING_EVENT, onTyping);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(TICKET_TYPING_EVENT, onTyping);
      document.removeEventListener("visibilitychange", onVisibility);
      // leave only after a heartbeat still in flight settled, so its upsert cannot resurrect the row just removed
      const pending = inFlight.current ?? Promise.resolve();
      void pending.then(() => presenceLeaveAction({ ticketId })).catch(() => undefined);
    };
  }, [ticketId]);

  if (!others.length) {
    return (
      <p role="status" aria-live="polite" className="sr-only">
        {t("presence.alone")}
      </p>
    );
  }
  const typing = others.filter((o) => o.mode === "typing");
  const viewing = others.filter((o) => o.mode !== "typing");
  const names = (list: PresenceView[]) => list.map((o) => o.name).join(", ");
  return (
    <Banner tone="info" role="status" aria-live="polite" data-testid="ticket-presence">
      {typing.length ? <span className="block font-medium">{t("presence.typing", { names: names(typing), count: typing.length })}</span> : null}
      {viewing.length ? <span className="block">{t("presence.viewing", { names: names(viewing), count: viewing.length })}</span> : null}
      <span className="block text-xs text-ink-3">{t("presence.hint")}</span>
    </Banner>
  );
}
