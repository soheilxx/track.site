import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@track-site/core";
import { Alert, Badge, Status } from "@track-site/ui";
import { Conversation } from "@/components/app/support/conversation";
import { CsatForm } from "@/components/app/support/csat-form";
import { formatDateTime } from "@/components/app/support/format";
import { categoryLabel, priorityTone, statusTone, vocabLabel } from "@/components/app/support/labels";
import { SupportPageHeader } from "@/components/app/support/page-header";
import { ReplyForm } from "@/components/app/support/reply-form";
import { SolveDialog } from "@/components/app/support/solve-dialog";
import { Timeline } from "@/components/app/support/timeline";
import { formatDate } from "@/lib/format";
import { requireOrgContext } from "@/server/session";
import { customerCanMarkSolved, customerCanRate, customerCanReply, isUuid, loadCustomerTicket, loadPortalSettings } from "@/server/support/portal";

const NOTICES = new Set(["created"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("support");
  // the number would need a database round trip before render: the id prefix names the tab until the page shows the number
  return { title: `${t("pages.ticket.title")} ${isUuid(id) ? id.slice(0, 8) : ""}`.trim() };
}

/**
 * One ticket as the customer sees it (`/app/support/[id]`): the conversation without internal notes, the
 * reply form, "mark as solved", the satisfaction question after solving and the customer-relevant timeline.
 * Another organisation's ticket, a spam-flagged one or an unknown id are a 404 — never a hint that it exists.
 */
export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const ctx = await requireOrgContext("support.read");
  const detail = await loadCustomerTicket(ctx, id);
  if (!detail) notFound();
  const [t, tVocab, locale, settings] = await Promise.all([getTranslations("supportPortal"), getTranslations("support"), getLocale(), loadPortalSettings()]);
  const { ticket, messages, events, mergedInto } = detail;
  const canWrite = can(ctx.role, "support.write") && !ctx.readOnly;
  const number = tVocab("ticketNumber", { number: ticket.number });
  const noticeRaw = Array.isArray(q.notice) ? q.notice[0] : q.notice;
  const notice = noticeRaw && NOTICES.has(noticeRaw) ? noticeRaw : null;
  const canReply = canWrite && customerCanReply(ticket);
  const canSolve = canWrite && customerCanMarkSolved(ticket);
  const canRate = canWrite && customerCanRate(ticket, settings.csatEnabled);
  const openedBy = ticket.channel === "form" ? t("detail.openedForm", { date: formatDate(ticket.createdAt, locale, "short") }) : ticket.channel === "email" ? t("detail.openedEmail", { date: formatDate(ticket.createdAt, locale, "short") }) : t("detail.opened", { date: formatDate(ticket.createdAt, locale, "short"), name: ticket.requesterName ?? ticket.requesterEmail });

  return (
    <div className="space-y-6">
      <SupportPageHeader
        eyebrow={
          <Link href="/app/support" className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-ink-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("detail.back")}
          </Link>
        }
        title={`${number} · ${ticket.subject}`}
        intro={openedBy}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSolve ? <SolveDialog ticketId={ticket.id} number={number} locale={locale} /> : null}
          </div>
        }
      />

      {notice ? <Alert tone="ok">{t(`notices.${notice}`)}</Alert> : null}
      {mergedInto ? (
        <Alert tone="info">
          {t("detail.merged", { number: tVocab("ticketNumber", { number: mergedInto.number }) })}{" "}
          <Link href={`/app/support/${mergedInto.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
            {t("detail.mergedLink", { number: tVocab("ticketNumber", { number: mergedInto.number }) })}
          </Link>
        </Alert>
      ) : null}
      {!canWrite ? <Alert tone="info">{t("list.readOnly")}</Alert> : null}

      <dl className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("detail.meta.status")}</dt>
          <dd className="mt-1">
            <Status tone={statusTone(ticket.status)} chip>
              {vocabLabel(tVocab, "status", ticket.status)}
            </Status>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("detail.meta.priority")}</dt>
          <dd className="mt-1">
            <Badge tone={priorityTone(ticket.priority)}>{vocabLabel(tVocab, "priority", ticket.priority)}</Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("detail.meta.category")}</dt>
          <dd className="mt-1 font-medium text-ink">{categoryLabel(t, ticket.category)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("detail.meta.channel")}</dt>
          <dd className="mt-1 font-medium text-ink">{vocabLabel(tVocab, "channel", ticket.channel)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{ticket.resolvedAt ? t("detail.meta.resolved") : t("detail.meta.lastUpdate")}</dt>
          <dd className="mt-1 font-medium text-ink tabular-nums">
            <time dateTime={(ticket.resolvedAt ?? ticket.updatedAt).toISOString()}>{formatDateTime(ticket.resolvedAt ?? ticket.updatedAt, locale)}</time>
            {ticket.reopenCount > 0 ? <span className="block text-xs font-normal text-ink-3">{t("detail.meta.reopened", { count: ticket.reopenCount })}</span> : null}
          </dd>
        </div>
      </dl>

      {canRate ? (
        <section className="rounded-[var(--radius-card)] border border-ok/30 bg-ok-soft p-5">
          <CsatForm ticketId={ticket.id} locale={locale} />
        </section>
      ) : ticket.satisfaction ? (
        <Alert tone="ok">{t("detail.csat.rated", { score: ticket.satisfaction.score, date: formatDate(ticket.satisfaction.answered_at, locale, "short") })}</Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="support-conversation-title" className="space-y-4">
          <h2 id="support-conversation-title" className="text-lg font-semibold text-ink">
            {t("detail.conversation.title")}
          </h2>
          <Conversation ticketId={ticket.id} messages={messages} locale={locale} />
          {canReply ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <ReplyForm ticketId={ticket.id} status={ticket.status} locale={locale} />
            </div>
          ) : canWrite ? (
            <Alert tone="info">{t("detail.reply.closedBlocked")}</Alert>
          ) : null}
        </section>
        <Timeline events={events} locale={locale} />
      </div>
    </div>
  );
}
