"use client";

import { AlertTriangle, ArrowDown, Bot, Check, Loader2, Lock, Send, ShieldCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Alert, Button, EmptyState, buttonVariants, cn } from "@track-site/ui";
import { useAssistant } from "./assistant-store";
import { UiCardView } from "./cards";
import { revealTarget } from "./focus-target";
import { ApprovalCard, InputComponentView, SecureCredentialCard } from "./inputs";
import { nextActionFor, type NextAction } from "./next-action";
import type { ActivityView, ChatError, ChatMessage } from "./types";
import { ESTIMATED_ITEM_HEIGHT, VIRTUALIZE_FROM, anchorDelta, layoutItems, visibleRange } from "./virtual-list";
import { WizardPanel } from "./wizard";

const AT_BOTTOM_PX = 32;
const MAX_COMPOSER_LINES = 4;
/** Activity sentences shown in the panel's feed; earlier completed checks fold into a count (the feed never scrolls). */
const FEED_VISIBLE = 4;
/** Off-topic and other refusals offer at most three allowed quick actions (supplement §9), every other answer at most four. */
const QUICK_ACTIONS_MAX = 4;
const QUICK_ACTIONS_REFUSAL_MAX = 3;

type Translate = ReturnType<typeof useTranslations<"assistant">>;

/** Localized activity sentence for one real tool run / job state (`assistant.activity.<kind>.<phase>`), with safe params only. */
export function activityText(t: Translate, a: ActivityView): string {
  const key = `activity.${a.sentence}`;
  const reason = a.params.reason && t.has(`reason.${a.params.reason}`) ? t(`reason.${a.params.reason}`) : a.params.reason ? t("reason.UNKNOWN") : "";
  if (!t.has(key)) return t(a.phase === "started" ? "activity.generic.started" : a.phase === "completed" ? "activity.generic.completed" : a.phase === "blocked" ? "activity.generic.blocked" : "activity.generic.failed", { missing: "", reason });
  return t(key, { missing: (a.params.missing ?? []).join(", "), reason });
}

/** Errors are shown by code from the namespace; the server's English text is only a fallback for codes without a translation. */
export function errorText(t: Translate, error: ChatError): string {
  if (t.has(`error.${error.code}`)) return t(`error.${error.code}`);
  return error.message || t("error.FAILED");
}

export const isRefusal = (message: ChatMessage): boolean => message.role === "assistant" && (message.ui?.intent === "off_topic" || message.ui?.intent === "refusal");

/** Site + environment the assistant works on, with a visible confirmation whenever the context changes. */
export function AssistantContextLine() {
  const t = useTranslations("shell.assistant");
  const tEnv = useTranslations("shell.environment");
  const { site, environment, siteId } = useAssistant();
  // derived "context switched" notice: adjust state during render when the site changes, clear it from a timer callback
  const [seenSiteId, setSeenSiteId] = useState(siteId);
  const [switchCount, setSwitchCount] = useState(0);
  const [clearedCount, setClearedCount] = useState(0);
  if (seenSiteId !== siteId) {
    setSeenSiteId(siteId);
    setSwitchCount((n) => n + 1);
  }
  useEffect(() => {
    if (switchCount === clearedCount) return;
    const timer = setTimeout(() => setClearedCount(switchCount), 6000);
    return () => clearTimeout(timer);
  }, [switchCount, clearedCount]);
  const switched = switchCount > clearedCount && site ? t("contextSwitched", { site: site.name }) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="assistant-context">
      {site ? (
        <>
          <span className="truncate">
            {t("context", { site: site.name })} <span className="font-mono text-ink-3">{site.trackingId}</span>
          </span>
          {environment ? <span className="text-ink-3">{t("environment", { environment: tEnv(`kind.${environment.kind}`) })}</span> : null}
        </>
      ) : (
        <span className="text-ink-3">{t("noSite")}</span>
      )}
      <span role="status" aria-live="polite" className={cn("text-primary", !switched && "sr-only")}>
        {switched ?? ""}
      </span>
    </div>
  );
}

