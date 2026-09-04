import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, Badge, Banner, Card, CardContent, CardDescription, CardHeader, CardTitle, Status, buttonVariants } from "@track-site/ui";
import type { DraftDetail } from "@/server/releases";
import type { WorkspaceEnvironment } from "@/server/workspace";
import { DiffList } from "./diff-list";
import { DraftActions } from "./draft-actions";
import { TestEvidence } from "./evidence";
import { formatDateTime, formatRelative } from "./format";
import { criticalReasonLabel, DECISION_TONE, scheduleErrorLabel } from "./labels";

interface DraftPanelProps {
  detail: DraftDetail;
  environment: WorkspaceEnvironment;
  userId: string;
  canPublish: boolean;
  canDraft: boolean;
  locale: string;
}

/**
 * The open draft of the selected environment: who prepared it, what the lint says, the readable diff,
 * the four-eyes state with the approval history, a schedule (or its failure), the test evidence, and
 * the actions (client component). The impact preview is rendered by the page below this panel.
 */
export async function DraftPanel({ detail, environment, userId, canPublish, canDraft, locale }: DraftPanelProps) {
  const t = await getTranslations("releases");
  const envLabel = t(`environment.kind.${environment.kind}`);
  const { draft, fourEyes, approvals } = detail;
  const pending = fourEyes.pending;
  const named = (name: string | null, id: string | null) => name ?? (id ? t("unknownUser") : t("system"));
  const stateText = (() => {
    switch (fourEyes.state) {
      case "satisfied":
        return t("fourEyes.state.satisfied", { name: named(fourEyes.approval?.approverName ?? null, fourEyes.approval?.approverId ?? null), time: fourEyes.approval?.decidedAt ? formatRelative(fourEyes.approval.decidedAt, locale) : "" });
      case "pending":
        return t("fourEyes.state.pending", { name: named(pending?.requestedByName ?? null, pending?.requestedBy ?? null), time: pending ? formatRelative(pending.createdAt, locale) : "" });
      default:
        return t(`fourEyes.state.${fourEyes.state}`);
    }
  })();
  const stateTone = fourEyes.state === "satisfied" ? "ok" : fourEyes.state === "not_required" ? "neutral" : fourEyes.state === "pending" ? "info" : fourEyes.state === "single_publisher" ? "warn" : "bad";

  return (
    <section aria-labelledby="release-draft-title" className="space-y-5" data-testid="release-draft">
      <div>
        <h2 id="release-draft-title" className="text-lg font-semibold text-ink">
          {t("draft.title", { environment: envLabel })}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("draft.intro", { version: draft.nextVersion })}</p>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{t("strip.version", { version: draft.nextVersion })}</CardTitle>
            <Badge tone="info">{draft.baseVersion === null ? t("draft.initial") : t("draft.basedOn", { version: draft.baseVersion })}</Badge>
            {detail.invalid ? (
              <Status tone="bad" chip indicator="both">
                {t("draft.invalid")}
              </Status>
            ) : draft.lintOk ? (
              <Status tone="ok" chip indicator="both">
                {t("draft.lint.ok")}
              </Status>
            ) : (
              <Status tone="bad" chip indicator="both">
                {t("draft.lint.errors", { count: draft.lintErrors })}
              </Status>
            )}
            {draft.lintWarnings > 0 ? (
              <Status tone="warn" chip indicator="both">
                {t("draft.lint.warnings", { count: draft.lintWarnings })}
              </Status>
            ) : null}
          </div>
          <CardDescription>
            {t("draft.author", { name: named(draft.createdByName, draft.createdBy) })} · {t("draft.updated", { time: formatRelative(draft.updatedAt, locale) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {detail.invalid ? <Alert tone="bad" title={t("draft.invalid")}>{t("draft.invalidText")}</Alert> : null}

          {fourEyes.critical ? (
            <Banner tone="warn" title={t("draft.criticalTitle")} data-testid="release-critical">
              <p>{t("draft.criticalText")}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {fourEyes.reasons.map((r) => (
                  <li key={r}>{criticalReasonLabel(t, r)}</li>
                ))}
              </ul>
            </Banner>
          ) : fourEyes.reasons.length ? (
            <div className="text-sm text-ink-2">
              <p className="font-medium text-ink">{t("draft.signalsTitle")}</p>
              <p className="text-ink-3">{t("draft.signalsInfo", { environment: envLabel })}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {fourEyes.reasons.map((r) => (
                  <li key={r}>{criticalReasonLabel(t, r)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {draft.scheduledAt ? (
            <Alert tone={draft.scheduleError ? "bad" : "info"} title={t("draft.schedule.title")}>
              <p>
                {t("draft.schedule.at", { time: formatDateTime(draft.scheduledAt, locale, "long") })}
                {draft.scheduledBy ? <span className="text-ink-3"> · {t("draft.schedule.by", { name: named(draft.scheduledByName, draft.scheduledBy) })}</span> : null}
              </p>
              {draft.scheduleError ? (
                <p className="mt-1">
                  {t("draft.schedule.failed", { reason: scheduleErrorLabel(t, draft.scheduleError) })}
                  {draft.scheduleAttemptedAt ? <span className="text-ink-3"> · {t("draft.schedule.attemptedAt", { time: formatDateTime(draft.scheduleAttemptedAt, locale) })}</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-ink-3">{t("draft.schedule.pendingWorker")}</p>
              )}
            </Alert>
          ) : null}

          <div className="space-y-2" data-testid="release-four-eyes">
            <h3 className="text-sm font-semibold text-ink">{t("fourEyes.title")}</h3>
            <Status tone={stateTone} indicator="icon" className="items-start">
              {stateText}
            </Status>
            <p className="text-xs text-ink-3">{t("fourEyes.publishers", { count: fourEyes.publishers })}</p>
            {approvals.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("fourEyes.history")}</summary>
                <ul className="mt-2 divide-y divide-line rounded-[var(--radius-control)] border border-line">
                  {approvals.map((a) => (
                    <li key={a.id} className="space-y-1 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={DECISION_TONE[a.decision]}>{t(`fourEyes.decision.${a.decision}`)}</Badge>
                        <Badge tone={a.current ? "primary" : "neutral"}>{a.current ? t("fourEyes.current") : t("fourEyes.outdated")}</Badge>
                        <span className="text-ink-2">{t("fourEyes.requestedBy", { name: named(a.requestedByName, a.requestedBy), time: formatRelative(a.createdAt, locale) })}</span>
                        {a.decidedAt && a.decision !== "withdrawn" ? <span className="text-ink-2">· {t("fourEyes.decidedBy", { decision: t(`fourEyes.decision.${a.decision}`), name: named(a.approverName, a.approverId), time: formatRelative(a.decidedAt, locale) })}</span> : null}
                      </div>
                      {a.requestNote ? <p className="text-ink-3">{t("fourEyes.note", { note: a.requestNote })}</p> : null}
                      {a.reason ? <p className="text-ink-3">{t("fourEyes.reasonGiven", { reason: a.reason })}</p> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          <DraftActions
            draftId={draft.id}
            nextVersion={draft.nextVersion}
            environmentLabel={envLabel}
            lintOk={draft.lintOk}
            invalid={detail.invalid}
            scheduledAt={draft.scheduledAt}
            critical={fourEyes.critical}
            fourEyes={{ required: fourEyes.required, state: fourEyes.state, publishers: fourEyes.publishers, pendingId: pending?.id ?? null, pendingRequestedBy: pending?.requestedBy ?? null }}
            userId={userId}
            canPublish={canPublish}
            canDraft={canDraft}
            changes={detail.changes.slice(0, 50).map((c) => c.summary)}
          />
        </CardContent>
      </Card>

      {!detail.lint.ok || detail.lint.warnings.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {detail.lint.errors.length ? (
            <Alert tone="bad" title={t("draft.lint.errorsTitle")}>
              <ul className="space-y-1 text-sm">
                {detail.lint.errors.map((e, i) => (
                  <li key={`${e.code}-${e.path}-${i}`}>
                    <span className="font-mono text-xs">{e.code}</span> <span className="font-mono text-xs text-ink-3">{e.path}</span> — {e.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {detail.lint.warnings.length ? (
            <Alert tone="warn" title={t("draft.lint.warningsTitle")}>
              <ul className="space-y-1 text-sm">
                {detail.lint.warnings.map((w, i) => (
                  <li key={`${w.code}-${w.path}-${i}`}>
                    <span className="font-mono text-xs">{w.code}</span> <span className="font-mono text-xs text-ink-3">{w.path}</span> — {w.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">{t("draft.lint.explain")}</p>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("draft.changesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DiffList changes={detail.changes} destinationNames={detail.destinationNames} />
          </CardContent>
        </Card>
        <Card variant="flat">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{t("draft.evidence.title")}</CardTitle>
              <CardDescription>{t("draft.evidence.intro")}</CardDescription>
            </div>
            <Link href="/app/events/test-lab" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("links.testLab")}
            </Link>
          </CardHeader>
          <CardContent>
            <TestEvidence runs={detail.evidence.runs} available={detail.evidence.available} emptyText={t("draft.evidence.empty")} locale={locale} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
