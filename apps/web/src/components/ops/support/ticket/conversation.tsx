import { Download, Lock, Paperclip } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, EmptyState, Status, buttonVariants, cn } from "@track-site/ui";
import type { EventView, MessageView, TimelineItem } from "@/server/support/ticket";
import { SendNowButton } from "./send-now-button";
import { formatBytes, formatDateTime, formatRelative } from "./format";
import { DELIVERY_TONE } from "./labels";
import { MessageBody } from "./message-body";

type Translate = Awaited<ReturnType<typeof getTranslations<"supportTicket">>>;
type Vocabulary = Awaited<ReturnType<typeof getTranslations<"support">>>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Human-readable line of a timeline event from its kind and payload (ids and field changes only). */
function eventLine(t: Translate, tv: Vocabulary, event: EventView, names: ReadonlyMap<string, string>): { label: string; detail: ReactNode } {
  const p = event.payload;
  const vocab = (group: string, value: string | null) => (value && tv.has(`${group}.${value}`) ? tv(`${group}.${value}`) : (value ?? ""));
  switch (event.kind) {
    case "created":
      return { label: tv("eventKind.created"), detail: str(p.channel) ? t("timeline.via", { channel: vocab("channel", str(p.channel)) }) : null };
    case "status":
      return { label: tv("eventKind.status"), detail: t("timeline.change", { from: vocab("status", str(p.from)), to: vocab("status", str(p.to)) }) };
    case "priority":
      return { label: tv("eventKind.priority"), detail: t("timeline.change", { from: vocab("priority", str(p.from)), to: vocab("priority", str(p.to)) }) };
    case "assignee": {
      const to = str(p.to);
      return { label: tv("eventKind.assignee"), detail: to ? t("timeline.assignedTo", { name: names.get(to) ?? t("timeline.formerOperator") }) : t("timeline.unassigned") };
    }
    case "tags": {
      const added = list(p.added).map((x) => `+${x}`);
      const removed = list(p.removed).map((x) => `−${x}`);
      return { label: tv("eventKind.tags"), detail: [...added, ...removed].join(" ") || null };
    }
    case "merged": {
      const id = str(p.ticketId);
      const number = num(p.number);
      const link = id && number != null ? <Link href={`/ops/support/${id}`} className="font-medium text-primary underline underline-offset-2">{tv("ticketNumber", { number })}</Link> : null;
      return { label: tv("eventKind.merged"), detail: link ? (str(p.direction) === "from" ? <>{t("timeline.mergedFrom")} {link}</> : <>{t("timeline.mergedInto")} {link}</>) : null };
    }
    case "sla_breach":
    case "sla_warning": {
      const clockKey = str(p.clock);
      const clock = clockKey === "first_response" ? tv("sla.firstResponse") : clockKey === "resolution" ? tv("sla.resolution") : null;
      return { label: tv(`eventKind.${event.kind}`), detail: clock };
    }
    case "csat": {
      const score = num(p.score);
      return { label: tv("eventKind.csat"), detail: score != null ? t("timeline.csatScore", { score }) : null };
    }
    case "reopened": {
      const count = num(p.count);
      return { label: tv("eventKind.reopened"), detail: count != null ? t("timeline.reopenCount", { count }) : null };
    }
    default:
      return { label: tv(`eventKind.${event.kind}`), detail: null };
  }
}

