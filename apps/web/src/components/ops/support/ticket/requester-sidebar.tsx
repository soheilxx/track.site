import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Status, buttonVariants } from "@track-site/ui";
import { subscriptionStatusLabel, subscriptionStatusTone } from "@/components/ops/organisations/labels";
import { LOCALE_NAMES, isKnownLocale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { RequesterView, TicketView } from "@/server/support/ticket";
import { formatDateTime, formatRelative } from "./format";
import { STATUS_TONE } from "./labels";

/**
 * Requester sidebar: who is asking, their organisation (plan, subscription state, this month's usage —
 * metadata only, no event data), the way to the organisation page and the break-glass request, their
 * other recent tickets, recent audit entries (the organisation's for an admin, the caller's own actions
 * for a support agent — `recentAuditScope`) and the satisfaction rating of this ticket.
 */
export async function RequesterSidebar({ ticket, requester, locale, now }: { ticket: TicketView; requester: RequesterView; locale: string; now: string }) {
  const [t, tv, tOrg] = await Promise.all([getTranslations("supportTicket"), getTranslations("support"), getTranslations("opsOrganisations")]);
  const nowMs = Date.parse(now);
  const language = isKnownLocale(requester.locale) ? LOCALE_NAMES[requester.locale] : requester.locale;
  const org = requester.organization;
  const facts: Array<{ key: string; label: string; value: ReactNode }> = [
    { key: "email", label: t("requester.email"), value: <span className="break-all">{requester.email}</span> },
    { key: "name", label: t("requester.name"), value: requester.name ?? <span className="text-ink-3">{t("common.none")}</span> },
    { key: "locale", label: t("requester.language"), value: language },
    { key: "account", label: t("requester.account"), value: requester.userId ? t("requester.accountLinked") : t("requester.accountNone") },
    { key: "channel", label: t("requester.channel"), value: tv(`channel.${ticket.channel}`) },
  ];
  return (
    <div className="space-y-4">
      <section aria-labelledby="ticket-requester-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-requester">
        <h2 id="ticket-requester-title" className="text-base font-semibold text-ink">
          {t("requester.title")}
        </h2>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm">
          {facts.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{f.label}</dt>
              <dd className="mt-0.5 text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
        {ticket.contactRequestId ? (
          <p className="mt-3 text-xs">
            <Link href={`/ops/inbox/${ticket.contactRequestId}`} className="text-primary underline underline-offset-2">
              {t("requester.contactRequest")}
            </Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ticket-organisation-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-organisation">
        <h2 id="ticket-organisation-title" className="text-base font-semibold text-ink">
          {t("organisation.title")}
        </h2>
        {org ? (
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-medium text-ink">{org.name}</p>
              <p className="text-xs text-ink-3">
                <code>{org.slug}</code>
              </p>
              {org.suspendedAt ? (
                <Status tone="bad" indicator="icon" chip className="mt-1">
                  {t("organisation.suspended")}
                </Status>
              ) : null}
            </div>
            <dl className="grid gap-x-4 gap-y-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("organisation.plan")}</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{requester.plan?.name ?? t("organisation.planNone")}</Badge>
                  <Badge tone={subscriptionStatusTone(requester.subscriptionStatus)}>{subscriptionStatusLabel(tOrg, requester.subscriptionStatus)}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("organisation.usage")}</dt>
                <dd className="mt-0.5 text-ink tabular-nums">
                  {requester.usage
                    ? t("organisation.usageValue", { billable: formatNumber(requester.usage.billable, locale), limit: requester.usage.limit != null ? formatNumber(requester.usage.limit, locale) : t("organisation.noLimit"), period: requester.usage.periodKey })
                    : <span className="text-ink-3">{t("organisation.usageNone")}</span>}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Link href={`/ops/organisations/${org.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid="ticket-open-organisation">
                {t("organisation.open")}
              </Link>
              <Link href={`/ops/break-glass?organization=${org.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="ticket-break-glass">
                <KeyRound className="size-4" aria-hidden="true" />
                {t("organisation.breakGlass")}
              </Link>
            </div>
            {requester.recentAudit.length ? (
              <div>
                <h3 className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t(requester.recentAuditScope === "own" ? "organisation.recentAuditOwn" : "organisation.recentAudit")}</h3>
                <ul className="mt-1 divide-y divide-line text-xs">
                  {requester.recentAudit.map((a) => (
                    <li key={a.id} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-2">
                      <time dateTime={a.createdAt} className="shrink-0 text-ink-3">
                        {formatRelative(a.createdAt, locale, nowMs)}
                      </time>
                      <span className="min-w-0 break-all font-mono text-ink-2">{a.action}</span>
                      <span className="text-ink-3">{a.actorKind}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/ops/audit?organization=${org.id}`} className="mt-1 inline-block text-xs text-primary underline underline-offset-2">
                  {t("organisation.allAudit")}
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-3">{t("organisation.none")}</p>
        )}
      </section>

      <section aria-labelledby="ticket-recent-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-recent">
        <h2 id="ticket-recent-title" className="text-base font-semibold text-ink">
          {t("recent.title")}
        </h2>
        {requester.recentTickets.length ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {requester.recentTickets.map((r) => (
              <li key={r.id} className="py-2">
                <Link href={`/ops/support/${r.id}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-ink hover:text-primary">
                  <span className="font-mono text-xs text-ink-3">{tv("ticketNumber", { number: r.number })}</span>
                  <span className="min-w-0 flex-1 truncate">{r.subject}</span>
                  <Status tone={STATUS_TONE[r.status]} indicator="dot" className="text-xs">
                    {tv(`status.${r.status}`)}
                  </Status>
                </Link>
                <time dateTime={r.updatedAt} className="text-xs text-ink-3">
                  {formatRelative(r.updatedAt, locale, nowMs)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-3">{t("recent.none")}</p>
        )}
      </section>

      <section aria-labelledby="ticket-csat-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-csat">
        <h2 id="ticket-csat-title" className="text-base font-semibold text-ink">
          {t("csat.title")}
        </h2>
        {ticket.satisfaction ? (
          <div className="mt-3 text-sm">
            <p className="text-ink" aria-label={t("csat.scoreLabel", { score: ticket.satisfaction.score })}>
              <span aria-hidden="true" className="tracking-widest text-warn">
                {"★".repeat(ticket.satisfaction.score)}
                <span className="text-line-2">{"★".repeat(5 - ticket.satisfaction.score)}</span>
              </span>
              <span className="ml-2 tabular-nums">{t("csat.score", { score: ticket.satisfaction.score })}</span>
            </p>
            {ticket.satisfaction.comment ? <blockquote className="mt-2 border-l-2 border-line-2 pl-3 text-ink-2 whitespace-pre-wrap">{ticket.satisfaction.comment}</blockquote> : null}
            <p className="mt-2 text-xs text-ink-3">
              <time dateTime={ticket.satisfaction.answered_at}>{formatDateTime(ticket.satisfaction.answered_at, locale)}</time>
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-3">{t("csat.none")}</p>
        )}
      </section>
    </div>
  );
}
