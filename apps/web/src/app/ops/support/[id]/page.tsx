import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_PER_MESSAGE, SUPPORT_TICKET_PRIORITIES } from "@track-site/db";
import { Badge, Banner, Status, buttonVariants, cn } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { Composer } from "@/components/ops/support/ticket/composer";
import { COMPOSER_STATUSES } from "@/components/ops/support/ticket/constants";
import { Conversation } from "@/components/ops/support/ticket/conversation";
import { formatDateTime } from "@/components/ops/support/ticket/format";
import { HeaderActions } from "@/components/ops/support/ticket/header-actions";
import { PRIORITY_TONE, STATUS_TONE } from "@/components/ops/support/ticket/labels";
import { PresenceBanner } from "@/components/ops/support/ticket/presence-banner";
import { PropertiesPanel } from "@/components/ops/support/ticket/properties-panel";
import { RequesterSidebar } from "@/components/ops/support/ticket/requester-sidebar";
import { TicketShortcuts } from "@/components/ops/support/ticket/shortcuts";
import { SlaPanel } from "@/components/ops/support/ticket/sla-panel";
import { checkPlatform, platformCan, platformLocale } from "@/server/ops/platform";
import { ATTACHMENT_ALLOWED_TYPES } from "@/server/support/inbound";
import { CONFIRMED_TICKET_TRANSITIONS, TICKET_TRANSITIONS, canTransitionTicket, isUuid, loadTicketDetail } from "@/server/support/ticket";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("support.pages.ticket");
  return { title: `${id.slice(0, 8)} · ${t("title")}` };
}

/**
 * Track Operations → Support → ticket detail (docs/18 §"Ticket detail"): conversation and timeline, the
 * composer (reply / internal note, macros, attachments, send & set status), properties (status, priority,
 * assignee, category, tags), SLA clocks, presence of other operators, the requester sidebar and the
 * satisfaction rating. Read access needs `platform.tickets.read`; every mutation is a server action that
 * re-checks its own permission and is audited. Keyboard: r reply, n note, a assign to me, e solve.
 */
export default async function OpsSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.read");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const now = new Date();
  const [detail, t, tv, locale] = await Promise.all([loadTicketDetail(ctx, id, now), getTranslations("supportTicket"), getTranslations("support"), platformLocale(ctx.user)]);
  if (!detail) notFound();
  const { ticket, sla } = detail;
  const canWrite = platformCan(ctx, "platform.tickets.write");
  const canAssign = platformCan(ctx, "platform.tickets.assign");
  const transitions = [...TICKET_TRANSITIONS[ticket.status]];
  const composerStatuses = COMPOSER_STATUSES.filter((s) => s !== ticket.status && canTransitionTicket(ticket.status, s));
  const blocked = ticket.status === "spam" ? "spam" : ticket.mergedInto ? "merged" : null;
  const names = new Map(detail.operators.map((o) => [o.id, o.name]));
  const ended = ticket.status === "solved" || ticket.status === "closed";
  const breached = sla.firstResponse.state === "breached" || sla.resolution.state === "breached";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ops/support" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("page.back")}
        </Link>
      </div>
      <OpsPageHeader
        title={`${tv("ticketNumber", { number: ticket.number })} · ${ticket.subject}`}
        context={
          <>
            <Status tone={STATUS_TONE[ticket.status]} indicator="icon" chip data-testid="ticket-status">
              {tv(`status.${ticket.status}`)}
            </Status>
            <Status tone={PRIORITY_TONE[ticket.priority]} indicator="dot" chip data-testid="ticket-priority">
              {tv(`priority.${ticket.priority}`)}
            </Status>
            <Badge tone="neutral">{tv(`channel.${ticket.channel}`)}</Badge>
            {ticket.category ? <Badge tone="neutral">{ticket.category}</Badge> : null}
            {breached ? (
              <Status tone="bad" indicator="icon" chip data-testid="ticket-breached">
                {tv("sla.breached")}
              </Status>
            ) : null}
            <span className="text-ink-3">
              {t("page.assignee")}: {ticket.assignee?.name ?? t("common.unassigned")}
            </span>
            <span className="text-ink-3">{t("page.created", { date: formatDateTime(ticket.createdAt, locale) ?? "" })}</span>
          </>
        }
        actions={<HeaderActions ticketId={ticket.id} number={ticket.number} canReopen={canWrite && ended && !ticket.mergedInto} canMerge={canWrite && !ticket.mergedInto && ticket.status !== "spam"} />}
      />

      {ticket.mergedInto ? (
        <Banner
          tone="warn"
          title={t("page.mergedTitle", { number: ticket.mergedInto.number })}
          action={
            <Link href={`/ops/support/${ticket.mergedInto.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("page.openTarget")}
            </Link>
          }
          data-testid="ticket-merged"
        >
          {t("page.mergedText")}
        </Banner>
      ) : null}
      {ticket.mergedFrom.length ? (
        <p className="text-xs text-ink-3">
          {t("page.mergedFrom")}{" "}
          {ticket.mergedFrom.map((m, i) => (
            <span key={m.id}>
              {i ? ", " : ""}
              <Link href={`/ops/support/${m.id}`} className="text-primary underline underline-offset-2">
                {tv("ticketNumber", { number: m.number })}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      <PresenceBanner ticketId={ticket.id} initial={detail.presence} serverNow={detail.generatedAt} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="ticket-conversation-title" className="space-y-3">
            <h2 id="ticket-conversation-title" className="text-lg font-semibold text-ink">
              {t("page.conversation")}
            </h2>
            <Conversation items={detail.timeline} locale={locale} now={detail.generatedAt} names={names} canSend={canWrite} />
          </section>
          {canWrite ? (
            <Composer
              ticketId={ticket.id}
              placeholders={{ ticketNumber: ticket.number, requesterName: ticket.requesterName, requesterEmail: ticket.requesterEmail, agentName: ctx.user.name, organisationName: detail.requester.organization?.name ?? null }}
              macros={detail.macros}
              statuses={composerStatuses}
              blocked={blocked}
              limits={{ maxFiles: SUPPORT_ATTACHMENT_MAX_PER_MESSAGE, maxBytes: SUPPORT_ATTACHMENT_MAX_BYTES, allowedTypes: [...ATTACHMENT_ALLOWED_TYPES] }}
              from={{ name: detail.mail.fromName, address: detail.mail.fromAddress }}
              locale={locale}
            />
          ) : (
            <p className="text-sm text-ink-3">{t("page.readOnly")}</p>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <PropertiesPanel
            ticketId={ticket.id}
            status={ticket.status}
            transitions={transitions}
            confirmRequired={[...CONFIRMED_TICKET_TRANSITIONS]}
            priority={ticket.priority}
            priorities={[...SUPPORT_TICKET_PRIORITIES]}
            category={ticket.category}
            tags={ticket.tags}
            assigneeId={ticket.assignee?.id ?? null}
            operators={detail.operators}
            selfId={ctx.user.id}
            canWrite={canWrite && !ticket.mergedInto}
            canAssign={canAssign && !ticket.mergedInto}
          />
          <SlaPanel sla={sla} locale={locale} />
          <RequesterSidebar ticket={ticket} requester={detail.requester} locale={locale} now={detail.generatedAt} />
          <TicketShortcuts />
        </div>
      </div>

      <p className="text-xs text-ink-3">{t("page.generated", { date: formatDateTime(detail.generatedAt, locale) ?? "" })}</p>
    </div>
  );
}
