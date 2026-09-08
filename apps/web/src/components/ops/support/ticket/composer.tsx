"use client";

import { ChevronDown, Lock, Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SupportMacroActions } from "@track-site/db";
import { Alert, Badge, Button, Checkbox, Field, Kbd, Select, Textarea, cn } from "@track-site/ui";
import { composeTicketMessageAction, finalizeTicketMessageAction, type ComposeResult, type FinalizeResult, type TicketActionError } from "@/server/ops/actions/support-ticket";
import type { MacroView } from "@/server/support/ticket";
import { COMPOSER_MAX_CHARS, COMPOSER_MIN_CHARS, TICKET_SHORTCUT_EVENT, TICKET_TYPING_EVENT, type ComposerStatus, type TicketShortcutAction } from "./constants";
import { formatBytes } from "./format";
import { errorLabel, uploadErrorLabel } from "./labels";
import { markdownToHtml } from "./markdown";
import { applyPlaceholders, unresolvedPlaceholders, type PlaceholderValues } from "./placeholders";

export interface ComposerAttachmentLimits {
  maxFiles: number;
  maxBytes: number;
  /** allow-listed MIME types (docs/18 §"Attachments") */
  allowedTypes: string[];
}

export interface ComposerProps {
  ticketId: string;
  placeholders: PlaceholderValues;
  macros: MacroView[];
  /** statuses the split button may set from the current status (already filtered by the workflow) */
  statuses: ComposerStatus[];
  /** why composing is blocked (spam, merged) or null */
  blocked: "spam" | "merged" | null;
  limits: ComposerAttachmentLimits;
  from: { name: string; address: string };
  locale: string;
}

type Mode = "reply" | "note";

interface Outcome {
  ok: boolean;
  error: TicketActionError | null;
  sent: boolean;
  transport: string | null;
  uploadErrors: string[];
  note: boolean;
}

function macroActionChips(actions: SupportMacroActions, tv: (key: string) => string, t: (key: string, values?: Record<string, string | number>) => string): string[] {
  const chips: string[] = [];
  if (actions.status) chips.push(t("composer.macroAction.status", { status: tv(`status.${actions.status}`) }));
  if (actions.priority) chips.push(t("composer.macroAction.priority", { priority: tv(`priority.${actions.priority}`) }));
  if (actions.tags_add?.length) chips.push(t("composer.macroAction.tagsAdd", { tags: actions.tags_add.join(", ") }));
  if (actions.tags_remove?.length) chips.push(t("composer.macroAction.tagsRemove", { tags: actions.tags_remove.join(", ") }));
  if (actions.assign_to_self) chips.push(t("composer.macroAction.assignSelf"));
  return chips;
}

/**
 * Reply / internal-note composer: Markdown subset with preview, macro picker with placeholder substitution
 * (the text lands in the editor, so the operator sees what goes out), attachments (count, size and type
 * checked here and again by the upload route), the "send & set status" split button (a real menu: arrow
 * keys, Escape, focus return) and the note mode with its own styling. Sending is two-phase when files are
 * attached (store → upload → send); the outcome — transport, failures, refused uploads — is announced.
 */
