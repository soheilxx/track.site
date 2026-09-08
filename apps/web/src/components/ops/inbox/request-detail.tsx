import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Status, buttonVariants } from "@track-site/ui";
import { LOCALE_NAMES, isKnownLocale } from "@/i18n/routing";
import { organisationHref, type ContactRequestDetail, type ContactTrailEntry } from "@/server/ops/inbox";
import { formatDateTime, formatRelative } from "./format";
import { DELIVERY_TONE, STATUS_TONE } from "./request-table";

type Translate = Awaited<ReturnType<typeof getTranslations<"opsInbox">>>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numberOf = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Human-readable line of one trail entry from its action and redacted diff (statuses, transport facts — never bodies). */
function trailLine(t: Translate, entry: ContactTrailEntry, names: ReadonlyMap<string, string>): { label: string; detail: string | null } {
  const diff = entry.diff ?? {};
  if (entry.action === "platform.contact_request.status") {
    const from = str(diff.from);
    const to = str(diff.to);
    return {
      label: t("detail.trail.actions.status"),
      detail: from && to ? t("detail.trail.statusChange", { from: t.has(`status.${from}`) ? t(`status.${from}`) : from, to: t.has(`status.${to}`) ? t(`status.${to}`) : to }) : null,
    };
  }
  if (entry.action === "platform.contact_request.assign") {
    const to = str(diff.to);
    return { label: t("detail.trail.actions.assign"), detail: to ? t("detail.trail.assignedTo", { name: names.get(to) ?? t("detail.trail.byUnknown") }) : t("detail.trail.assignedNone") };
  }
  if (entry.action === "platform.contact_request.reply") {
    const ok = diff.ok === true;
    const transport = str(diff.transport) ?? "";
    return ok
      ? { label: t("detail.trail.actions.reply"), detail: t("detail.trail.replyDetail", { transport, locale: str(diff.locale) ?? "", length: numberOf(diff.bodyLength) ?? 0 }) }
      : { label: t("detail.trail.actions.replyFailed"), detail: t("detail.trail.replyError", { transport }) };
  }
  return { label: t("detail.trail.actions.other"), detail: entry.action };
}

/** Message, facts and the audited history of one request (the actions are client islands rendered by the page). */
export async function RequestDetail({ request, locale, now, operatorNames }: { request: ContactRequestDetail; locale: string; now: string; operatorNames: ReadonlyMap<string, string> }) {
  const t = await getTranslations("opsInbox");
  const nowMs = Date.parse(now);
  const language = isKnownLocale(request.locale) ? LOCALE_NAMES[request.locale] : request.locale;
  const facts: Array<{ key: string; label: string; value: ReactNode }> = [
    { key: "email", label: t("detail.email"), value: <span className="break-all">{request.email}</span> },
    { key: "company", label: t("detail.company"), value: request.company ?? <span className="text-ink-3">{t("common.none")}</span> },
    { key: "locale", label: t("detail.locale"), value: language },
    {
      key: "received",
      label: t("detail.received"),
      value: (
        <>
          <time dateTime={request.createdAt}>{formatDateTime(request.createdAt, locale)}</time>
          <span className="ml-2 text-xs text-ink-3">{formatRelative(request.createdAt, locale, nowMs)}</span>
        </>
      ),
    },
    {
      key: "handled",
      label: t("detail.handled"),
      value: request.handledAt ? <time dateTime={request.handledAt}>{formatDateTime(request.handledAt, locale)}</time> : <span className="text-ink-3">{t("common.never")}</span>,
    },
    {
      key: "forwarding",
      label: t("detail.forwarding"),
      value: (
        <>
          <Status tone={DELIVERY_TONE[request.delivery]} indicator="icon" className="text-sm">
            {t(`delivery.${request.delivery}`)}
          </Status>
          {request.deliveryError ? <p className="mt-1 text-xs text-ink-3 break-words">{request.deliveryError}</p> : null}
        </>
      ),
    },
    {
      key: "organization",
      label: t("detail.organization"),
      value: request.organization ? (
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {request.organization.name} <code className="text-xs text-ink-3">{request.organization.slug}</code>
          </span>
          <Link href={organisationHref(request.organization.id)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("common.openOrganization")}
          </Link>
        </span>
      ) : (
        <span className="text-ink-3">{t("detail.organizationNone")}</span>
      ),
    },
    { key: "user", label: t("detail.userLinked"), value: request.userLinked ? t("detail.userLinkedYes") : t("detail.userLinkedNo") },
    { key: "reference", label: t("detail.reference"), value: <code className="text-xs">{request.reference}</code> },
  ];
  return (
    <div className="space-y-6">
      <section aria-labelledby="inbox-message-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="inbox-message-title" className="text-base font-semibold text-ink">
            {t("detail.message")}
          </h2>
          <Badge tone="neutral">{t(`kinds.${request.kind}`)}</Badge>
          <Status tone={STATUS_TONE[request.status]} indicator="icon">
            {t(`status.${request.status}`)}
          </Status>
        </div>
        <p className="mt-3 text-sm whitespace-pre-wrap text-ink" data-testid="inbox-message">
          {request.message}
        </p>
      </section>

      <section aria-labelledby="inbox-facts-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
        <h2 id="inbox-facts-title" className="text-base font-semibold text-ink">
          {t("detail.facts")}
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{f.label}</dt>
              <dd className="mt-0.5 text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="inbox-trail-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
        <h2 id="inbox-trail-title" className="text-base font-semibold text-ink">
          {t("detail.trail.title")}
        </h2>
        <ol className="mt-3 divide-y divide-line text-sm" aria-label={t("detail.trail.caption")}>
          {request.trail.map((entry) => {
            const line = trailLine(t, entry, operatorNames);
            const who = entry.actorUserId ? (entry.actorName ? t("detail.trail.by", { name: entry.actorName }) : t("detail.trail.byUnknown")) : null;
            return (
              <li key={entry.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:gap-4">
                <time dateTime={entry.at} className="shrink-0 text-xs whitespace-nowrap text-ink-3 sm:w-40">
                  {formatDateTime(entry.at, locale)}
                </time>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{line.label}</span>
                  {line.detail ? <span className="text-ink-2"> · {line.detail}</span> : null}
                  {who ? <span className="text-ink-3"> · {who}</span> : null}
                </span>
              </li>
            );
          })}
          <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:gap-4">
            <time dateTime={request.createdAt} className="shrink-0 text-xs whitespace-nowrap text-ink-3 sm:w-40">
              {formatDateTime(request.createdAt, locale)}
            </time>
            <span className="text-ink-2">{t("detail.trail.submitted", { kind: t(`kinds.${request.kind}`) })}</span>
          </li>
        </ol>
        {request.trail.length === 0 ? <p className="mt-2 text-xs text-ink-3">{t("detail.trail.empty")}</p> : null}
      </section>
    </div>
  );
}
