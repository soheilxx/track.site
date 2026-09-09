import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Status } from "@track-site/ui";
import type { SlaClockView, SlaView } from "@/server/support/ticket";
import { formatDateTime, formatDuration } from "./format";
import { SLA_TONE } from "./labels";
import { LiveRemaining } from "./live-remaining";

type Translate = Awaited<ReturnType<typeof getTranslations<"supportTicket">>>;

function Clock({ label, clock, locale, t, paused }: { label: string; clock: SlaClockView; locale: string; t: Translate; paused: boolean }) {
  const remaining = clock.remainingMs;
  let detail: ReactNode = null;
  if (clock.state === "none") detail = <span className="text-ink-3">{t("sla.notMeasured")}</span>;
  else if (clock.state === "met" && remaining != null) detail = t("sla.metWith", { duration: formatDuration(remaining, locale) });
  else if (clock.state === "late" && remaining != null) detail = t("sla.lateBy", { duration: formatDuration(-remaining, locale) });
  else if (clock.state === "paused" && remaining != null) detail = t("sla.pausedWith", { duration: formatDuration(remaining, locale) });
  else if (clock.dueAt) detail = <LiveRemaining dueAt={clock.dueAt} initialRemainingMs={remaining ?? 0} locale={locale} />;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{label}</dt>
      <dd className="mt-0.5 space-y-0.5 text-sm text-ink">
        <Status tone={SLA_TONE[clock.state]} indicator="icon" className="text-sm" data-testid={`ticket-sla-${clock.state}`}>
          {t(`sla.states.${clock.state}`)}
        </Status>
        <div>{detail}</div>
        {clock.dueAt ? (
          <div className="text-xs text-ink-3">
            {t("sla.due")}: <time dateTime={clock.dueAt}>{formatDateTime(clock.dueAt, locale)}</time>
            {paused ? ` · ${t("sla.dueShifts")}` : null}
          </div>
        ) : null}
        {clock.completedAt ? (
          <div className="text-xs text-ink-3">
            {t("sla.completed")}: <time dateTime={clock.completedAt}>{formatDateTime(clock.completedAt, locale)}</time>
          </div>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * First response and resolution clocks from real timestamps; "no policy" and "not measured" instead of
 * guesses. An agent-created ticket whose clocks wait for the first customer reply (task N) says so — its
 * policy is recorded, but nothing is due until the customer answers.
 */
export async function SlaPanel({ sla, locale, pendingFirstCustomerReply = false }: { sla: SlaView; locale: string; pendingFirstCustomerReply?: boolean }) {
  const [t, tv, tt] = await Promise.all([getTranslations("supportTicket"), getTranslations("support"), getTranslations("supportTeams.queue")]);
  return (
    <section aria-labelledby="ticket-sla-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" data-testid="ticket-sla">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ticket-sla-title" className="text-base font-semibold text-ink">
          {t("sla.title")}
        </h2>
        <span className="text-xs text-ink-3">{sla.policy ? sla.policy.name : tv("sla.noPolicy")}</span>
      </div>
      {pendingFirstCustomerReply ? (
        <Status tone="info" indicator="icon" className="mt-2 text-sm" data-testid="ticket-sla-pending">
          {tt("slaPending")}
        </Status>
      ) : null}
      {sla.paused ? (
        <p className="mt-2 text-xs text-ink-2" data-testid="ticket-sla-paused">
          {tv("sla.paused")}
          {sla.pausedSince ? ` · ${t("sla.pausedSince", { date: formatDateTime(sla.pausedSince, locale) ?? "" })}` : null}
        </p>
      ) : null}
      {sla.pauseTotalMs > 0 ? <p className="mt-1 text-xs text-ink-3">{t("sla.pauseTotal", { duration: formatDuration(sla.pauseTotalMs, locale) })}</p> : null}
      {sla.resolutionRestartedAt ? (
        <p className="mt-1 text-xs text-ink-3" data-testid="ticket-sla-restarted">
          {t("sla.restartedAt", { date: formatDateTime(sla.resolutionRestartedAt, locale) ?? "" })}
        </p>
      ) : null}
      <dl className="mt-3 grid gap-4">
        <Clock label={tv("sla.firstResponse")} clock={sla.firstResponse} locale={locale} t={t} paused={sla.paused} />
        <Clock label={tv("sla.resolution")} clock={sla.resolution} locale={locale} t={t} paused={sla.paused} />
      </dl>
      {!sla.policy ? <p className="mt-3 text-xs text-ink-3">{t("sla.noPolicyText")}</p> : null}
    </section>
  );
}