function MessageCard({ message, locale, now, t, tv, canSend }: { message: MessageView; locale: string; now: number; t: Translate; tv: Vocabulary; canSend: boolean }) {
  const note = message.direction === "note";
  const outbound = message.direction === "outbound";
  const who = message.authorKind === "agent" ? (message.author?.name ?? t("timeline.formerOperator")) : message.authorKind === "system" ? tv("authorKind.system") : message.fromEmail || tv("authorKind.customer");
  const showDelivery = outbound && message.deliveryStatus !== "na";
  // queued, failed, or a `sending` claim that went stale (the loader's `isMessageSendable`): "send now" / "send again"
  const retry = outbound && message.sendable;
  return (
    <article
      aria-label={note ? t("timeline.noteLabel", { name: who }) : outbound ? t("timeline.outboundLabel", { name: who }) : t("timeline.inboundLabel", { name: who })}
      className={cn(
        "rounded-[var(--radius-card)] border p-4 sm:p-5",
        note ? "border-warn/40 bg-warn-soft" : outbound ? "border-primary/30 bg-primary-soft/40" : "border-line bg-surface",
      )}
      data-testid={`ticket-message-${message.direction}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-ink">{who}</span>
        <Badge tone={note ? "warn" : outbound ? "primary" : "neutral"}>
          {note ? <Lock className="size-3" aria-hidden="true" /> : null}
          {tv(`direction.${message.direction}`)}
        </Badge>
        {showDelivery ? (
          <Status tone={DELIVERY_TONE[message.deliveryStatus]} indicator="icon" className="text-xs">
            {tv(`delivery.${message.deliveryStatus}`)}
          </Status>
        ) : null}
        <time dateTime={message.createdAt} className="ml-auto text-xs text-ink-3" title={formatDateTime(message.createdAt, locale) ?? undefined}>
          {formatDateTime(message.createdAt, locale)} · {formatRelative(message.createdAt, locale, now)}
        </time>
      </header>
      {note ? <p className="mt-1 text-xs text-warn">{t("timeline.noteHint")}</p> : null}
      {outbound && message.toEmails.length ? (
        <p className="mt-1 text-xs text-ink-3">
          {t("timeline.to")}: <span className="break-all">{message.toEmails.join(", ")}</span>
          {message.ccEmails.length ? ` · CC: ${message.ccEmails.join(", ")}` : null}
        </p>
      ) : null}
      {message.deliveryError ? (
        <p className="mt-1 text-xs text-bad break-words" role="alert">
          {t("timeline.deliveryError")}: {message.deliveryError}
        </p>
      ) : null}
      <div className="mt-3">
        <MessageBody html={message.htmlBody} text={message.textBody} />
      </div>
      {message.attachments.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("timeline.attachments")}>
          {message.attachments.map((a) => (
            <li key={a.id}>
              <a href={`/api/support/attachments/${a.id}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "max-w-full")} download={a.fileName} data-testid="ticket-attachment">
                <Paperclip className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{a.fileName}</span>
                <span className="text-xs text-ink-3">{formatBytes(a.sizeBytes, locale)}</span>
                <Download className="size-4 shrink-0" aria-hidden="true" />
              </a>
              <span className="mt-0.5 block text-[11px] text-ink-3">{t("timeline.notScanned")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {retry && canSend ? (
        <div className="mt-3">
          <SendNowButton messageId={message.id} failed={message.deliveryStatus !== "queued"} />
        </div>
      ) : null}
    </article>
  );
}

/**
 * Conversation and timeline of a ticket, oldest first: customer messages, agent replies (with delivery
 * state and a "send now" for queued / failed ones), internal notes (distinct, marked as invisible to the
 * customer) and the system events between them. Reply / note events are represented by the messages
 * themselves and are not listed twice.
 */
export async function Conversation({ items, locale, now, names, canSend }: { items: TimelineItem[]; locale: string; now: string; names: ReadonlyMap<string, string>; canSend: boolean }) {
  const [t, tv] = await Promise.all([getTranslations("supportTicket"), getTranslations("support")]);
  const nowMs = Date.parse(now);
  const visible = items.filter((item) => item.type === "message" || (item.event.kind !== "reply" && item.event.kind !== "note"));
  if (!visible.length) return <EmptyState title={t("timeline.empty")} description={t("timeline.emptyText")} />;
  return (
    <ol className="space-y-3" aria-label={t("timeline.label")} data-testid="ticket-timeline">
      {visible.map((item) => {
        if (item.type === "message") {
          return (
            <li key={`m-${item.message.id}`}>
              <MessageCard message={item.message} locale={locale} now={nowMs} t={t} tv={tv} canSend={canSend} />
            </li>
          );
        }
        const line = eventLine(t, tv, item.event, names);
        const who = item.event.actorKind === "agent" ? (item.event.actor?.name ?? t("timeline.formerOperator")) : item.event.actorKind === "customer" ? tv("authorKind.customer") : tv("authorKind.system");
        return (
          <li key={`e-${item.event.id}`} className="flex flex-col gap-0.5 px-2 text-xs text-ink-3 sm:flex-row sm:items-baseline sm:gap-3" data-testid={`ticket-event-${item.event.kind}`}>
            <time dateTime={item.event.createdAt} className="shrink-0 whitespace-nowrap sm:w-40">
              {formatDateTime(item.event.createdAt, locale)}
            </time>
            <span className="min-w-0">
              <span className="font-medium text-ink-2">{line.label}</span>
              {line.detail ? <span> · {line.detail}</span> : null}
              <span> · {t("timeline.by", { name: who })}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
