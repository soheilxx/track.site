"use client";

import { ArrowDown, Bot, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Alert, Button, EmptyState, buttonVariants, cn } from "@track-site/ui";
import { useAssistant } from "./assistant-store";
import { UiCardView } from "./cards";
import { ApprovalCard, InputComponentView, SecureCredentialCard } from "./inputs";
import type { ChatMessage } from "./types";
import { WizardPanel } from "./wizard";

/** Messages rendered at once; older ones are folded behind "Show earlier" so long conversations never grow the DOM unbounded (supplement §9 ≈ 200). */
const WINDOW = 150;
const AT_BOTTOM_PX = 32;
const MAX_COMPOSER_LINES = 4;

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

/** Scrollable conversation: the only element of the panel that scrolls. Autoscroll only when the reader is at the end. */
export function AssistantMessages() {
  const t = useTranslations("chat");
  const ts = useTranslations("shell.assistant");
  const { chat, load, siteId, send, mode, aiEnabled, locale, saveScroll, dismissApproval, dismissCredential } = useAssistant();
  // the host keys this component by site id, so every site starts with a fresh window and scroll state
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [seenCount, setSeenCount] = useState(0);
  const [shown, setShown] = useState(WINDOW);

  useEffect(() => {
    load();
  }, [load, siteId]);

  // restore the saved scroll position when the list mounts (route change, panel reopened); otherwise start at the end
  const restored = useRef(false);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || restored.current || chat.loaded !== "ready") return;
    restored.current = true;
    if (chat.scrollTop !== null) el.scrollTop = chat.scrollTop;
    else el.scrollTop = el.scrollHeight;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX;
  }, [chat.loaded, chat.scrollTop]);

  const messageCount = chat.messages.length;
  const scrollToEnd = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setIsAtBottom(true);
    setSeenCount(messageCount);
  }, [messageCount]);

  // autoscroll (DOM only) when the reader is already at the end; otherwise the "new messages" hint is derived below
  const activityCount = chat.tools.length;
  useEffect(() => {
    const el = listRef.current;
    if (!el || !restored.current || !atBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messageCount, activityCount, chat.status, chat.approval, chat.credential, chat.error, chat.notice]);

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

  const visible = chat.messages.slice(-shown);
  const earlier = chat.messages.length - visible.length;
  return (
    <>
      <div ref={listRef} onScroll={onScroll} className="relative h-full space-y-4 overflow-y-auto overscroll-contain px-4 py-4" data-testid="assistant-messages" aria-busy={chat.loaded === "loading" || undefined}>
        {chat.loaded === "loading" ? <p className="text-xs text-ink-3">{ts("loading")}</p> : null}
        {earlier > 0 ? (
          <div className="text-center">
            <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + WINDOW)}>
              {ts("showEarlier", { n: earlier })}
            </Button>
          </div>
        ) : null}
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
        {visible.map((m) => (
          <MessageView key={m.id} message={m} siteId={siteId} onChoice={(_field, _values, label) => void send(label)} onSend={(text) => void send(text)} />
        ))}
        {chat.tools.length ? (
          <ul className="space-y-1 text-xs text-ink-3" aria-live="polite">
            {chat.tools.map((tl) => (
              <li key={tl.callId} className="flex items-center gap-2">
                {/* the status is never colour alone: the dot is decorative, the text names the state */}
                <span aria-hidden="true" className={cn("inline-block size-2 rounded-full", tl.status === "running" ? "animate-pulse bg-primary" : tl.status === "ok" ? "bg-ok" : "bg-bad")} />
                <span className="font-mono">{tl.name}</span>
                <span className={cn(tl.status === "error" ? "text-bad" : "text-ink-3")}>· {ts(`toolStatus.${tl.status}`)}</span>
                {tl.summary ? <span className="truncate">· {tl.summary}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {chat.status !== "idle" ? (
          <p className="text-xs text-ink-3" aria-live="polite">
            {chat.status === "thinking" ? t("thinking") : chat.status === "tools" ? t("working") : t("writing")}
          </p>
        ) : null}
        {chat.notice ? <Alert tone="warn">{chat.notice}</Alert> : null}
        {chat.error ? <Alert tone="bad">{chat.error}</Alert> : null}
        {chat.credential ? (
          <SecureCredentialCard
            request={chat.credential}
            siteId={siteId}
            onStored={(msg) => {
              dismissCredential();
              void send(msg);
            }}
          />
        ) : null}
        {chat.approval ? (
          <ApprovalCard
            approval={chat.approval}
            siteId={siteId}
            onDone={(msg) => {
              dismissApproval();
              void send(msg);
            }}
          />
        ) : null}
      </div>
      {hasNew ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button size="sm" variant="secondary" className="pointer-events-auto shadow-pop" onClick={scrollToEnd} leadingIcon={<ArrowDown className="size-4" aria-hidden="true" />}>
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
  const { chat, send, setDraft, composerRef, mode, siteId } = useAssistant();
  const lastUi = [...chat.messages].reverse().find((m) => m.ui)?.ui ?? null;
  const quickActions = lastUi?.quick_actions ?? [];
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
      {quickActions.length ? (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {quickActions.slice(0, 4).map((q) => (
            <Button key={q.id} size="sm" variant={q.kind === "primary" ? "primary" : "secondary"} onClick={() => void send(q.message)} disabled={busy}>
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

function MessageView({ message, siteId, onChoice, onSend }: { message: ChatMessage; siteId: string; onChoice: (field: string, values: string[], label: string) => void; onSend: (text: string) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm text-on-primary">{message.content}</p>
      </div>
    );
  }
  const ui = message.ui;
  return (
    <div className="flex gap-3">
      <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Bot className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="whitespace-pre-line text-sm text-ink">{message.content}</p>
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
        {ui ? <InputComponentView component={ui.input_component} onSend={onSend} siteId={siteId} onCredentialStored={onSend} /> : null}
        {ui?.next_best_action ? <p className="text-xs text-ink-3">{ui.next_best_action}</p> : null}
      </div>
    </div>
  );
}
