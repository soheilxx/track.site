import { Paperclip } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@track-site/ui";
import type { PortalMessage } from "@/server/support/portal";
import { formatBytes, formatDateTime } from "./format";

/**
 * The customer-visible conversation: inbound messages of the organisation and outbound agent replies —
 * internal notes never reach this component (RLS and the loader). Agent HTML is the sanitised allow-list
 * subset stored by the desk (sanitised again by the loader); customer messages are plain text.
 */
export async function Conversation({ ticketId, messages, locale }: { ticketId: string; messages: PortalMessage[]; locale: string }) {
  const t = await getTranslations("supportPortal.detail.conversation");
  if (!messages.length) return <p className="text-sm text-ink-3">{t("empty")}</p>;
  return (
    <ol className="space-y-4">
      {messages.map((m) => {
        const fromCustomer = m.direction === "inbound";
        const author = m.authorName ?? (m.authorKind === "agent" ? t("agent") : m.authorKind === "system" ? t("system") : t("you"));
        return (
          <li key={m.id}>
            <article aria-label={`${author}, ${formatDateTime(m.createdAt, locale)}`} className={cn("rounded-[var(--radius-card)] border p-4", fromCustomer ? "border-line bg-surface" : "border-primary/20 bg-primary-soft/40")}>
              <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-ink">
                  {author}
                  {!fromCustomer && m.authorKind === "agent" ? <span className="ml-2 text-xs font-normal text-ink-3">{t("agent")}</span> : null}
                </p>
                <time dateTime={m.createdAt.toISOString()} className="text-xs text-ink-3">
                  {formatDateTime(m.createdAt, locale)}
                </time>
              </header>
              {m.htmlBody ? (
                // sanitised server-side (allow-list, no scripts/styles/forms/remote images) — see server/support/inbound.ts
                <div className="prose-track mt-3 max-w-none text-sm text-ink [&_a]:text-primary [&_a]:underline [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: m.htmlBody }} />
              ) : (
                <p className="mt-3 text-sm whitespace-pre-wrap break-words text-ink">{m.textBody}</p>
              )}
              {m.attachments.length ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("attachments")}</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      <li key={a.id}>
                        <a href={`/app/support/${ticketId}/attachments/${a.id}`} aria-label={t("download", { name: a.fileName, size: formatBytes(a.sizeBytes, locale) })} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control-sm)] border border-line bg-surface px-3 text-sm text-ink hover:border-line-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                          <Paperclip className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                          <span className="max-w-[16rem] truncate">{a.fileName}</span>
                          <span className="text-xs text-ink-3 tabular-nums">{formatBytes(a.sizeBytes, locale)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
