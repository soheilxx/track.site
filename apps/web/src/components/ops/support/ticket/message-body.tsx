import { cn } from "@track-site/ui";

/**
 * Body of one message. `html` is the sanitised HTML the loader produced (`sanitizeHtml` on load, on top of
 * the sanitised column) — the only place the console renders markup, and never provider HTML as received.
 * Without HTML the plain text is shown with its line breaks. Remote images were stripped at ingestion;
 * inline (`cid:`/data) images are capped to the column, links open in a new tab with `rel` set by the sanitiser.
 */
export function MessageBody({ html, text, className }: { html: string | null; text: string; className?: string }) {
  const base = "min-w-0 break-words text-sm leading-6 text-ink";
  if (!html?.trim()) {
    return (
      <div className={cn(base, "whitespace-pre-wrap", className)} data-testid="ticket-message-text">
        {text}
      </div>
    );
  }
  return (
    <div
      className={cn(
        base,
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3 [&_blockquote]:text-ink-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-line [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius-control-sm)] [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      data-testid="ticket-message-html"
      // sanitised twice (ingestion + load) to an allow-list without scripts, styles, handlers or remote images
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
