"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea, buttonVariants } from "@track-site/ui";
import { createTicketAction, suggestKnowledgeAction, type SupportActionState } from "@/server/actions/support";
import type { KnowledgeSuggestion } from "@/server/support/portal";
import { AttachmentsInput } from "./attachments-input";
import { PORTAL_LIMITS, PORTAL_PRIORITIES, SUGGESTION_DEBOUNCE_MS, SUGGESTION_MIN_CHARS, SUPPORT_CATEGORIES } from "./constants";
import { ActionFeedback } from "./feedback";
import { KnowledgeSuggestions, type SuggestionStatus } from "./knowledge-suggestions";

const initial: SupportActionState = { ok: false, error: null, notice: null };

/**
 * New ticket: subject, category, suggested priority, message and attachments. While the customer types,
 * matching Tracking Knowledge articles are fetched through a server action (debounced, stale answers
 * dropped) — a nudge, never a gate: the ticket can always be opened. The server action redirects to the
 * ticket on success; errors come back as state.
 */
export function NewTicketForm({ requester, locale }: { requester: { name: string; email: string }; locale: string }) {
  const t = useTranslations("supportPortal");
  const tVocab = useTranslations("support");
  const [state, action, pending] = useActionState(createTicketAction, initial);
  const uid = useId();
  const id = (name: string) => `ticket-${name}-${uid}`;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [status, setStatus] = useState<SuggestionStatus>("idle");
  const requestSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the debounce timer must not outlive the form (navigation after the redirect)
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  /** Debounced lookup from the change handlers; a stale answer (older sequence) is dropped. */
  const scheduleSuggestions = (nextSubject: string, nextBody: string) => {
    const query = `${nextSubject} ${nextBody.slice(0, 400)}`.trim();
    if (timer.current) clearTimeout(timer.current);
    const seq = ++requestSeq.current;
    if (query.length < SUGGESTION_MIN_CHARS) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    setStatus("searching");
    timer.current = setTimeout(() => {
      suggestKnowledgeAction({ text: query })
        .then((items) => {
          if (seq !== requestSeq.current) return;
          setSuggestions(items);
          setStatus("done");
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setSuggestions([]);
          setStatus("done");
        });
    }, SUGGESTION_DEBOUNCE_MS);
  };

  const fieldError = (name: string, key: string, values?: Record<string, string | number>) => (state.fieldErrors?.[name] ? t(`errors.${key}`, values) : undefined);
  const limits = { min: PORTAL_LIMITS.subjectMin, max: PORTAL_LIMITS.subjectMax };
  const bodyLimits = { min: PORTAL_LIMITS.bodyMin, max: PORTAL_LIMITS.bodyMax };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form action={action} className="space-y-5 rounded-[var(--radius-card)] border border-line bg-surface p-5" aria-describedby={id("requester")}>
        {state.error ? <ActionFeedback state={state} locale={locale} /> : null}
        <Field id={id("subject")} label={t("form.subject")} hint={t("form.subjectHint", limits)} error={fieldError("subject", "subject", limits)} required>
          {(control) => (
            <Input
              {...control}
              name="subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                scheduleSuggestions(e.target.value, body);
              }}
              minLength={PORTAL_LIMITS.subjectMin}
              maxLength={PORTAL_LIMITS.subjectMax}
              autoComplete="off"
              data-testid="support-new-subject"
            />
          )}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={id("category")} label={t("form.category")} error={fieldError("category", "category")} required>
            {(control) => (
              <Select {...control} name="category" defaultValue="tracking">
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={id("priority")} label={t("form.priority")} hint={t("form.priorityHint")}>
            {(control) => (
              <Select {...control} name="priority" defaultValue="normal">
                {PORTAL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {tVocab(`priority.${p}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field id={id("body")} label={t("form.message")} hint={t("form.messageHint", bodyLimits)} error={fieldError("body", "body", bodyLimits)} required>
          {(control) => (
            <Textarea
              {...control}
              name="body"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                scheduleSuggestions(subject, e.target.value);
              }}
              minLength={PORTAL_LIMITS.bodyMin}
              maxLength={PORTAL_LIMITS.bodyMax}
              rows={10}
              data-testid="support-new-body"
            />
          )}
        </Field>
        <AttachmentsInput id={id("attachments")} label={t("form.attachments")} locale={locale} disabled={pending} />
        <p id={id("requester")} className="text-xs text-ink-3">
          {t("form.requester", { name: requester.name, email: requester.email })}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Link href="/app/support" className={buttonVariants({ variant: "secondary" })}>
            {t("common.cancel")}
          </Link>
          <Button type="submit" loading={pending} loadingLabel={t("common.working")} data-testid="support-new-submit">
            {t("form.submit")}
          </Button>
        </div>
      </form>
      <KnowledgeSuggestions items={suggestions} status={status} />
    </div>
  );
}
