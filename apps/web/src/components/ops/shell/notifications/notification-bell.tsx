"use client";

import { AlarmClock, AtSign, Bell, Check, CheckCheck, MessageSquareReply, RefreshCw, TriangleAlert, UserCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from "react";
import { Alert, Button, Checkbox, IconButton, Sheet, Skeleton, cn } from "@track-site/ui";
import { formatRelative } from "@/components/ops/support/list/format";
import {
  markSupportNotificationsReadAction,
  pollSupportNotificationsAction,
  updateSupportNotificationPreferencesAction,
} from "@/server/ops/actions/support-notifications";
import type { AgentPreferences, NotificationFeed, NotificationView } from "@/server/support/notifications";
import { NOTIFICATION_LIST_LIMIT, NOTIFICATION_POLL_MS, type NotificationKind } from "./constants";

/**
 * Notification centre of the ops shell (docs/18 §"Notifications"): a bell with the unread count in the
 * header, a right-hand panel (`Sheet`: focus trap, Escape, restore) listing assignments, customer replies,
 * SLA warnings / breaches and @mentions in internal notes, "mark as read" per item and for everything, and
 * the operator's e-mail preferences. The feed is polled every 30 s through a server action while the tab
 * is visible (paused when hidden, refreshed on focus and when the panel opens); the poll doubles as the
 * operator's presence heartbeat. New arrivals are announced through a polite live region; each item is one
 * link to the ticket with a separate "mark as read" button next to it (no nested interactive elements).
 */

const ICONS: Record<NotificationKind, { Icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }> = {
  assignment: { Icon: UserCheck, className: "bg-primary-soft text-primary" },
  customer_reply: { Icon: MessageSquareReply, className: "bg-info-soft text-info" },
  sla_warning: { Icon: AlarmClock, className: "bg-warn-soft text-warn" },
  sla_breach: { Icon: TriangleAlert, className: "bg-bad-soft text-bad" },
  mention: { Icon: AtSign, className: "bg-violet-soft text-violet" },
};

/** `idle` with a null feed = the first poll has not answered yet (the panel shows skeletons). */
type Status = "idle" | "error" | "forbidden";

export function NotificationBell() {
  const t = useTranslations("supportNotifications");
  const locale = useLocale();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState("");
  const [prefsNote, setPrefsNote] = useState<"saved" | "error" | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const inFlight = useRef(false);
  const lastUnread = useRef<number | null>(null);

  const poll = useCallback(async () => {
    if (inFlight.current || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    inFlight.current = true;
    try {
      const result = await pollSupportNotificationsAction();
      if (result.ok && result.feed) {
        const next = result.feed;
        setFeed(next);
        setNow(Date.now());
        setStatus("idle");
        if (lastUnread.current !== null && next.unread > lastUnread.current) {
          const delta = next.unread - lastUnread.current;
          setAnnounce(delta === 1 ? t("live.newOne") : t("live.newMany", { count: delta }));
        }
        lastUnread.current = next.unread;
      } else setStatus(result.error === "forbidden" ? "forbidden" : "error");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [t]);

  useEffect(() => {
    // the first poll is deferred a tick: the effect only subscribes, the poll runs outside the render
    const first = window.setTimeout(() => void poll(), 0);
    const interval = window.setInterval(() => void poll(), NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setPrefsNote(null);
    void poll();
  }, [poll]);

  const markRead = useCallback(
    async (ids: string[] | "all") => {
      setFeed((f) => {
        if (!f) return f;
        const at = new Date().toISOString();
        const items = f.items.map((i) => (i.readAt || (ids !== "all" && !ids.includes(i.id)) ? i : { ...i, readAt: at }));
        const unread = ids === "all" ? 0 : Math.max(0, f.unread - f.items.filter((i) => !i.readAt && ids.includes(i.id)).length);
        lastUnread.current = unread;
        return { ...f, items, unread };
      });
      try {
        await markSupportNotificationsReadAction(ids === "all" ? { all: true } : { ids });
      } catch {
        // the next poll restores the server state
      }
    },
    [],
  );

  const savePreferences = useCallback(
    async (next: AgentPreferences) => {
      if (!feed) return;
      setSavingPrefs(true);
      setPrefsNote(null);
      const previous = feed.preferences;
      setFeed((f) => (f ? { ...f, preferences: next } : f));
      try {
        const result = await updateSupportNotificationPreferencesAction(next);
        if (result.ok && result.preferences) {
          const saved = result.preferences;
          setFeed((f) => (f ? { ...f, preferences: saved } : f));
          setPrefsNote("saved");
        } else {
          setFeed((f) => (f ? { ...f, preferences: previous } : f));
          setPrefsNote("error");
        }
      } catch {
        setFeed((f) => (f ? { ...f, preferences: previous } : f));
        setPrefsNote("error");
      } finally {
        setSavingPrefs(false);
      }
    },
    [feed],
  );

  const unread = feed?.unread ?? 0;
  const loading = feed === null && status === "idle";
  const label = unread > 0 ? t("bell.labelUnread", { count: unread }) : t("bell.label");
  const updated = feed ? formatRelative(feed.at, locale, now) : null;

  return (
    <>
      <IconButton
        label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={openPanel}
        // never squeezed by a crowded header: the 40 px target is a WCAG 2.2 target-size floor at 375 px
        className="relative shrink-0"
        data-testid="ops-notification-bell"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-chip)] bg-primary px-1 text-[10px] font-semibold leading-none text-on-primary tabular-nums"
            data-testid="ops-notification-count"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </IconButton>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <Sheet open={open} onClose={() => setOpen(false)} side="right" title={t("panel.title")} description={t("panel.description")} closeLabel={t("panel.close")} className="max-w-md">
        <div id={panelId} className="-mx-1 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-3">
              {updated ? t("panel.updated", { time: updated }) : t("panel.polling", { seconds: Math.round(NOTIFICATION_POLL_MS / 1000) })}
            </p>
            <div className="flex items-center gap-1">
              <IconButton label={t("panel.refresh")} onClick={() => void poll()} disabled={loading}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </IconButton>
              <Button variant="ghost" size="sm" onClick={() => void markRead("all")} disabled={unread === 0}>
                <CheckCheck className="size-4" aria-hidden="true" />
                {t("panel.markAllRead")}
              </Button>
            </div>
          </div>

          {status === "forbidden" ? <Alert tone="bad">{t("panel.forbidden")}</Alert> : null}
          {status === "error" ? <Alert tone="warn">{t("panel.error")}</Alert> : null}
          {loading ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("panel.loading")}>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : null}

          {feed && feed.items.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-8 text-center">
              <Bell className="mx-auto size-6 text-ink-3" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-ink">{t("panel.empty")}</p>
              <p className="mt-1 text-sm text-ink-3">{t("panel.emptyText")}</p>
            </div>
          ) : null}

          {feed && feed.items.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label={t("panel.title")}>
              {feed.items.map((item) => (
                <NotificationItem key={item.id} item={item} locale={locale} now={now} onOpen={() => { void markRead([item.id]); setOpen(false); }} onMarkRead={() => void markRead([item.id])} />
              ))}
            </ul>
          ) : null}
          {feed && feed.items.length >= NOTIFICATION_LIST_LIMIT ? <p className="text-xs text-ink-3">{t("panel.showingLatest", { count: NOTIFICATION_LIST_LIMIT })}</p> : null}

          {feed ? (
            <section aria-labelledby={`${panelId}-prefs`} className="border-t border-line pt-3">
              <h3 id={`${panelId}-prefs`} className="text-xs font-medium tracking-wide text-ink-3 uppercase">
                {t("preferences.title")}
              </h3>
              <Checkbox
                label={t("preferences.assignment")}
                checked={feed.preferences.emailOnAssignment}
                disabled={savingPrefs}
                onChange={(e) => void savePreferences({ ...feed.preferences, emailOnAssignment: e.currentTarget.checked })}
              />
              <Checkbox
                label={t("preferences.customerReply")}
                checked={feed.preferences.emailOnCustomerReply}
                disabled={savingPrefs}
                onChange={(e) => void savePreferences({ ...feed.preferences, emailOnCustomerReply: e.currentTarget.checked })}
              />
              <p className="mt-1 text-xs text-ink-3">{t("preferences.hint")}</p>
              <p role="status" aria-live="polite" className={cn("mt-2 text-xs", prefsNote === "error" ? "text-bad" : "text-ok", prefsNote ? "" : "sr-only")}>
                {prefsNote === "saved" ? t("preferences.saved") : prefsNote === "error" ? t("preferences.error") : ""}
              </p>
            </section>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}

function NotificationItem({ item, locale, now, onOpen, onMarkRead }: { item: NotificationView; locale: string; now: number; onOpen: () => void; onMarkRead: () => void }) {
  const t = useTranslations("supportNotifications");
  const { Icon, className } = ICONS[item.kind];
  const unread = !item.readAt;
  const who =
    item.actorKind === "former"
      ? t("item.formerOperator")
      : item.actor
        ? t("item.by", { name: item.actor.name })
        : item.actorKind === "customer"
          ? t("item.customer")
          : t("item.system");
  const clock = item.payload.clock ? t(`item.clock.${item.payload.clock}`) : null;
  const when = formatRelative(item.createdAt, locale, now);
  return (
    <li className="flex items-start gap-1">
      <Link
        href={`/ops/support/${item.ticket.id}`}
        onClick={onOpen}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-control-sm)] px-2 py-2 text-left transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
          unread && "bg-primary-soft/40",
        )}
      >
        <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full", className)} aria-hidden="true">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm text-ink", unread ? "font-semibold" : "font-medium")}>
            {t(`kinds.${item.kind}`)}
            <span className="text-ink-3"> · </span>
            <span className="tabular-nums">{t("item.ticket", { number: item.ticket.number })}</span>
            {unread ? <span className="sr-only"> ({t("panel.unread")})</span> : null}
          </span>
          <span className="block truncate text-sm text-ink-2">{item.ticket.subject}</span>
          <span className="block text-xs text-ink-3">
            {[who, clock, when].filter(Boolean).join(" · ")}
          </span>
        </span>
        {unread ? <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
      </Link>
      {unread ? (
        <IconButton label={t("panel.markRead")} onClick={onMarkRead} className="mt-0.5 shrink-0">
          <Check className="size-4" aria-hidden="true" />
        </IconButton>
      ) : (
        <span className="size-11 shrink-0" aria-hidden="true" />
      )}
    </li>
  );
}
