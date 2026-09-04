import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Status, buttonVariants } from "@track-site/ui";
import type { ObservedAfterPublish, TestRunView } from "@/server/releases";
import { formatCount, formatDateTime, formatRelative } from "./format";
import { ENVIRONMENT_TONE, RUN_STATUS_TONE, journeyLabel, runStatusLabel } from "./labels";

/**
 * Test evidence of a draft or a version: the Live Test Lab runs of the relevant window (each links
 * to its timeline) and — for a published version — what the pipeline stored with that version.
 * Nothing here is derived: an empty list means no run was recorded.
 */
export async function TestEvidence({ runs, available, observed, emptyText, locale }: { runs: TestRunView[]; available: boolean; observed?: ObservedAfterPublish | null; emptyText: string; locale: string }) {
  const t = await getTranslations("releases");
  return (
    <div className="space-y-3">
      {!available ? (
        <p className="text-sm text-ink-3">{t("draft.evidence.unavailable")}</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-ink-3">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium text-ink">{journeyLabel(t, run.journey)}</span>
              <Status tone={RUN_STATUS_TONE[run.status] ?? "neutral"} chip indicator="both">
                {runStatusLabel(t, run.status)}
              </Status>
              {run.environmentKind ? (
                <Status tone={ENVIRONMENT_TONE[run.environmentKind]} className="text-xs">
                  {t(`environment.kind.${run.environmentKind}`)}
                </Status>
              ) : null}
              <span className="text-xs text-ink-3">
                {t("draft.evidence.steps", { count: run.steps })} · <time dateTime={run.createdAt}>{formatRelative(run.createdAt, locale)}</time>
              </span>
              {run.error ? <span className="text-xs text-bad">{run.error}</span> : null}
              <Link href={`/app/events/test-lab?run=${run.id}`} className={`${buttonVariants({ variant: "ghost", size: "sm" })} ml-auto`}>
                {t("draft.evidence.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {observed !== undefined ? (
        observed ? (
          <p className="text-sm text-ink-2" data-testid="release-observed">
            {t("version.evidence.observed", { count: observed.count, since: formatDateTime(observed.since, locale) })}
            {observed.firstAt && observed.lastAt ? <span className="text-ink-3"> · {t("version.evidence.observedRange", { first: formatDateTime(observed.firstAt, locale), last: formatDateTime(observed.lastAt, locale) })}</span> : null}
            {observed.count > 0 ? <span className="sr-only"> {formatCount(observed.count, locale)}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-ink-3">{t("version.evidence.observedUnavailable")}</p>
        )
      ) : null}
    </div>
  );
}
