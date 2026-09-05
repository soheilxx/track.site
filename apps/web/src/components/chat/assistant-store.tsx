"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { UiEvent } from "@track-site/ai";
import { EMPTY_CHAT, applyUiEvent, applyUiEvents, startTurn, type ChatState } from "./chat-reducer";
import { readSse, type ChatMessage } from "./types";
import { parseUiEvent } from "./ui-events";
import { setViewerPreference, useMediaQuery, useViewerPreference } from "./viewer-preferences";

/**
 * Track AI state that must survive route changes, panel minimising and the mobile sheet closing
 * (supplement §9): the provider lives in the dashboard layout, owns the conversation per site, the
 * running turn (SSE stream), the composer draft, the scroll position and the panel geometry. The
 * chat components are presentational and can mount/unmount freely. State is keyed by site id so a
 * site or tenant switch never mixes conversations; the visible context line confirms the switch.
 *
 * The stream is consumed through the browser-facing contract only (`parseUiEvent` → `applyUiEvent`):
 * activity sentences bound to real tool runs, real job stages, the released final answer, approval
 * references and errors. Every turn carries a client-generated idempotency key; if the connection
 * drops the same turn is resumed by id from the last applied sequence number, so no tool ever runs
 * twice and no frame is applied twice.
 */
export type { ChatState } from "./chat-reducer";

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
  /** composer focus = "listening" for the Living AI Core (a deliberate interaction, not every keystroke) */
  setComposerFocused: (focused: boolean) => void;
  saveScroll: (top: number | null) => void;
  dismissApproval: () => void;
  dismissCredential: () => void;
  /** contract events returned by the approval route (activity of the confirmed action) */
  applyEvents: (events: UiEvent[]) => void;
}

export const PANEL_MIN_WIDTH = 380;
export const PANEL_MAX_WIDTH = 440;
export const PANEL_DEFAULT_WIDTH = 400;
const WIDTH_KEY = "ts-assistant-width";
const OPEN_KEY = "ts-assistant-open";
const OPEN_BY_DEFAULT = "(min-width: 80rem)";
const DOCKED = "(min-width: 64rem)";
const DRAWER = "(min-width: 48rem)";
/** one initial request plus two resumes of the same turn */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;

const AssistantContext = createContext<AssistantApi | null>(null);

function clampWidth(px: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(px)));
}

/** Idempotency key of a turn (uuid; the server validates the format). */
function newTurnId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${((8 + Math.floor(Math.random() * 4)) as number).toString(16)}${hex(3)}-${hex(12)}`;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AssistantProvider({ sites, activeSiteId, environment, aiEnabled, locale, children }: { sites: AssistantSite[]; activeSiteId: string | null; environment: AssistantEnvironment | null; aiEnabled: boolean; locale: string; children: ReactNode }) {
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
    setChats((all) => ({ ...all, [id]: fn(all[id] ?? EMPTY_CHAT) }));
  }, []);

  const load = useCallback(() => {
    if (!siteId) return;
    const id = siteId;
    if ((chatsRef.current[id] ?? EMPTY_CHAT).loaded !== "idle" || loadingRef.current.has(id)) return;
    loadingRef.current.add(id);
    patch(id, (s) => ({ ...s, loaded: "loading" }));
    fetch(`/api/ai/chat?siteId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((b: { ok: boolean; messages?: ChatMessage[] }) => {
        patch(id, (s) => ({ ...s, loaded: "ready", messages: b.ok && b.messages ? b.messages.filter((m) => m.role === "user" || m.role === "assistant") : s.messages }));
      })
      .catch(() => patch(id, (s) => ({ ...s, loaded: "failed", error: { code: "LOAD_FAILED", message: "", retryable: true } })))
      .finally(() => loadingRef.current.delete(id));
  }, [siteId, patch]);

  const send = useCallback(
    async (text: string) => {
      const id = siteId;
      if (!id) return;
      const trimmed = text.trim();
      const current = chatsRef.current[id] ?? EMPTY_CHAT;
      if (!trimmed || current.status !== "idle") return;
      const turnId = newTurnId();
      patch(id, (s) => startTurn(s, { turnId, text: trimmed, now: Date.now() }));
      let lastSeq = 0;
      let finished = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !finished; attempt++) {
        if (attempt > 0) {
          patch(id, (s) => ({ ...s, status: "reconnecting", notice: "reconnecting" }));
          await wait(RETRY_DELAY_MS * attempt);
        }
        let res: Response;
        try {
          // the same turn id resumes the running turn on the server from the last applied sequence number
          res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId: id, message: trimmed, turnId, afterSeq: lastSeq }) });
        } catch {
          continue;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
          const code = typeof body.code === "string" ? body.code : "FAILED";
          patch(id, (s) => ({ ...s, status: "idle", turnId: null, notice: null, error: { code, message: body.message ?? "", retryable: false } }));
          if (code === "NOT_CONNECTED") setMode("wizard");
          return;
        }
        if (attempt > 0) patch(id, (s) => ({ ...s, notice: "resumed", status: "working" }));
        try {
          await readSse(res, (frame) => {
            if (frame.id !== null) {
              if (frame.id <= lastSeq) return;
              lastSeq = frame.id;
            }
            const event = parseUiEvent(frame.data);
            if (!event) return;
            if (event.type === "done") finished = true;
            const now = Date.now();
            patch(id, (s) => ({ ...applyUiEvent(s, event, now), lastSeq }));
          });
        } catch {
          /* connection dropped mid-stream: the loop resumes the same turn */
        }
      }
      if (!finished) patch(id, (s) => ({ ...s, status: "idle", turnId: null, stage: null, notice: null, error: { code: "STREAM_LOST", message: "", retryable: true } }));
    },
    [siteId, patch],
  );

  const setDraft = useCallback((text: string) => siteId && patch(siteId, (s) => ({ ...s, draft: text })), [siteId, patch]);
  const setComposerFocused = useCallback((focused: boolean) => siteId && patch(siteId, (s) => (s.composerFocused === focused ? s : { ...s, composerFocused: focused })), [siteId, patch]);
  const saveScroll = useCallback((top: number | null) => siteId && patch(siteId, (s) => (s.scrollTop === top ? s : { ...s, scrollTop: top })), [siteId, patch]);
  const dismissApproval = useCallback(() => siteId && patch(siteId, (s) => ({ ...s, approval: null })), [siteId, patch]);
  const dismissCredential = useCallback(() => siteId && patch(siteId, (s) => ({ ...s, credential: null })), [siteId, patch]);
  const applyEvents = useCallback((events: UiEvent[]) => siteId && patch(siteId, (s) => applyUiEvents(s, events, Date.now())), [siteId, patch]);
  const bindSite = useCallback((id: string | null) => setBoundSiteId(id), []);

  const chat = (siteId && chats[siteId]) || EMPTY_CHAT;
  const value = useMemo<AssistantApi>(
    () => ({ sites, siteId, site, environment, aiEnabled, locale, bindSite, open, presentation, width, setOpen, toggle, setWidth, composerRef, focusComposer, mode, setMode, chat, load, send, setDraft, setComposerFocused, saveScroll, dismissApproval, dismissCredential, applyEvents }),
    [sites, siteId, site, environment, aiEnabled, locale, bindSite, open, presentation, width, setOpen, toggle, setWidth, focusComposer, mode, chat, load, send, setDraft, setComposerFocused, saveScroll, dismissApproval, dismissCredential, applyEvents],
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