export function Composer({ ticketId, placeholders, macros, statuses, blocked, limits, from, locale }: ComposerProps) {
  const t = useTranslations("supportTicket");
  const tv = useTranslations("support");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const bodyId = useId();
  // the design-system Textarea spreads its props onto the element; focusing goes through the id (no ref prop in its type)
  const focusBody = useCallback(() => document.getElementById(bodyId)?.focus(), [bodyId]);
  const [mode, setMode] = useState<Mode>("reply");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [macroId, setMacroId] = useState("");
  const [usedMacro, setUsedMacro] = useState<MacroView | null>(null);
  const [applyActions, setApplyActions] = useState(true);
  const [preview, setPreview] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  // keyboard shortcuts (r / n) from the page-level listener
  useEffect(() => {
    const onShortcut = (event: Event) => {
      const action = (event as CustomEvent<TicketShortcutAction>).detail;
      if (action !== "reply" && action !== "note") return;
      setMode(action);
      setPreview(false);
      focusBody();
    };
    window.addEventListener(TICKET_SHORTCUT_EVENT, onShortcut);
    return () => window.removeEventListener(TICKET_SHORTCUT_EVENT, onShortcut);
  }, [focusBody]);

  // close the split-button menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !menuButtonRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  const length = body.trim().length;
  const valid = length >= COMPOSER_MIN_CHARS && length <= COMPOSER_MAX_CHARS && !fileError;
  const note = mode === "note";
  const selectedMacro = macros.find((m) => m.id === macroId) ?? null;
  const unresolved = unresolvedPlaceholders(body);

  const onBodyChange = (value: string) => {
    setBody(value);
    if (!value.trim()) setUsedMacro(null);
    window.dispatchEvent(new CustomEvent(TICKET_TYPING_EVENT));
  };

  const insertMacro = () => {
    if (!selectedMacro) return;
    const text = applyPlaceholders(selectedMacro.bodyText, placeholders);
    setBody((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n\n${text}` : text));
    setUsedMacro(selectedMacro);
    setApplyActions(true);
    setPreview(false);
    window.dispatchEvent(new CustomEvent(TICKET_TYPING_EVENT));
    focusBody();
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files];
    let error: string | null = null;
    for (const file of Array.from(incoming)) {
      const type = (file.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
      if (next.length >= limits.maxFiles) {
        error = t("composer.fileTooMany", { max: limits.maxFiles });
        break;
      }
      if (file.size > limits.maxBytes) {
        error = t("composer.fileTooLarge", { name: file.name, max: formatBytes(limits.maxBytes, locale) });
        continue;
      }
      if (!limits.allowedTypes.includes(type)) {
        error = t("composer.fileType", { name: file.name });
        continue;
      }
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    }
    setFiles(next);
    setFileError(error);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = (status: ComposerStatus | null) => {
    setMenuOpen(false);
    if (!valid || pending) return;
    startTransition(async () => {
      const attachments = files.map((f) => ({ fileName: f.name, contentType: (f.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase(), sizeBytes: f.size }));
      let first: ComposeResult;
      try {
        first = await composeTicketMessageAction({ ticketId, mode, body, status, macroId: usedMacro?.id ?? null, applyMacroActions: applyActions, attachments });
      } catch {
        first = { ok: false, error: "generic", messageId: null, pendingUpload: false, sent: false, transport: null };
      }
      if (!first.ok || !first.messageId) {
        const detail = first.fieldErrors?.attachments;
        setOutcome({ ok: false, error: first.error ?? "generic", sent: false, transport: null, uploadErrors: detail ? [uploadErrorLabel(t, detail)] : [], note });
        return;
      }
      const uploadErrors: string[] = [];
      let sent: boolean = first.sent;
      let transport: string | null = first.transport;
      let ok: boolean = first.ok;
      let error: TicketActionError | null = first.error;
      if (first.pendingUpload) {
        for (const file of files) {
          const form = new FormData();
          form.set("message", first.messageId);
          form.set("file", file, file.name);
          try {
            const response = await fetch("/api/support/attachments", { method: "POST", body: form, credentials: "same-origin" });
            if (!response.ok) {
              const json = (await response.json().catch(() => ({}))) as { code?: string };
              uploadErrors.push(`${file.name}: ${uploadErrorLabel(t, json.code ?? null)}`);
            }
          } catch {
            uploadErrors.push(`${file.name}: ${uploadErrorLabel(t, "network")}`);
          }
        }
        if (uploadErrors.length) {
          // a file was refused or lost: the reply stays queued (stored, not sent) with "send now" in the timeline,
          // so the customer never receives "screenshot attached" without the screenshot
          ok = true;
          error = null;
          sent = false;
          transport = null;
        } else {
          let fin: FinalizeResult;
          try {
            fin = await finalizeTicketMessageAction({ messageId: first.messageId });
          } catch {
            fin = { ok: false, error: "generic", sent: false, transport: null };
          }
          ok = fin.ok;
          error = fin.error;
          sent = fin.sent;
          transport = fin.transport;
        }
      }
      setOutcome({ ok, error, sent, transport, uploadErrors, note });
      if (ok) {
        setBody("");
        setFiles([]);
        setFileError(null);
        setUsedMacro(null);
        setMacroId("");
        setPreview(false);
      }
      router.refresh();
    });
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const index = items.findIndex((el) => el === document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    }
  };

  if (blocked) {
    return (
      <section aria-labelledby="ticket-composer-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-composer-blocked">
        <h2 id="ticket-composer-title" className="text-base font-semibold text-ink">
          {t("composer.title")}
        </h2>
        <Alert tone="warn" className="mt-3">
          {blocked === "spam" ? t("composer.blockedSpam") : t("composer.blockedMerged")}
        </Alert>
      </section>
    );
  }

  const sendLabel = note ? t("composer.addNote") : t("composer.sendReply");
  return (
    <section
      aria-labelledby="ticket-composer-title"
      className={cn("rounded-[var(--radius-card)] border p-4 transition-colors duration-[var(--motion-base)] ease-in-out sm:p-5", note ? "border-warn/40 bg-warn-soft" : "border-line bg-surface")}
      data-testid="ticket-composer"
      data-mode={mode}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ticket-composer-title" className="text-base font-semibold text-ink">
          {t("composer.title")}
        </h2>
        <div role="group" aria-label={t("composer.modeLabel")} className="flex rounded-[var(--radius-control)] bg-surface-2 p-1">
          {(["reply", "note"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                focusBody();
              }}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control-sm)] px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
                mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
              data-testid={`ticket-composer-mode-${m}`}
            >
              {m === "note" ? <Lock className="size-3.5" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
              {m === "reply" ? t("composer.modeReply") : t("composer.modeNote")}
              <Kbd className="ml-1 hidden sm:inline-block">{m === "reply" ? "r" : "n"}</Kbd>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {note ? t("composer.noteIntro") : t("composer.replyIntro", { from: `${from.name} <${from.address}>`, to: placeholders.requesterEmail })}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label={t("composer.macroLabel")} hint={macros.length ? undefined : t("composer.macroNone")}>
          {(props) => (
            <Select {...props} value={macroId} onChange={(e) => setMacroId(e.target.value)} disabled={!macros.length} data-testid="ticket-macro-select">
              <option value="">{t("composer.macroPlaceholder")}</option>
              {macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.scope === "personal" ? ` (${tv("macroScope.personal")})` : ""}
                  {m.category ? ` · ${m.category}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="button" variant="secondary" disabled={!selectedMacro} onClick={insertMacro} data-testid="ticket-macro-insert">
          {t("composer.macroInsert")}
        </Button>
      </div>
      {usedMacro && macroActionChips(usedMacro.actions, tv, t).length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Checkbox checked={applyActions} onChange={(e) => setApplyActions(e.target.checked)} label={t("composer.macroApply", { name: usedMacro.name })} data-testid="ticket-macro-apply" />
          {macroActionChips(usedMacro.actions, tv, t).map((chip) => (
            <Badge key={chip} tone="neutral">
              {chip}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink" id="ticket-body-label">
            {note ? t("composer.noteBody") : t("composer.replyBody")}
          </span>
          <Button type="button" variant="ghost" size="sm" aria-pressed={preview} onClick={() => setPreview((p) => !p)} disabled={!length} data-testid="ticket-preview-toggle">
            {preview ? t("composer.edit") : t("composer.preview")}
          </Button>
        </div>
        {preview ? (
          <div
            className="min-h-40 rounded-[var(--radius-control)] border border-line bg-surface p-3 text-sm text-ink [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-2 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5"
            aria-labelledby="ticket-body-label"
            data-testid="ticket-preview"
            // the converter escapes everything and limits link schemes; the server sanitises again before storing
            dangerouslySetInnerHTML={{ __html: markdownToHtml(body) }}
          />
        ) : (
          <Textarea
            id={bodyId}
            aria-labelledby="ticket-body-label"
            aria-describedby="ticket-body-hint"
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                submit(null);
              }
            }}
            rows={8}
            maxLength={COMPOSER_MAX_CHARS}
            required
            className={cn(note && "border-warn/40")}
            data-testid="ticket-body"
          />
        )}
        <p id="ticket-body-hint" className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-ink-3">
          <span>{t("composer.markdownHint")}</span>
          <span className="tabular-nums">
            {length} / {COMPOSER_MAX_CHARS}
          </span>
        </p>
        {unresolved.length ? <p className="mt-1 text-xs text-warn">{t("composer.unresolved", { names: unresolved.join(", ") })}</p> : null}
      </div>

      <div className="mt-3">
        <label className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-2 bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary pointer-coarse:min-h-11")}>
          <Paperclip className="size-4" aria-hidden="true" />
          {t("composer.attach")}
          <input ref={fileInputRef} type="file" multiple accept={limits.allowedTypes.join(",")} className="sr-only" onChange={(e) => addFiles(e.target.files)} data-testid="ticket-attachments-input" />
        </label>
        <span className="ml-2 text-xs text-ink-3">{t("composer.attachHint", { max: limits.maxFiles, size: formatBytes(limits.maxBytes, locale) })}</span>
        {files.length ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("composer.attachedFiles")}>
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] bg-surface-2 py-1 pr-1 pl-3 text-xs text-ink">
                <span className="max-w-48 truncate">{f.name}</span>
                <span className="text-ink-3">{formatBytes(f.size, locale)}</span>
                <button type="button" onClick={() => setFiles((list) => list.filter((x) => x !== f))} aria-label={t("composer.removeFile", { name: f.name })} className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:size-11">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {fileError ? (
          <p className="mt-1 text-xs text-bad" role="alert">
            {fileError}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative inline-flex">
          <Button type="button" variant={note ? "secondary" : "primary"} className="rounded-r-none" disabled={!valid} loading={pending} loadingLabel={t("common.working")} onClick={() => submit(null)} data-testid="ticket-submit">
            {note ? <Lock className="size-4" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {sendLabel}
          </Button>
          <button
            ref={menuButtonRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={t("composer.moreOptions")}
            disabled={!valid || pending || !statuses.length}
            onClick={() => setMenuOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMenuOpen(true);
              }
            }}
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-r-[var(--radius-control)] border-l border-white/20 px-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11",
              note ? "border border-l-0 border-line-2 bg-surface text-ink hover:bg-surface-2" : "bg-primary text-on-primary hover:bg-primary-strong",
            )}
            data-testid="ticket-submit-menu"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div ref={menuRef} id={menuId} role="menu" aria-label={t("composer.moreOptions")} onKeyDown={onMenuKeyDown} className="absolute top-full left-0 z-20 mt-1 min-w-56 rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-pop">
              {statuses.map((status) => (
                <button key={status} type="button" role="menuitem" tabIndex={-1} onClick={() => submit(status)} className="flex min-h-10 w-full items-center rounded-[var(--radius-control-sm)] px-3 text-left text-sm text-ink hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none pointer-coarse:min-h-11" data-testid={`ticket-submit-${status}`}>
                  {note ? t("composer.noteAndSet", { status: tv(`status.${status}`) }) : t("composer.sendAndSet", { status: tv(`status.${status}`) })}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="text-xs text-ink-3">
          <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> {t("composer.shortcutSend")}
        </span>
      </div>

      <div role="status" aria-live="polite" className="mt-3 space-y-2">
        {outcome?.ok ? (
          <Alert tone="ok">
            {outcome.note ? t("composer.noteAdded") : outcome.sent ? (outcome.transport === "file" ? t("composer.sentFile") : t("composer.sent", { transport: outcome.transport ?? "" })) : t("composer.stored")}
          </Alert>
        ) : null}
        {outcome && !outcome.ok ? <Alert tone="bad">{errorLabel(t, outcome.error)}</Alert> : null}
        {outcome?.uploadErrors.length ? (
          <Alert tone="warn" title={t("upload.someRefused")}>
            <ul className="list-disc pl-4">
              {outcome.uploadErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {pending ? t("common.working") : ""}
      </span>
    </section>
  );
}
