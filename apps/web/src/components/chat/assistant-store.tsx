"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AssistantUiResponse } from "@track-site/ai";
import { readSse, type ChatMessage, type ChatStatus, type CredentialRequestView, type PendingApprovalView, type ToolActivity } from "./types";
import { setViewerPreference, useMediaQuery, useViewerPreference } from "./viewer-preferences";

/**
 * Track AI state that must survive route changes, panel minimising and the mobile sheet closing
 * (supplement §9): the provider lives in the dashboard layout, owns the conversation per site, the
 * running turn (SSE stream), the composer draft, the scroll position and the panel geometry. The
 * chat components are presentational and can mount/unmount freely. State is keyed by site id so a
 * site or tenant switch never mixes conversations; the visible context line confirms the switch.
 *
 * Extension point for phase 6: `activity` events (activity.*, job.progress) arrive through the
 * same SSE reader — add them to `ChatState` here and render them in the panel's `activity` slot.
 */
export interface AssistantSite {
  id: string;
  name: string;
  trackingId: string;
  primaryDomain: string | null;
  status: string;
}

export interface AssistantEnvironment {
  id: string;
  kind: "production" | "staging" | "development";
  name: string;
  testMode: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  status: ChatStatus;
  tools: ToolActivity[];
  approval: PendingApprovalView | null;
  credential: CredentialRequestView | null;
  notice: string | null;
  error: string | null;
  draft: string;
  loaded: "idle" | "loading" | "ready" | "failed";
  /** Last known scroll offset of the message list (restored when the list mounts again). */
  scrollTop: number | null;
}

export type PanelPresentation = "docked" | "drawer" | "sheet";
export type AssistantMode = "chat" | "wizard";

export interface AssistantApi {
  sites: AssistantSite[];
  /** Effective site: a page-level binding (setup page of another site) or the workspace's active site. */
  siteId: string | null;
  site: AssistantSite | null;
  environment: AssistantEnvironment | null;
  aiEnabled: boolean;
  locale: string;
  bindSite: (siteId: string | null) => void;
  /** Panel geometry: `open` is null until the viewer's preference has been read on the client. */
  open: boolean | null;
  presentation: PanelPresentation;
  width: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setWidth: (px: number) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  focusComposer: () => void;
  mode: AssistantMode;
  setMode: (mode: AssistantMode) => void;
  chat: ChatState;
  load: () => void;
  send: (text: string) => Promise<void>;
  setDraft: (text: string) => void;
  saveScroll: (top: number | null) => void;
  dismissApproval: () => void;
  dismissCredential: () => void;
}

export const PANEL_MIN_WIDTH = 380;
export const PANEL_MAX_WIDTH = 440;
export const PANEL_DEFAULT_WIDTH = 400;
const WIDTH_KEY = "ts-assistant-width";
const OPEN_KEY = "ts-assistant-open";
const OPEN_BY_DEFAULT = "(min-width: 80rem)";
const DOCKED = "(min-width: 64rem)";
const DRAWER = "(min-width: 48rem)";

const EMPTY: ChatState = { messages: [], status: "idle", tools: [], approval: null, credential: null, notice: null, error: null, draft: "", loaded: "idle", scrollTop: null };

const AssistantContext = createContext<AssistantApi | null>(null);

function clampWidth(px: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(px)));
}

