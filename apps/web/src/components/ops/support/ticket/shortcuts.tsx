"use client";

import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { Checkbox, Kbd } from "@track-site/ui";
import { TICKET_SHORTCUT_EVENT, type TicketShortcutAction } from "./constants";

const KEYS: Record<string, TicketShortcutAction> = { r: "reply", n: "note", a: "assign_self", e: "solve" };

/** Per-browser preference (WCAG 2.2 SC 2.1.4: single-character shortcuts must be switchable off). */
const STORAGE_KEY = "track.ops.support.ticket.shortcuts";

// the preference as an external store: the server snapshot is "enabled" (no hydration mismatch), the client
// reads localStorage; a memory fallback keeps the toggle working when storage is unavailable (private mode)
let memoryEnabled = true;
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return memoryEnabled;
  }
}

function writeEnabled(enabled: boolean): void {
  memoryEnabled = enabled;
  try {
    if (enabled) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    // storage may be unavailable; the memory fallback still drives this page
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (tag === "BUTTON" && target.closest('[role="menu"]') !== null);
}

/**
 * Single-key shortcuts of the ticket page (`r` reply, `n` note, `a` assign to me, `e` solve). Ignored while
 * typing in a field, inside a dialog or with a modifier held; the actions run through the composer and the
 * properties panel, which listen for the custom event. The legend is visible so nothing is hidden, and the
 * shortcuts can be switched off (remembered in this browser) because single-character keys may clash with
 * speech input or other assistive technology — every action also has a button.
 */
export function TicketShortcuts() {
  const t = useTranslations("supportTicket");
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      const action = KEYS[event.key.toLowerCase()];
      if (!action || inEditable(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent<TicketShortcutAction>(TICKET_SHORTCUT_EVENT, { detail: action }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return (
    <section aria-labelledby="ticket-shortcuts-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-xs text-ink-2 sm:p-5" data-testid="ticket-shortcuts">
      <h2 id="ticket-shortcuts-title" className="text-sm font-semibold text-ink">
        {t("shortcuts.title")}
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {(Object.entries(KEYS) as Array<[string, TicketShortcutAction]>).map(([key, action]) => (
          <div key={key} className="contents">
            <dt>
              <Kbd>{key}</Kbd>
            </dt>
            <dd>{t(`shortcuts.${action}`)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <Checkbox checked={enabled} onChange={(e) => writeEnabled(e.target.checked)} label={t("shortcuts.enabled")} data-testid="ticket-shortcuts-toggle" />
        <p className="mt-1 text-ink-3">{t("shortcuts.disabledHint")}</p>
      </div>
    </section>
  );
}
