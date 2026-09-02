"use client";

import { Bot, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantUiResponse } from "@track-site/ai";
import { Alert, Button, Textarea, cn } from "@track-site/ui";
import { UiCardView } from "./cards";
import { ApprovalCard, InputComponentView, SecureCredentialCard } from "./inputs";
import { readSse, type ChatMessage, type ChatStatus, type CredentialRequestView, type PendingApprovalView, type ToolActivity } from "./types";
import { WizardPanel } from "./wizard";

const STEPS = ["site", "business_type", "platform", "installation", "consent", "destinations", "event_plan", "test", "review", "publish", "health"];

/**
 * Chat-first setup. The window is large and central while onboarding starts, docks to the side
 * when a side panel (installation, destinations, debugger) is relevant and shrinks to a panel
 * after publishing. Motion uses transform/opacity only and respects reduced motion (global CSS).
 */
export function SetupChat({ siteId, aiEnabled, locale, initialStep }: { siteId: string; aiEnabled: boolean; locale: string; initialStep: string }) {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [approval, setApproval] = useState<PendingApprovalView | null>(null);
  const [credential, setCredential] = useState<CredentialRequestView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"chat" | "wizard">(aiEnabled ? "chat" : "wizard");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastUi = [...messages].reverse().find((m) => m.ui)?.ui ?? null;
  const step = lastUi?.current_step ?? initialStep;
  const layout = step === "installation" || step === "destinations" || step === "test" ? "docked" : step === "health" ? "panel" : "center";

  useEffect(() => {
    fetch(`/api/ai/chat?siteId=${siteId}`)
      .then((r) => r.json())
      .then((b: { ok: boolean; messages?: ChatMessage[]; aiEnabled?: boolean }) => {
        if (b.ok && b.messages) setMessages(b.messages.filter((m) => m.role === "user" || m.role === "assistant"));
      })
      .catch(() => setError(t("loadFailed")));
  }, [siteId, t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, tools, status]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status !== "idle") return;
      setError(null);
      setNotice(null);
      setApproval(null);
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: trimmed, ui: null, createdAt: new Date().toISOString() }]);
      setStatus("thinking");
      setTools([]);
      try {
        const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, message: trimmed }) });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
          setError(body.code === "NOT_CONNECTED" ? t("notConfigured") : (body.message ?? t("failed")));
          if (body.code === "NOT_CONNECTED") setMode("wizard");
          setStatus("idle");
          return;
        }
        await readSse(res, (e) => {
          switch (e.type) {
            case "assistant.progress":
              setStatus(e.phase === "tools" ? "tools" : e.phase === "streaming" ? "streaming" : "thinking");
              break;
            case "tool.started":
              setTools((tl) => [...tl, { callId: String(e.callId), name: String(e.name), status: "running", summary: null }]);
              break;
            case "tool.completed":
              setTools((tl) => tl.map((x) => (x.callId === e.callId ? { ...x, status: e.ok ? "ok" : "error", summary: String(e.summary ?? "") } : x)));
              break;
            case "ui.final": {
              const ui = e.ui as AssistantUiResponse;
              setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: ui.message, ui, createdAt: new Date().toISOString() }]);
              break;
            }
            case "ui.approval":
              setApproval({ approvalId: String(e.approvalId), action: String(e.action), summary: (e.summary as PendingApprovalView["summary"]) ?? {}, expiresAt: String(e.expiresAt) });
              break;
            case "ui.credential":
              setCredential(e.component as CredentialRequestView);
              break;
            case "dlp.notice":
              setNotice(String(e.message));
              break;
            case "error":
              setError(String(e.message));
              break;
            default:
              break;
          }
        });
      } catch {
        setError(t("failed"));
      } finally {
        setStatus("idle");
      }
    },
    [siteId, status, t],
  );

  const quickActions = lastUi?.quick_actions ?? [];
  const progress = lastUi?.progress_percent ?? Math.round((STEPS.indexOf(initialStep) / (STEPS.length - 1)) * 100);

  return (
    <div className={cn("grid gap-4 transition-[grid-template-columns] duration-300 motion-reduce:transition-none", layout === "docked" ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "lg:grid-cols-1")}>
      <section aria-label={t("title")} className={cn("card flex min-h-[70vh] flex-col will-change-transform", layout === "center" && "mx-auto w-full max-w-3xl")}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{t("title")}</p>
              <p className="text-xs text-ink-3">
                {t("step")}: <span className="font-medium text-ink">{lastUi?.current_step ?? initialStep}</span> · {progress}%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-surface-2 sm:block" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `translateX(${progress - 100}%)`, width: "100%" }} />
            </div>
            <Button size="sm" variant="ghost" onClick={() => setMode((m) => (m === "chat" ? "wizard" : "chat"))} disabled={!aiEnabled}>
              {mode === "chat" ? t("expertMode") : t("chatMode")}
            </Button>
          </div>
        </header>

        {mode === "wizard" ? (
          <WizardPanel siteId={siteId} locale={locale} aiEnabled={aiEnabled} />
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="mx-auto max-w-md py-10 text-center">
                  <Bot className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
                  <p className="mt-3 font-display text-xl font-semibold text-ink">{t("emptyTitle")}</p>
                  <p className="mt-2 text-sm text-ink-2">{t("emptyText")}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {(t.raw("starters") as string[]).map((s) => (
                      <Button key={s} size="sm" variant="secondary" onClick={() => send(s)}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {messages.map((m) => (
                <MessageView key={m.id} message={m} siteId={siteId} onChoice={(_field, _values, label) => send(label)} onSend={send} />
              ))}
              {tools.length ? (
                <ul className="space-y-1 text-xs text-ink-3" aria-live="polite">
                  {tools.map((tl) => (
                    <li key={tl.callId} className="flex items-center gap-2">
                      <span className={cn("inline-block h-2 w-2 rounded-full", tl.status === "running" ? "animate-pulse bg-primary" : tl.status === "ok" ? "bg-ok" : "bg-bad")} />
                      <span className="font-mono">{tl.name}</span>
                      {tl.summary ? <span className="truncate">· {tl.summary}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {status !== "idle" ? (
                <p className="text-xs text-ink-3" aria-live="polite">
                  {status === "thinking" ? t("thinking") : status === "tools" ? t("working") : t("writing")}
                </p>
              ) : null}
              {notice ? <Alert tone="warn">{notice}</Alert> : null}
              {error ? <Alert tone="bad">{error}</Alert> : null}
              {credential ? <SecureCredentialCard request={credential} siteId={siteId} onStored={(msg) => { setCredential(null); send(msg); }} /> : null}
              {approval ? <ApprovalCard approval={approval} siteId={siteId} onDone={(msg) => { setApproval(null); send(msg); }} /> : null}
              <div ref={bottomRef} />
            </div>
            {quickActions.length ? (
              <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2">
                {quickActions.slice(0, 4).map((q) => (
                  <Button key={q.id} size="sm" variant={q.kind === "primary" ? "primary" : "secondary"} onClick={() => send(q.message)} disabled={status !== "idle"}>
                    {q.label}
                  </Button>
                ))}
              </div>
            ) : null}
            <form
              className="flex items-end gap-2 border-t border-line px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
                setDraft("");
              }}
            >
              <label htmlFor="chat-input" className="sr-only">
                {t("inputLabel")}
              </label>
              <Textarea
                id="chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                    setDraft("");
                  }
                }}
                placeholder={t("placeholder")}
                className="min-h-11 max-h-40 flex-1 resize-y"
                rows={1}
                maxLength={4000}
                disabled={status !== "idle"}
              />
              <Button type="submit" size="icon" aria-label={t("send")} disabled={status !== "idle" || !draft.trim()}>
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </>
        )}
      </section>
      {layout === "docked" ? (
        <aside className="card p-4 lg:sticky lg:top-6 lg:self-start" aria-label={t("sidePanel")}>
          <p className="text-sm font-semibold text-ink">{t("sidePanelTitle", { step: step })}</p>
          <p className="mt-1 text-sm text-ink-3">{t("sidePanelText")}</p>
          <a href={`/app/debugger?site=${siteId}`} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            {t("openDebugger")}
          </a>
        </aside>
      ) : null}
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
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Bot className="h-4 w-4" aria-hidden="true" />
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
