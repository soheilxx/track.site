import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Status, buttonVariants, type Tone } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { CommandCenterData, NextAction, Severity } from "@/server/command-center";
import { formatDateTime, formatPercent, formatRelative } from "./format";

export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "bad", warn: "warn", info: "info" };

type T = Awaited<ReturnType<typeof getTranslations<"commandCenter">>>;

/** keys that ICU `plural` needs as numbers; every other number is pre-formatted for the locale */
const PLURAL_KEYS = new Set(["count"]);
/** percent values (0–100) rendered with the locale's percent style */
const PERCENT_KEYS = new Set(["pct", "thresholdPct", "criticalPct", "nextPct"]);
/** ISO timestamps rendered as date + time in the site's zone */
const TIME_KEYS = new Set(["lastAt"]);

function localizeParams(params: NextAction["params"], locale: string, timeZone: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number") out[key] = PLURAL_KEYS.has(key) ? value : PERCENT_KEYS.has(key) ? formatPercent(value, locale) : formatNumber(value, locale, { maximumFractionDigits: 1 });
    else out[key] = TIME_KEYS.has(key) && value ? formatDateTime(value, locale, timeZone) : value;
  }
  return out;
}

/** Localized title, explanation, call to action and rule text of one action. */
export function actionText(t: T, action: NextAction, locale: string, timeZone: string) {
  const params = localizeParams(action.params, locale, timeZone);
  // technical identifiers that have a localized label: the overage policy and the consent policy status (the ICU select keeps matching on the raw value where it must)
  if (typeof params.policy === "string" && t.has(`strip.usage.policies.${params.policy}`)) params.policy = t(`strip.usage.policies.${params.policy}` as "strip.usage.policies.pause");
  if (action.id === "no_consent_policy" && typeof params.status === "string" && params.status !== "none" && t.has(`strip.consent.status.${params.status}`)) params.status = t(`strip.consent.status.${params.status}` as "strip.consent.status.draft");
  return {
    title: t(`actions.${action.id}.title`, params),
    why: t(`actions.${action.id}.why`, params),
    cta: t(`actions.${action.id}.cta`),
    rule: t(`actions.${action.id}.rule`, params),
  };
}

function SkippedNote({ t, data }: { t: T; data: CommandCenterData }) {
  if (data.skipped.length === 0) return null;
  const seen = new Set<string>();
  const items = data.skipped.filter((s) => (seen.has(s.measurement) ? false : (seen.add(s.measurement), true)));
  return (
    <div className="text-xs text-ink-3">
      <p className="font-medium text-ink-2">{t("priority.none.skippedTitle")}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((s) => (
          <li key={s.measurement}>{t("priority.none.skippedReason", { check: t(`measurements.${s.measurement}`), reason: t(`priority.skipped.${s.status}`) })}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The top of the Command Center: the single most important next action (with its measured reason
 * and the rule that produced it) beside the list of everything else that needs attention. Rules and
 * thresholds are explained in place; an empty result names the checks that ran and the ones that
 * could not.
 */
export async function PrioritySection({ data, locale, timeZone }: { data: CommandCenterData; locale: string; timeZone: string }) {
  const t = await getTranslations("commandCenter");
  const now = new Date(data.facts.now);
  const [next, ...rest] = data.actions;
  const measuredAbs = formatDateTime(data.facts.now, locale, timeZone);
  return (
    <section aria-labelledby="cc-priority-heading" className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <h2 id="cc-priority-heading" className="sr-only">
        {t("priority.heading")}
      </h2>

      {next ? (
        <article className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-card sm:p-6" data-testid="cc-next-action">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("priority.nextAction")}</p>
            <Status tone={SEVERITY_TONE[next.severity]} chip indicator="both">
              {t(`severity.${next.severity}`)}
            </Status>
          </div>
          {(() => {
            const text = actionText(t, next, locale, timeZone);
            return (
              <>
                <h3 className="mt-3 text-xl font-semibold text-ink">{text.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{text.why}</p>
                <p className="mt-2 text-xs text-ink-3">
                  {t("priority.measuredLabel", { time: next.measuredAt ? formatRelative(next.measuredAt, now, locale) : measuredAbs })}
                  {next.measuredAt ? ` · ${formatDateTime(next.measuredAt, locale, timeZone)}` : null}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link href={next.href} className={buttonVariants()} data-testid="cc-next-action-cta">
                    {text.cta}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
                <details className="mt-4 rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 text-sm">
                  {/* default display (list-item) keeps the native disclosure marker visible */}
                  <summary className="min-h-11 cursor-pointer py-3 font-medium text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("priority.howDecided")}</summary>
                  <div className="space-y-2 pb-3 text-ink-2">
                    <p>{t("priority.rulesIntro")}</p>
                    <p>
                      <span className="font-medium text-ink">{t("priority.ruleLabel")}:</span> {text.rule}
                    </p>
                  </div>
                </details>
              </>
            );
          })()}
        </article>
      ) : (
        <article className="rounded-[var(--radius-panel)] border border-ok/30 bg-ok-soft p-5 sm:p-6" data-testid="cc-next-action">
          <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("priority.nextAction")}</p>
          <div className="mt-3">
            <Status tone="ok" indicator="both" className="text-xl font-semibold text-ink">
              {t("priority.none.title")}
            </Status>
          </div>
          <p className="mt-2 text-sm text-ink-2">{t("priority.none.text", { checked: data.checked.length, time: measuredAbs })}</p>
          <div className="mt-4 space-y-3">
            <div className="text-xs text-ink-3">
              <p className="font-medium text-ink-2">{t("priority.none.checkedTitle")}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {data.checked.map((id) => (
                  <li key={id} className="rounded-[var(--radius-chip)] border border-ok/30 bg-surface px-2 py-0.5">
                    {t(`checks.${id}`)}
                  </li>
                ))}
              </ul>
            </div>
            <SkippedNote t={t} data={data} />
          </div>
        </article>
      )}

      <div className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="cc-attention">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold text-ink">{t("priority.attention")}</h3>
          <span className="text-xs text-ink-3">{t("priority.attentionCount", { n: rest.length })}</span>
        </div>
        {rest.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-3">{t("priority.attentionEmpty", { n: data.checked.length })}</p>
        ) : (
          <ol className="divide-y divide-line">
            {rest.map((action) => {
              const text = actionText(t, action, locale, timeZone);
              return (
                <li key={action.id}>
                  <Link href={action.href} className="flex min-h-11 items-start gap-3 px-5 py-3 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                    <Status tone={SEVERITY_TONE[action.severity]} chip indicator="both" className="mt-0.5 shrink-0">
                      {t(`severity.${action.severity}`)}
                    </Status>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{text.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-ink-3">{text.why}</span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        {next && data.skipped.length > 0 ? (
          <div className="border-t border-line px-5 py-3">
            <SkippedNote t={t} data={data} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
