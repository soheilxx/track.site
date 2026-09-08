"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { KnowledgeSuggestion } from "@/server/support/portal";

export type SuggestionStatus = "idle" | "searching" | "done";

/**
 * Tracking Knowledge articles that match what the customer is typing. Links open the public article in a
 * new tab (the marketing host); the list is a polite live region so a screen reader hears when results change.
 */
export function KnowledgeSuggestions({ items, status }: { items: KnowledgeSuggestion[]; status: SuggestionStatus }) {
  const t = useTranslations("supportPortal.form.suggestions");
  return (
    <aside aria-labelledby="support-suggestions-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h2 id="support-suggestions-title" className="flex items-center gap-2 text-base font-semibold text-ink">
        <BookOpen className="size-4 text-ink-3" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      <div role="status" aria-live="polite" className="mt-3">
        {status === "idle" ? <p className="text-sm text-ink-3">{t("typing")}</p> : null}
        {status === "searching" && items.length === 0 ? <p className="text-sm text-ink-3">{t("searching")}</p> : null}
        {status === "done" && items.length === 0 ? <p className="text-sm text-ink-3">{t("empty")}</p> : null}
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((a) => (
              <li key={a.id} className="py-2">
                <a href={a.href} target="_blank" rel="noopener noreferrer" className="group flex min-h-11 items-start gap-2 rounded-[var(--radius-control-sm)] py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink group-hover:text-primary group-hover:underline">{a.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-ink-3">{a.description}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">{t("reading", { minutes: a.readingMinutes })}</span>
                  </span>
                  <ExternalLink className="mt-1 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