/** Header action: chat ↔ expert (rule-based wizard) — the wizard is the fallback when the AI provider is not configured. */
export function AssistantModeToggle() {
  const t = useTranslations("shell.assistant");
  const { mode, setMode, aiEnabled, siteId } = useAssistant();
  if (!siteId) return null;
  return (
    <Button size="sm" variant="ghost" onClick={() => setMode(mode === "chat" ? "wizard" : "chat")} disabled={!aiEnabled} aria-pressed={mode === "wizard"}>
      {mode === "chat" ? t("expertMode") : t("chatMode")}
    </Button>
  );
}

function lastUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === "user") return messages[i]!.content;
  return null;
}

function lastAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === "assistant") return messages[i]!;
  return null;
}

/** Last entry the polite announcer reads out: an answer of Track AI or a system note of the panel (card outcome). */
function lastAnnounceable(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === "assistant" || messages[i]!.role === "system") return messages[i]!;
  return null;
}

/** The next step under a blocked/failed sentence: a page, a card already in the panel, a retry or a question — never a percentage. */
function NextActionControl({ action, busy, retryText, onSend }: { action: NextAction; busy: boolean; retryText: string | null; onSend: (text: string) => void }) {
  const t = useTranslations("assistant.nextAction");
  const cls = "mt-0.5 inline-flex min-h-6 items-center text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";
  switch (action.kind) {
    case "link":
      return (
        <Link href={action.href} className={cls} data-next-action={action.label}>
          {t(action.label)}
        </Link>
      );
    case "reveal":
      return (
        <button type="button" className={cls} onClick={() => revealTarget(action.target)} data-next-action={action.label}>
          {t(action.label)}
        </button>
      );
    case "retry":
      return (
        <button type="button" className={cls} disabled={busy || !retryText} onClick={() => retryText && onSend(retryText)} data-next-action={action.label}>
          {t("retry")}
        </button>
      );
    case "ask":
      return (
        <button type="button" className={cls} disabled={busy} onClick={() => onSend(t("askMissingMessage"))} data-next-action={action.label}>
          {t("askMissing")}
        </button>
      );
  }
}

/**
 * Activity feed of the panel (supplement §9 "Keine sichtbaren internen Gedankengänge"): the
 * localized sentences of the current turn, one per real tool run (`data-run-id`), with the icon and
 * text carrying the state — started, completed, blocked, failed — never a percentage. Blocked and
 * failed runs name what is missing (safe server identifiers) and offer the next action. The live
 * region is always present so that new sentences are announced politely; it collapses to zero
 * height while there is nothing to show and never scrolls (only the message list does).
 */
