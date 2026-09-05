"use client";

import { Minimize2, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton, cn } from "@track-site/ui";
import { AssistantComposer, AssistantContextLine, AssistantMessages, AssistantModeToggle } from "@/components/chat/assistant-chat";
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, useAssistant } from "@/components/chat/assistant-store";
import { useAssistantUiState, type AssistantUiState } from "@/components/chat/assistant-ui-state";
import { AssistantPanel } from "./assistant-panel";

/**
 * Hosts the Track AI panel in the three presentations of the viewport-fixed shell (supplement §9):
 *  - docked column (≥ 64 rem): open by default on large screens, resizable 380–440 px, minimisable
 *    to the header launcher;
 *  - drawer (48–64 rem): controlled modal overlay from the right;
 *  - sheet (< 48 rem): full-screen bottom sheet at 100dvh whose height follows the visual viewport,
 *    so the on-screen keyboard never covers the composer or the last message.
 * The conversation state lives in the AssistantProvider (layout level), so switching presentation,
 * minimising or navigating never loses messages, running jobs or the scroll position.
 */
export function AssistantHost() {
  const t = useTranslations("shell.assistant");
  const { open, presentation, width, setWidth, setOpen, focusComposer, siteId } = useAssistant();
  // motion-relevant state (idle | listening | working | streaming | approval_required | success | blocked), derived from
  // real events with hysteresis; exposed on the panel container for the Living AI Core (ambient slot) and tests
  const { state: aiState } = useAssistantUiState();
  const titleId = useId();

  const content = (extra: ReactNode) => (
    <AssistantPanel
      titleId={titleId}
      title={
        <>
          <span className="inline-flex size-6 items-center justify-center rounded-[var(--radius-control-sm)] bg-violet-soft text-violet" aria-hidden="true">
            <Sparkles className="size-3.5" />
          </span>
          {t("title")}
        </>
      }
      subtitle={t("subtitle")}
      context={<AssistantContextLine />}
      actions={
        <>
          <AssistantModeToggle />
          {extra}
        </>
      }
      ambient={null}
      activity={null}
      composer={<AssistantComposer />}
    >
      {/* keyed by site: a site or tenant switch starts a fresh list (window, scroll, "new messages" state), never mixed data */}
      <AssistantMessages key={siteId ?? "none"} />
    </AssistantPanel>
  );

  if (presentation === "docked") {
    if (open === false) return null;
    return (
      <aside
        aria-labelledby={titleId}
        data-testid="assistant-panel"
        data-state={open === null ? "default" : "open"}
        data-ai-state={aiState}
        className={cn("relative hidden min-h-0 shrink-0 flex-col border-l border-line bg-surface", open === null ? "xl:flex" : "lg:flex")}
        style={{ width }}
      >
        <ResizeHandle width={width} onChange={setWidth} label={t("resize")} valueText={t("width", { px: width })} />
        {content(
          <IconButton label={t("minimise")} onClick={() => setOpen(false)} data-testid="assistant-minimise">
            <Minimize2 className="size-4" aria-hidden="true" />
          </IconButton>,
        )}
      </aside>
    );
  }

  return (
    <AssistantOverlay open={open === true} onClose={() => setOpen(false)} labelledBy={titleId} variant={presentation} onOpened={focusComposer} aiState={aiState}>
      {content(
        <IconButton label={t("close")} onClick={() => setOpen(false)} data-testid="assistant-close">
          <X className="size-5" aria-hidden="true" />
        </IconButton>,
      )}
    </AssistantOverlay>
  );
}

/** Keyboard- and pointer-operable separator at the panel's left edge (arrow keys ± 8 px, Home/End). */
function ResizeHandle({ width, onChange, label, valueText }: { width: number; onChange: (px: number) => void; label: string; valueText: string }) {
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onChange(dragging.current.startWidth + (dragging.current.startX - event.clientX));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 8;
    if (event.key === "ArrowLeft") onChange(width + step);
    else if (event.key === "ArrowRight") onChange(width - step);
    else if (event.key === "Home") onChange(PANEL_MIN_WIDTH);
    else if (event.key === "End") onChange(PANEL_MAX_WIDTH);
    else return;
    event.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      aria-valuenow={width}
      aria-valuetext={valueText}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none hover:bg-primary-soft-2 focus-visible:bg-primary-soft-2 focus-visible:outline-2 focus-visible:outline-primary"
    />
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal host for the drawer and the mobile sheet: portal into <body>, `inert` on the rest of the
 * document, focus trap, Escape, focus restore. The sheet follows `visualViewport` (height + offset)
 * so the composer stays above the on-screen keyboard.
 */
function AssistantOverlay({ open, onClose, labelledBy, variant, onOpened, aiState, children }: { open: boolean; onClose: () => void; labelledBy: string; variant: "drawer" | "sheet"; onOpened?: () => void; aiState: AssistantUiState; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  // the overlay only opens from client interaction, so `document` exists whenever it renders; the guard keeps SSR safe
  const [canPortal] = useState(() => typeof document !== "undefined");

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const opener = document.activeElement as HTMLElement | null;
    const others = Array.from(document.body.children).filter((el) => !(panel && el.contains(panel)) && !el.hasAttribute("inert"));
    for (const el of others) el.setAttribute("inert", "");
    const target = panel?.querySelector<HTMLElement>("textarea, [data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus({ preventScroll: true });
    onOpened?.();
    return () => {
      for (const el of others) el.removeAttribute("inert");
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onOpened]);

  // mobile keyboard: size the sheet to the visual viewport instead of the layout viewport
  useEffect(() => {
    if (!open || variant !== "sheet") return;
    const vv = window.visualViewport;
    const el = panelRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.height = `${Math.round(vv.height)}px`;
      el.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`;
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [open, variant]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || !canPortal) return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex", variant === "drawer" ? "justify-end" : "items-end")} onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-ink/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid="assistant-panel"
        data-state="open"
        data-ai-state={aiState}
        className={cn("relative flex min-h-0 flex-col bg-surface text-ink shadow-pop outline-none", variant === "drawer" ? "h-full w-[400px] max-w-full border-l border-line" : "h-dvh w-full")}
        style={variant === "sheet" ? { willChange: "transform" } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
