import { getTranslations } from "next-intl/server";
import type { PortalEvent } from "@/server/support/portal";
import { formatDateTime } from "./format";
import { vocabLabel } from "./labels";

/** Customer-relevant timeline of a ticket (created, status, priority, merged, reply, csat, reopened) — never notes, tags or assignees. */
export async function Timeline({ events, locale }: { events: PortalEvent[]; locale: string }) {
  const [t, tVocab] = await Promise.all([getTranslations("supportPortal.detail.timeline"), getTranslations("support")]);
  if (!events.length) return null;
  const detail = (e: PortalEvent): string | null => {
    switch (e.kind) {
      case "status":
      case "reopened":
      case "priority": {
        const group = e.kind === "priority" ? "priority" : "status";
        if (e.payload.from && e.payload.to) return t("change", { from: vocabLabel(tVocab, group, e.payload.from), to: vocabLabel(tVocab, group, e.payload.to) });
        return e.payload.to ? vocabLabel(tVocab, group, e.payload.to) : null;
      }
      case "created":
        return e.payload.channel ? t("channel", { channel: vocabLabel(tVocab, "channel", e.payload.channel) }) : null;
      case "csat":
        return e.payload.score !== undefined ? t("score", { score: e.payload.score }) : null;
      case "merged":
        return e.payload.intoNumber !== undefined ? t("mergedInto", { number: tVocab("ticketNumber", { number: e.payload.intoNumber }) }) : null;
      default:
        return null;
    }
  };
  return (
    <section aria-labelledby="support-timeline-title" className="space-y-3">
      <h2 id="support-timeline-title" className="text-lg font-semibold text-ink">
        {t("title")}
      </h2>
      <ol aria-label={t("caption")} className="space-y-2 border-l border-line pl-4 text-sm">
        {events.map((e) => {
          const extra = detail(e);
          return (
            <li key={e.id} className="relative">
              <span aria-hidden="true" className="absolute top-2 -left-[21px] size-2 rounded-full bg-line-2" />
              <p className="text-ink">
                <span className="font-medium">{vocabLabel(tVocab, "eventKind", e.kind)}</span>
                {extra ? <span className="text-ink-2"> · {extra}</span> : null}
              </p>
              <p className="text-xs text-ink-3">
                {t(`actor.${e.actorKind}`)} · <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt, locale)}</time>
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