export function AssistantActivityFeed() {
  const t = useTranslations("assistant");
  const { chat, siteId, mode, send } = useAssistant();
  const items = siteId && mode === "chat" ? chat.activities : [];
  const visible = items.slice(-FEED_VISIBLE);
  const earlier = items.length - visible.length;
  const busy = chat.status !== "idle";
  const retryText = lastUserMessage(chat.messages);
  const pending = { credential: chat.credential !== null, approval: chat.approval !== null };
  return (
    <div role="log" aria-live="polite" aria-label={t("activityRegion")} className={cn(visible.length ? "border-b border-line px-4 py-2 text-xs text-ink-2" : "h-0 overflow-hidden")} data-testid="assistant-activity" data-count={items.length}>
      {visible.length ? (
        <ul className="space-y-1.5">
          {earlier > 0 ? (
            <li className="text-ink-3" data-testid="assistant-activity-earlier">
              {t("feed.earlier", { n: earlier })}
            </li>
          ) : null}
          {visible.map((a) => {
            const action = nextActionFor(a, pending);
            return (
              <li key={a.runId} id={`ai-run-${a.runId}`} data-run-id={a.runId} data-phase={a.phase} data-activity={a.activity} className={cn("flex items-start gap-2", a.phase === "failed" ? "text-bad" : a.phase === "blocked" ? "text-warn" : "text-ink-2")}>
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                  {a.phase === "started" ? <Loader2 className="size-3.5 animate-spin text-primary" data-motion="essential" /> : a.phase === "completed" ? <Check className="size-3.5 text-ok" /> : a.phase === "blocked" ? <AlertTriangle className="size-3.5" /> : <XCircle className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="sr-only">{t(`state.phase.${a.phase}`)}: </span>
                    {activityText(t, a)}
                  </p>
                  {action ? <NextActionControl action={action} busy={busy} retryText={retryText} onSend={(text) => void send(text)} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Scrollable conversation: the only element of the panel that scrolls. Autoscroll only when the
 * reader is at the end, otherwise the "Show new messages" pill. From `VIRTUALIZE_FROM` messages
 * the list is windowed: only the messages around the viewport are in the DOM, spacers hold the
 * measured heights of the rest, and a re-measured message above the viewport moves `scrollTop`
 * by the same amount so the reader's position never jumps. New assistant answers are announced
 * in a polite live region outside the scroll container.
 */
export function AssistantMessages() {
  const t = useTranslations("chat");
  const ts = useTranslations("shell.assistant");
  const ta = useTranslations("assistant");
  const { chat, load, siteId, send, mode, aiEnabled, locale, saveScroll, dismissApproval, dismissCredential, applyEvents, addNote } = useAssistant();
  // the host keys this component by site id, so every site starts with a fresh window and scroll state
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [seenCount, setSeenCount] = useState(0);

  // windowing state: measured heights per message id (state, read in render) and the viewport of the scroll container;
  // `measuredRef` mirrors the heights for the observer callback only (never touched in render)
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const measuredRef = useRef(new Map<string, number>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const [view, setView] = useState<{ top: number; height: number }>(() => ({ top: chat.scrollTop ?? Number.MAX_SAFE_INTEGER, height: 640 }));

  useEffect(() => {
    load();
  }, [load, siteId]);

  const syncView = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }));
  }, []);

  // restore the saved scroll position when the list mounts (route change, panel reopened); otherwise start at the end
  const restored = useRef(false);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || restored.current || chat.loaded !== "ready") return;
    restored.current = true;
    if (chat.scrollTop !== null) el.scrollTop = chat.scrollTop;
    else el.scrollTop = el.scrollHeight;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX;
    // a restored position away from the end starts without the pill and shows it only for messages that arrive afterwards
    setIsAtBottom(atBottom.current);
    setSeenCount(chat.messages.length);
    syncView();
  }, [chat.loaded, chat.scrollTop, chat.messages.length, syncView]);

  const messageCount = chat.messages.length;
  const virtual = messageCount >= VIRTUALIZE_FROM;
  const scrollToEnd = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setIsAtBottom(true);
    setSeenCount(messageCount);
    syncView();
  }, [messageCount, syncView]);

  // one ResizeObserver measures the rendered messages (and the container's viewport); created lazily, released on unmount.
  // A re-measured message that ends above the viewport moves `scrollTop` by its growth (DOM offsets, applied at once),
  // then the new heights reach the layout through state.
  const getObserver = useCallback(() => {
    if (observerRef.current || typeof ResizeObserver === "undefined") return observerRef.current;
    observerRef.current = new ResizeObserver((entries) => {
      const el = listRef.current;
      const updates: Array<[string, number]> = [];
      let delta = 0;
      let viewportChanged = false;
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (target === el) {
          viewportChanged = true;
          continue;
        }
        const id = target.dataset.messageId;
        if (!id) continue;
        const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? target.getBoundingClientRect().height);
        const previous = measuredRef.current.get(id);
        if (previous === height) continue;
        if (el) delta += anchorDelta(target.offsetTop, previous ?? ESTIMATED_ITEM_HEIGHT, height, el.scrollTop);
        measuredRef.current.set(id, height);
        updates.push([id, height]);
      }
      if (el && delta !== 0 && !atBottom.current) el.scrollTop += delta;
      if (updates.length)
        setHeights((prev) => {
          const next = new Map(prev);
          for (const [id, height] of updates) next.set(id, height);
          return next;
        });
      if (viewportChanged) syncView();
    });
    return observerRef.current;
  }, [syncView]);
  useEffect(() => () => observerRef.current?.disconnect(), []);
  useEffect(() => {
    const el = listRef.current;
    const observer = virtual ? getObserver() : null;
    if (!el || !observer) return;
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [virtual, getObserver]);
  const measure = useCallback(
    (el: HTMLDivElement | null) => {
      const observer = el ? getObserver() : null;
      if (!el || !observer) return;
      observer.observe(el);
      return () => observer.unobserve(el);
    },
    [getObserver],
  );

  // the scroll container shrinks when the on-screen keyboard opens (the sheet follows the visual viewport) or the panel
  // is resized: a reader at the end stays at the end, so the keyboard never hides the last message (supplement §9);
  // away from the end the reader's position is kept. DOM-only, no state per resize.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === height) return;
      height = el.clientHeight;
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      syncView();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncView]);

  // autoscroll (DOM only) when the reader is already at the end; otherwise the "new messages" hint is derived below
  const activityCount = chat.activities.length;
  useEffect(() => {
    const el = listRef.current;
    if (!el || !restored.current || !atBottom.current) return;
    el.scrollTop = el.scrollHeight;
    syncView();
  }, [messageCount, activityCount, heights, chat.status, chat.stage, chat.pending, chat.approval, chat.credential, chat.error, chat.notice, syncView]);

  // the exact diff arrives as the approval card at the end of the list: reveal and focus it once per approval
  // (never while the reader is typing — `revealTarget` leaves the focus in the composer)
  const approvalId = chat.approval?.approvalId ?? null;
  useEffect(() => {
    if (!approvalId) return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
      setIsAtBottom(true);
      syncView();
    }
    const frame = requestAnimationFrame(() => revealTarget("approval-card"));
    return () => cancelAnimationFrame(frame);
  }, [approvalId, syncView]);

  // polite announcement of every assistant answer (and every system note of the panel) that arrives after the conversation was loaded
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef<{ ready: boolean; id: string | null }>({ ready: false, id: null });
  useEffect(() => {
    if (chat.loaded !== "ready") return;
    const last = lastAnnounceable(chat.messages);
    if (!announced.current.ready) {
      announced.current = { ready: true, id: last?.id ?? null };
      return;
    }
    if (!last || last.id === announced.current.id) return;
    announced.current.id = last.id;
    setAnnouncement(last.role === "system" ? last.content.slice(0, 240) : ta("announce.newMessage", { text: last.content.slice(0, 240) }));
  }, [chat.loaded, chat.messages, ta]);

  // the scroll position is persisted in the layout-level store (debounced: one write per pause, not per tick)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX;
    atBottom.current = bottom;
    setIsAtBottom(bottom);
    if (bottom) setSeenCount(messageCount);
    if (virtual) syncView();
    const top = bottom ? null : el.scrollTop;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveScroll(top), 150);
  };
  const hasNew = !isAtBottom && messageCount > seenCount;

  if (!siteId) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <EmptyState
          title={ts("noSite")}
          action={
            <Link href="/app/onboarding" className={buttonVariants({ size: "sm" })}>
              {ts("noSiteAction")}
            </Link>
          }
        />
      </div>
    );
  }

  if (mode === "wizard") {
    return (
      <div className="h-full overflow-y-auto">
        <WizardPanel siteId={siteId} locale={locale} aiEnabled={aiEnabled} />
      </div>
    );
  }

  // window of messages to render: everything below the threshold, otherwise the measured range around the viewport
  const layout = virtual
    ? layoutItems(
        chat.messages.map((m) => m.id),
        heights,
      )
    : null;
  const range = layout ? visibleRange(layout, view.top, view.height) : { start: 0, end: messageCount };
  const topPad = layout ? layout.offsets[range.start]! : 0;
  const bottomPad = layout ? layout.total - layout.offsets[range.end]! : 0;
  const visible = chat.messages.slice(range.start, range.end);

  const stageText = chat.status === "idle" ? null : chat.status === "reconnecting" ? ta("stream.reconnecting") : chat.status === "sending" ? ta("stream.sending") : chat.stage && ta.has(`stage.${chat.stage}`) ? ta(`stage.${chat.stage}`) : chat.status === "streaming" ? ta("stage.answer_streaming") : ta("stage.model_request");
  const published = chat.activities.some((a) => a.activity === "publish" && a.phase === "completed");
  return (
    <>
      {/* the transcript scrolls on its own; as a named region with tabindex it stays reachable and scrollable by keyboard
          even when no message in view carries a control (WCAG 2.1.1, axe scrollable-region-focusable) */}
      <div ref={listRef} onScroll={onScroll} role="region" aria-label={ta("messagesRegion")} tabIndex={0} className="relative h-full overflow-y-auto overscroll-contain px-4 pt-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary" data-testid="assistant-messages" data-virtualized={virtual ? "true" : "false"} data-rendered={visible.length} data-total={messageCount} aria-busy={chat.loaded === "loading" || undefined}>
        {chat.loaded === "loading" ? <p className="pb-4 text-xs text-ink-3">{ts("loading")}</p> : null}
        {chat.loaded === "ready" && chat.messages.length === 0 ? (
          <div className="mx-auto max-w-md py-8 text-center">
            <Bot className="mx-auto size-8 text-primary" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-ink">{t("emptyTitle")}</p>
            <p className="mt-2 text-sm text-ink-2">{t("emptyText")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(t.raw("starters") as string[]).map((s) => (
                <Button key={s} size="sm" variant="secondary" onClick={() => void send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {topPad > 0 ? <div style={{ height: topPad }} aria-hidden="true" data-testid="assistant-spacer-top" /> : null}
        {visible.map((m) => (
          <div key={m.id} ref={virtual ? measure : undefined} data-message-id={m.id} className="pb-4">
            <MessageView message={m} siteId={siteId} busy={chat.status !== "idle"} onChoice={(_field, _values, label) => void send(label)} onSend={(text) => void send(text)} onNote={addNote} />
          </div>
        ))}
        {bottomPad > 0 ? <div style={{ height: bottomPad }} aria-hidden="true" data-testid="assistant-spacer-bottom" /> : null}
        <div className="space-y-4 pb-4">
          {chat.pending ? (
            <div className="flex gap-3" data-testid="assistant-pending">
              <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                <Bot className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="whitespace-pre-line text-sm text-ink">{chat.pending.text}</p>
                {chat.pending.cards.map((c, i) => (
                  <UiCardView key={i} card={c} />
                ))}
              </div>
            </div>
          ) : null}
          {stageText ? (
            <p className="text-xs text-ink-3" aria-live="polite" data-testid="assistant-stage">
              {stageText}
            </p>
          ) : null}
          {chat.notice ? <Alert tone="warn">{ta(`stream.${chat.notice}`)}</Alert> : null}
          {chat.error ? <Alert tone="bad">{errorText(ta, chat.error)}</Alert> : null}
          {published ? (
            <p className="text-xs text-ink-3">
              {ta("approval.rollbackHint")}{" "}
              <Link href="/app/releases" className="font-medium text-primary underline-offset-2 hover:underline">
                {ta("approval.openReleases")}
              </Link>
            </p>
          ) : null}
          {/* card outcomes become localized system notes of the transcript — never a message in the user's name; the assistant is only ever addressed by a click or typed text of the user */}
          {chat.credential ? (
            <SecureCredentialCard
              request={chat.credential}
              siteId={siteId}
              onStored={(message) => {
                dismissCredential();
                addNote(message, "credential");
              }}
            />
          ) : null}
          {chat.approval ? (
            <>
              <p className="text-xs text-warn" aria-live="polite">
                {ta("activity.confirmation.required")}
              </p>
              <ApprovalCard
                approval={chat.approval}
                siteId={siteId}
                onEvents={applyEvents}
                onDone={(message) => {
                  dismissApproval();
                  addNote(message, "approval");
                }}
              />
            </>
          ) : null}
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only" data-testid="assistant-announcer">
        {announcement}
      </div>
      {hasNew ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button size="sm" variant="secondary" className="pointer-events-auto shadow-pop" onClick={scrollToEnd} leadingIcon={<ArrowDown className="size-4" aria-hidden="true" />} data-testid="assistant-new-messages">
            {ts("newMessages")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Quick actions + composer: grows to four lines, then scrolls internally; Enter sends, Shift+Enter breaks the line. */
export function AssistantComposer() {
  const t = useTranslations("chat");
  const ts = useTranslations("shell.assistant");
  const ta = useTranslations("assistant");
  const { chat, send, setDraft, setComposerFocused, composerRef, mode, siteId } = useAssistant();
  const last = lastAssistantMessage(chat.messages);
  const lastUi = last?.ui ?? null;
  // a refusal offers at most three allowed quick actions, every other answer at most four
  const quickActions = (lastUi?.quick_actions ?? []).slice(0, last && isRefusal(last) ? QUICK_ACTIONS_REFUSAL_MAX : QUICK_ACTIONS_MAX);
  const busy = chat.status !== "idle";

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const max = lineHeight * MAX_COMPOSER_LINES + padding;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [chat.draft, composerRef]);

  if (!siteId || mode === "wizard") return null;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    void send(chat.draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="pb-safe">
      {chat.credential ? (
        <div className="flex items-center gap-2 px-4 pt-3 text-xs text-ink-2" data-testid="assistant-credential-entry">
          <Lock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">{ta("credential.waiting")}</span>
          <button type="button" className="shrink-0 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => revealTarget("credential-card")}>
            {ta("credential.open")}
          </button>
        </div>
      ) : null}
      {quickActions.length ? (
        <div className="flex flex-wrap gap-2 px-4 pt-3" data-testid="assistant-quick-actions">
          {quickActions.map((q) => (
            <Button key={q.id} size="sm" variant={q.kind === "primary" ? "primary" : "secondary"} onClick={() => void send(q.message)} disabled={busy} data-testid="assistant-quick-action">
              {q.label}
            </Button>
          ))}
        </div>
      ) : null}
      <form className="flex items-end gap-2 px-4 py-3" onSubmit={submit}>
        <label htmlFor="track-ai-composer" className="sr-only">
          {t("inputLabel")}
        </label>
        <textarea
          id="track-ai-composer"
          ref={composerRef}
          value={chat.draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          placeholder={t("placeholder")}
          className="min-h-11 w-full flex-1 resize-none rounded-[var(--radius-control)] border border-line-2 bg-surface px-3 py-2 text-sm leading-6 text-ink shadow-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-out placeholder:text-ink-3 hover:border-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60"
          rows={1}
          maxLength={4000}
          disabled={busy}
          aria-describedby="track-ai-composer-hint"
          data-testid="assistant-composer"
        />
        <Button type="submit" size="icon" aria-label={t("send")} disabled={busy || !chat.draft.trim()}>
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
      <p id="track-ai-composer-hint" className="sr-only">
        {ts("composerHint")}
      </p>
    </div>
  );
}

function MessageView({ message, siteId, busy, onChoice, onSend, onNote }: { message: ChatMessage; siteId: string; busy: boolean; onChoice: (field: string, values: string[], label: string) => void; onSend: (text: string) => void; onNote: (text: string, note: NonNullable<ChatMessage["note"]>) => void }) {
  const ta = useTranslations("assistant");
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm text-on-primary">{message.content}</p>
      </div>
    );
  }
  if (message.role === "system") {
    // outcome of a card the user operated: a note of the panel, visibly neither the user's words nor an answer of Track AI;
    // after a stored credential the conversation continues only on the user's click, with a visible, localized message
    return (
      <div className="flex justify-center" data-testid="assistant-system-note" data-note={message.note}>
        <div className="max-w-[85%] rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-center text-xs text-ink-2">
          <p className="whitespace-pre-line">{message.content}</p>
          {message.note === "credential" ? (
            <button type="button" className="mt-1 inline-flex min-h-6 items-center font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={busy} onClick={() => onSend(ta("note.continueMessage"))} data-testid="assistant-note-continue">
              {ta("cards.continue")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  const ui = message.ui;
  const refusal = isRefusal(message);
  return (
    <div className="flex gap-3">
      <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Bot className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {refusal ? (
          // off-topic / manipulation / secret intake: a short friendly refusal without any tool call, marked as in-scope guidance
          <div className="rounded-[var(--radius-card)] border border-violet-soft-2 bg-violet-soft/40 px-3 py-2" data-testid="assistant-scope-notice" data-intent={ui?.intent}>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {ta("scope.title")}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{message.content}</p>
          </div>
        ) : (
          <p className="whitespace-pre-line text-sm text-ink">{message.content}</p>
        )}
        {ui?.warnings?.length ? (
          <ul className="space-y-1">
            {ui.warnings.map((w) => (
              <li key={w} className="text-xs text-warn">
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        {ui?.cards.map((c, i) => (
          <UiCardView key={i} card={c} onChoice={onChoice} />
        ))}
        {ui ? <InputComponentView component={ui.input_component} onSend={onSend} siteId={siteId} onCredentialStored={(text) => onNote(text, "credential")} /> : null}
        {ui?.next_best_action ? <p className="text-xs text-ink-3">{ui.next_best_action}</p> : null}
      </div>
    </div>
  );
}
