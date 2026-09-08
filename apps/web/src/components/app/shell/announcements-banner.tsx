"use client";

import { ExternalLink, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { Banner, IconButton, buttonVariants, type Tone } from "@track-site/ui";
import type { AnnouncementView } from "@/server/announcements";

const STORAGE_KEY = "track.announcements.dismissed.v1";
const TONE: Record<AnnouncementView["severity"], Tone> = { info: "info", warn: "warn", bad: "bad" };

/** A dismissal is keyed by id + updatedAt, so an edited announcement shows again. */
const dismissKey = (a: AnnouncementView): string => `${a.id}:${a.updatedAt}`;

// --- per-browser dismissal store (localStorage behind useSyncExternalStore) ------------------------

const listeners = new Set<() => void>();
let snapshot: string | null = null;

function readStorage(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = readStorage();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  if (snapshot === null) snapshot = readStorage();
  return snapshot;
}

/** `null` on the server and during hydration: nothing renders until the browser's dismissals are known (no flash of a dismissed banner). */
const getServerSnapshot = (): string | null => null;

function parseDismissed(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// --- context filled by the dashboard layout (server data, no client round trip) --------------------

const AnnouncementsContext = createContext<AnnouncementView[]>([]);

/** Wraps the dashboard shell with the active announcements resolved by the layout (`activeAnnouncements`). */
export function AnnouncementsProvider({ items, children }: { items: AnnouncementView[]; children: ReactNode }) {
  return <AnnouncementsContext.Provider value={items}>{children}</AnnouncementsContext.Provider>;
}

/**
 * Banner slot of the dashboard shell: active platform announcements (server/announcements.ts) as
 * `Banner`s — the most severe first, `bad` announced as an alert — each dismissible per user through
 * localStorage (keyed by id + updatedAt, capped to the last 50 dismissals).
 */
export function AnnouncementsBanner() {
  const t = useTranslations("opsControls.customer.announcements");
  const items = useContext(AnnouncementsContext);
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismiss = useCallback((a: AnnouncementView) => {
    const next = [...parseDismissed(readStorage()), dismissKey(a)].slice(-50);
    snapshot = JSON.stringify(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, snapshot);
    } catch {
      // private mode or blocked storage: the banner stays hidden for this page only
    }
    for (const listener of listeners) listener();
  }, []);

  if (raw === null || items.length === 0) return null;
  const dismissed = new Set(parseDismissed(raw));
  const visible = items.filter((a) => !dismissed.has(dismissKey(a)));
  if (visible.length === 0) return null;
  return (
    <section aria-label={t("region")} className="mb-4 space-y-2" data-testid="announcements-banner">
      {visible.map((a) => (
        <Banner
          key={a.id}
          tone={TONE[a.severity]}
          title={a.title}
          data-announcement-id={a.id}
          action={
            a.linkUrl ? (
              <a href={a.linkUrl} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("open")}
              </a>
            ) : null
          }
          dismiss={
            <IconButton label={t("dismiss")} onClick={() => dismiss(a)}>
              <X className="size-4" aria-hidden="true" />
            </IconButton>
          }
        >
          {a.body ? <p className="whitespace-pre-line">{a.body}</p> : null}
        </Banner>
      ))}
    </section>
  );
}
