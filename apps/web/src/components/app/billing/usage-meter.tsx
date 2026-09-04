import { getLocale, getTranslations } from "next-intl/server";
import { Status, cn, type Tone } from "@track-site/ui";
import type { PolicyState, ThresholdState } from "@/server/usage";
import { count, formatDateTime, percent } from "./format";

const FILL: Record<Tone, string> = { ok: "bg-primary", info: "bg-info", warn: "bg-warn", bad: "bg-bad", neutral: "bg-ink-3" };

/**
 * Meter of the current period against the plan's monthly limit with the 70 / 90 / 100 % warning
 * thresholds and their state (reached and stamped by the usage check, reached but not stamped yet,
 * expected on a date from the forecast, or not expected this period), plus the point at which the
 * chosen policy pauses processing. Colour is always accompanied by text.
 */
export async function UsageMeter({ billable, limit, thresholds, policy, hardLimitHitAt }: { billable: number; limit: number; thresholds: ThresholdState[]; policy: PolicyState; hardLimitHitAt: Date | null }) {
  const t = await getTranslations("billingUsage.meter");
  const locale = await getLocale();
  const ratio = billable / limit;
  const tone: Tone = ratio >= 1 ? "bad" : ratio >= 0.9 ? "warn" : ratio >= 0.7 ? "info" : "ok";
  const valueText = t("valueText", { used: count(billable, locale), limit: count(limit, locale), pct: percent(ratio, locale) });
  return (
    <section aria-labelledby="usage-meter-title" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 id="usage-meter-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p>
          <span className="font-semibold text-ink tabular-nums">{count(billable, locale)}</span> <span className="text-ink-3">{t("used")}</span>
        </p>
        <p className="text-ink-3 tabular-nums">
          {t("limit")} {count(limit, locale)} · {percent(ratio, locale)}
        </p>
      </div>
      <div role="progressbar" aria-label={t("title")} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(billable, limit)} aria-valuetext={valueText} className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", FILL[tone])} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        {thresholds
          .filter((th) => th.pct < 100)
          .map((th) => (
            <span key={th.pct} aria-hidden="true" className="absolute inset-y-0 w-px bg-ink-2/50" style={{ left: `${th.pct}%` }} />
          ))}
      </div>
      {ratio > 1 ? (
        <p className="mt-2 text-sm text-bad">
          <Status tone="bad" indicator="icon">
            {t("exceeded", { events: count(billable - limit, locale) })}
          </Status>
        </p>
      ) : null}
      <h3 className="mt-5 text-sm font-medium text-ink">{t("thresholds.title")}</h3>
      <ol className="mt-1 divide-y divide-line">
        {thresholds.map((th) => {
          let stateTone: Tone;
          let text: string;
          if (th.reached && th.warnedAt) {
            stateTone = th.pct >= 100 ? "bad" : th.pct >= 90 ? "warn" : "info";
            text = t("thresholds.reached", { at: formatDateTime(th.warnedAt, locale) });
          } else if (th.reached) {
            stateTone = th.pct >= 100 ? "bad" : "warn";
            text = t("thresholds.reachedPending");
          } else if (th.expectedAt) {
            stateTone = "neutral";
            text = t("thresholds.expected", { at: formatDateTime(th.expectedAt, locale), remaining: count(th.remaining, locale) });
          } else {
            stateTone = "neutral";
            text = t("thresholds.notExpected", { remaining: count(th.remaining, locale) });
          }
          return (
            <li key={th.pct} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-baseline gap-2">
                <span className="w-12 font-semibold text-ink tabular-nums">{t("thresholds.threshold", { pct: th.pct })}</span>
                <span className="text-ink-3 tabular-nums">{t("thresholds.events", { events: count(th.events, locale) })}</span>
              </div>
              <Status tone={stateTone} indicator={th.reached ? "icon" : "dot"} className="text-sm font-normal">
                {text}
              </Status>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm text-ink-2">
        {policy.pauseAtEvents != null ? t("pauseAt", { events: count(policy.pauseAtEvents, locale), pct: percent(policy.pauseAtEvents / limit, locale) }) : t("neverPauses")}
        {hardLimitHitAt ? <span className="ml-2 text-bad">{t("hardLimitAt", { at: formatDateTime(hardLimitHitAt, locale) })}</span> : null}
      </p>
    </section>
  );
}