export function AssistantProvider({ sites, activeSiteId, environment, aiEnabled, locale, children }: { sites: AssistantSite[]; activeSiteId: string | null; environment: AssistantEnvironment | null; aiEnabled: boolean; locale: string; children: ReactNode }) {
  const t = useTranslations("chat");
  const [boundSiteId, setBoundSiteId] = useState<string | null>(null);
  const siteId = boundSiteId && sites.some((s) => s.id === boundSiteId) ? boundSiteId : activeSiteId;
  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  // viewport class + viewer preferences are external stores: derived during render, no mount effect, no hydration mismatch
  const docked = useMediaQuery(DOCKED);
  const drawer = useMediaQuery(DRAWER);
  const large = useMediaQuery(OPEN_BY_DEFAULT);
  const storedOpen = useViewerPreference(OPEN_KEY);
  const storedWidth = useViewerPreference(WIDTH_KEY);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const presentation: PanelPresentation = docked === null || docked ? "docked" : drawer ? "drawer" : "sheet";
  // docked: open by default on large screens unless the viewer minimised it; overlays (tablet, mobile) start closed
  const open: boolean | null = docked === null ? null : docked ? (storedOpen === null ? Boolean(large) : storedOpen === "1") : overlayOpen;
  const width = clampWidth(Number(storedWidth) || PANEL_DEFAULT_WIDTH);
  const [mode, setMode] = useState<AssistantMode>(aiEnabled ? "chat" : "wizard");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const [chats, setChats] = useState<Record<string, ChatState>>({});
  // latest state for the async turn loop without re-creating `send` on every update
  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  const loadingRef = useRef(new Set<string>());

  const setOpen = useCallback(
    (next: boolean) => {
      if (presentation === "docked") setViewerPreference(OPEN_KEY, next ? "1" : "0");
      else setOverlayOpen(next);
    },
    [presentation],
  );
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const setWidth = useCallback((px: number) => setViewerPreference(WIDTH_KEY, String(clampWidth(px))), []);
  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const patch = useCallback((id: string, fn: (state: ChatState) => ChatState) => {
    setChats((all) => ({ ...all, [id]: fn(all[id] ?? EMPTY) }));
  }, []);

  const load = useCallback(() => {
    if (!siteId) return;
    const id = siteId;
    if ((chatsRef.current[id] ?? EMPTY).loaded !== "idle" || loadingRef.current.has(id)) return;
    loadingRef.current.add(id);
    patch(id, (s) => ({ ...s, loaded: "loading" }));
    fetch(`/api/ai/chat?siteId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((b: { ok: boolean; messages?: ChatMessage[] }) => {
        patch(id, (s) => ({ ...s, loaded: "ready", messages: b.ok && b.messages ? b.messages.filter((m) => m.role === "user" || m.role === "assistant") : s.messages }));
      })
      .catch(() => patch(id, (s) => ({ ...s, loaded: "failed", error: t("loadFailed") })))
      .finally(() => loadingRef.current.delete(id));
  }, [siteId, patch, t]);

  const send = useCallback(
    async (text: string) => {
      const id = siteId;
      if (!id) return;
      const trimmed = text.trim();
      const current = chatsRef.current[id] ?? EMPTY;
      if (!trimmed || current.status !== "idle") return;
      patch(id, (s) => ({ ...s, error: null, notice: null, approval: null, draft: "", status: "thinking", tools: [], messages: [...s.messages, { id: `local-${Date.now()}`, role: "user", content: trimmed, ui: null, createdAt: new Date().toISOString() }] }));
      try {
        const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId: id, message: trimmed }) });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
          patch(id, (s) => ({ ...s, error: body.code === "NOT_CONNECTED" ? t("notConfigured") : (body.message ?? t("failed")), status: "idle" }));
          if (body.code === "NOT_CONNECTED") setMode("wizard");
          return;
        }
        await readSse(res, (e) => {
          switch (e.type) {
            case "assistant.progress":
              patch(id, (s) => ({ ...s, status: e.phase === "tools" ? "tools" : e.phase === "streaming" ? "streaming" : "thinking" }));
              break;
            case "tool.started":
              patch(id, (s) => ({ ...s, tools: [...s.tools, { callId: String(e.callId), name: String(e.name), status: "running", summary: null }] }));
              break;
            case "tool.completed":
              patch(id, (s) => ({ ...s, tools: s.tools.map((x) => (x.callId === e.callId ? { ...x, status: e.ok ? "ok" : "error", summary: String(e.summary ?? "") } : x)) }));
              break;
            case "ui.final": {
              const ui = e.ui as AssistantUiResponse;
              patch(id, (s) => ({ ...s, messages: [...s.messages, { id: `a-${Date.now()}`, role: "assistant", content: ui.message, ui, createdAt: new Date().toISOString() }] }));
              break;
            }
            case "ui.approval":
              patch(id, (s) => ({ ...s, approval: { approvalId: String(e.approvalId), action: String(e.action), summary: (e.summary as PendingApprovalView["summary"]) ?? {}, expiresAt: String(e.expiresAt) } }));
              break;
            case "ui.credential":
              patch(id, (s) => ({ ...s, credential: e.component as CredentialRequestView }));
              break;
            case "dlp.notice":
              patch(id, (s) => ({ ...s, notice: String(e.message) }));
              break;
            case "error":
              patch(id, (s) => ({ ...s, error: String(e.message) }));
              break;
            default:
              // unknown or internal stream events are ignored (phase 6 adds the allow-listed activity.* events here)
              break;
          }
        });
      } catch {
        patch(id, (s) => ({ ...s, error: t("failed") }));
      } finally {
        patch(id, (s) => ({ ...s, status: "idle" }));
      }
    },
    [siteId, patch, t],
  );

  const setDraft = useCallback((text: string) => siteId && patch(siteId, (s) => ({ ...s, draft: text })), [siteId, patch]);
  const saveScroll = useCallback((top: number | null) => siteId && patch(siteId, (s) => (s.scrollTop === top ? s : { ...s, scrollTop: top })), [siteId, patch]);
  const dismissApproval = useCallback(() => siteId && patch(siteId, (s) => ({ ...s, approval: null })), [siteId, patch]);
  const dismissCredential = useCallback(() => siteId && patch(siteId, (s) => ({ ...s, credential: null })), [siteId, patch]);
  const bindSite = useCallback((id: string | null) => setBoundSiteId(id), []);

  const chat = (siteId && chats[siteId]) || EMPTY;
  const value = useMemo<AssistantApi>(
    () => ({ sites, siteId, site, environment, aiEnabled, locale, bindSite, open, presentation, width, setOpen, toggle, setWidth, composerRef, focusComposer, mode, setMode, chat, load, send, setDraft, saveScroll, dismissApproval, dismissCredential }),
    [sites, siteId, site, environment, aiEnabled, locale, bindSite, open, presentation, width, setOpen, toggle, setWidth, focusComposer, mode, chat, load, send, setDraft, saveScroll, dismissApproval, dismissCredential],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantApi {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

/** Binds the Track AI panel to a page's site while the page is mounted (e.g. the setup page of another site). */
export function AssistantSiteBinding({ siteId }: { siteId: string }) {
  const { bindSite } = useAssistant();
  useEffect(() => {
    bindSite(siteId);
    return () => bindSite(null);
  }, [siteId, bindSite]);
  return null;
}
