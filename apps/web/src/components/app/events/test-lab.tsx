"use client";

import { FlaskConical, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert, Badge, Button, Dialog, Radio, Status, TBody, Table, Td, Th, THead, Tr, cn } from "@track-site/ui";
import type { TestLabJourney } from "@track-site/db/schema";
import type { RedactedAttempt, TestLabRunSummary, TestLabTimeline } from "@/server/events";
import { runTestLabAction, type TestLabActionState } from "@/server/events-actions";
import { formatDateTime, formatTime } from "./format";
import { LineageTimeline, useReasonLabel } from "./timeline";
import { STEP_TONE } from "./tones";

const JOURNEYS: readonly TestLabJourney[] = ["page_view", "lead", "add_to_cart", "checkout", "purchase"];
const JOURNEY_STEPS: Record<TestLabJourney, readonly string[]> = {
  page_view: ["page_view"],
  lead: ["page_view", "generate_lead"],
  add_to_cart: ["page_view", "view_item", "add_to_cart"],
  checkout: ["page_view", "view_item", "add_to_cart", "begin_checkout"],
  purchase: ["page_view", "begin_checkout", "purchase", "duplicate_purchase"],
};
type ConsentChoice = "all" | "analytics" | "none";
const CONSENTS: readonly ConsentChoice[] = ["all", "analytics", "none"];
const POLL_MS = 2_000;
const POLL_MAX_MS = 90_000;

export interface TestLabProps {
  siteId: string;
  environment: { id: string; kind: string; name: string } | null;
  ingestHost: string | null;
  canRun: boolean;
  available: boolean;
  runs: TestLabRunSummary[];
  initialTimeline: TestLabTimeline | null;
}

function consentChoiceOf(run: TestLabRunSummary): ConsentChoice {
  if (run.consent.source === "default") return "none";
  return run.consent.granted.includes("marketing") ? "all" : "analytics";
}

function AttemptRow({ attempt, name }: { attempt: RedactedAttempt; name: string }) {
  const t = useTranslations("events.explorer.detail");
  const reason = useReasonLabel();
  const tone = attempt.status === "success" ? "ok" : attempt.status === "skipped" ? "neutral" : attempt.status === "retry" ? "warn" : "bad";
  return (
    <li className="rounded-[var(--radius-control)] border border-line p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{name}</span>
        <span className="font-mono text-ink-3">{attempt.connectorType}</span>
        <Status tone={tone} chip indicator="both">
          {t(`attemptStatus.${attempt.status}`)}
        </Status>
        <span className="ml-auto tabular-nums text-ink-3">
          {attempt.httpStatus ? t("http", { status: attempt.httpStatus }) : "—"} · {t("duration", { ms: attempt.durationMs ?? 0 })}
        </span>
      </div>
      {attempt.status !== "success" ? <p className="mt-1 text-bad">{[reason(attempt.errorClass !== "none" ? attempt.errorClass : null), reason(attempt.errorCode), attempt.errorMessage].filter(Boolean).join(" · ")}</p> : null}
      {attempt.payloadPreview ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-2">{t("payload")}</summary>
          <pre className="mt-1 max-h-56 overflow-auto rounded-[var(--radius-control-sm)] bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(attempt.payloadPreview, null, 2)}</pre>
        </details>
      ) : null}
      {attempt.responseExcerpt ? (
        <p className="mt-2 break-words text-ink-3">
          {t("response")}: <span className="font-mono">{attempt.responseExcerpt}</span>
        </p>
      ) : null}
    </li>
  );
}

function TimelineView({ timeline, waitedTooLong }: { timeline: TestLabTimeline; waitedTooLong: boolean }) {
  const t = useTranslations("events");
  const tl = useTranslations("events.testLab");
  const locale = useLocale();
  const run = timeline.run;
  const runTone = run.status === "sent" ? (timeline.complete ? "ok" : "info") : run.status === "pending" ? "neutral" : "bad";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Status tone={runTone} chip indicator="both" live>
          {tl(`runs.status.${run.status}`)}
          {run.status === "sent" ? ` · ${timeline.complete ? tl("timeline.complete") : tl("timeline.incomplete")}` : ""}
        </Status>
        <span className="text-ink-3">{formatDateTime(run.createdAt, locale, "long")}</span>
        {run.collectorStatus !== null ? <span className="text-ink-3">{tl("collector.status", { status: run.collectorStatus })}</span> : null}
        {run.batchId ? <span className="font-mono text-xs text-ink-3">{run.batchId}</span> : null}
      </div>
      {run.status === "rejected" || run.status === "failed" ? (
        <Alert tone="bad" title={tl(`errors.${run.status === "rejected" ? "collector" : "unreachable"}`)}>
          {run.collectorReason ? tl("collector.reason", { reason: run.collectorReason }) : null}
        </Alert>
      ) : null}
      {run.status === "sent" && !timeline.complete ? (
        <Alert tone={waitedTooLong ? "warn" : "info"} title={waitedTooLong ? tl("timeline.workerHint") : tl("timeline.waiting")}>
          {waitedTooLong ? tl("timeline.workerHintText") : tl("timeline.waitingText")}
        </Alert>
      ) : null}
      <ol className="space-y-4">
        {timeline.steps.map((s, i) => (
          <li key={s.step.sourceEventId} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">
                {tl("timeline.step", { n: i + 1 })} · {tl(`steps.${s.step.kind}`)}
              </h3>
              <span className="font-mono text-xs text-ink-3">{s.step.name}</span>
              {s.pending ? (
                <Status tone="neutral" chip indicator="both">
                  {tl("timeline.pending")}
                </Status>
              ) : (
                <Status tone={STEP_TONE[s.summary.tone]} chip indicator="both">
                  {t(`stages.${s.summary.stage}`)} · {t(`outcomes.${s.summary.outcome}`)}
                </Status>
              )}
              {s.event ? (
                <span className="ml-auto text-xs tabular-nums text-ink-3">
                  {formatTime(s.event.serverTs, locale, true)} · {s.event.isBillable ? tl("timeline.billable") : tl("timeline.notBillable")}
                </span>
              ) : null}
            </div>
            {s.pending ? (
              <p className="mt-2 text-sm text-ink-3">{tl("timeline.pendingText")}</p>
            ) : (
              <div className="mt-3 space-y-3">
                <LineageTimeline steps={s.timeline} integrations={timeline.integrations} />
                {s.event ? (
                  <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-ink-3">{tl("timeline.consentDecision")}</dt>
                    <dd className="text-ink">
                      {s.event.consent.granted.join(", ") || t("explorer.detail.fields.noPurposes")} · {s.event.consent.source}
                    </dd>
                    <dt className="text-ink-3">{tl("timeline.identity")}</dt>
                    <dd className="font-mono text-ink">{[s.event.identity.anonymousId && `${t("explorer.detail.identityKind.anonymous")} ${s.event.identity.anonymousId}`, s.event.identity.sessionId && `${t("explorer.detail.identityKind.session")} ${s.event.identity.sessionId}`].filter(Boolean).join(" · ") || t("explorer.detail.strippedIdentity")}</dd>
                    {s.event.commerce ? (
                      <>
                        <dt className="text-ink-3">{t("explorer.detail.fields.commerce")}</dt>
                        <dd className="text-ink">{t("explorer.detail.fields.commerceValue", { orderId: s.event.commerce.orderId ?? "—", value: s.event.commerce.value ?? "—", currency: s.event.commerce.currency ?? "—", items: s.event.commerce.items })}</dd>
                      </>
                    ) : null}
                    {s.event.props ? (
                      <>
                        <dt className="text-ink-3">{t("explorer.detail.fields.props")}</dt>
                        <dd className="font-mono text-ink">{JSON.stringify(s.event.props)}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {s.attempts.length ? (
                  <ul className="space-y-2">
                    {s.attempts.map((a) => (
                      <AttemptRow key={a.id} attempt={a} name={timeline.integrations[a.integrationId]?.name ?? a.integrationId} />
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Live Test Lab (supplement §8 module 5): guided journeys through the real collector in the test environment, with confirmation, audit and a live timeline. */
export function TestLab({ siteId, environment, ingestHost, canRun, available, runs, initialTimeline }: TestLabProps) {
  const t = useTranslations("events");
  const tl = useTranslations("events.testLab");
  const locale = useLocale();
  const [journey, setJourney] = useState<TestLabJourney>("page_view");
  const [consent, setConsent] = useState<ConsentChoice>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestLabActionState | null>(null);
  const [timeline, setTimeline] = useState<TestLabTimeline | null>(initialTimeline);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialTimeline?.run.id ?? null);
  const [history, setHistory] = useState<TestLabRunSummary[]>(runs);
  const [polling, setPolling] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [loadError, setLoadError] = useState<"stale" | "failed" | null>(null);
  const pollStart = useRef(0);

  const loadTimeline = useCallback(
    async (runId: string): Promise<TestLabTimeline | null> => {
      try {
        const res = await fetch(`/api/app/events/test-lab/${runId}?site=${siteId}`, { cache: "no-store" });
        if (res.status === 409) {
          setLoadError("stale");
          return null;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { timeline: TestLabTimeline };
        setLoadError(null);
        setTimeline(data.timeline);
        setHistory((prev) => prev.map((r) => (r.id === data.timeline.run.id ? data.timeline.run : r)));
        return data.timeline;
      } catch {
        setLoadError("failed");
        return null;
      }
    },
    [siteId],
  );

  useEffect(() => {
    if (!polling || !activeRunId) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const tlv = await loadTimeline(activeRunId);
      const elapsed = Date.now() - pollStart.current;
      if (tlv?.complete || elapsed > POLL_MAX_MS) {
        setPolling(false);
        if (tlv && !tlv.complete) setWaitedTooLong(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [polling, activeRunId, loadTimeline]);

  const open = (runId: string) => {
    setActiveRunId(runId);
    setWaitedTooLong(false);
    pollStart.current = Date.now();
    void loadTimeline(runId).then((tlv) => {
      if (tlv && tlv.run.status === "sent" && !tlv.complete) setPolling(true);
    });
  };

  const run = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const state = await runTestLabAction({ siteId, journey, consent, confirmed: true });
      setResult(state);
      if (state.runId) {
        setHistory((prev) => [{ id: state.runId!, journey, consent: { granted: consent === "none" ? ["necessary"] : consent === "all" ? ["necessary", "analytics", "marketing"] : ["necessary", "analytics"], source: consent === "none" ? "default" : "api", region: "DE" }, status: state.ok ? "sent" : state.error === "collector" ? "rejected" : "failed", collectorStatus: state.collectorStatus, collectorReason: state.collectorReason, batchId: null, steps: [], error: state.collectorReason, createdAt: new Date().toISOString(), sentAt: null, environmentId: environment?.id ?? "" }, ...prev]);
        open(state.runId);
      }
    });
  };

  const steps = JOURNEY_STEPS[journey];
  const runDisabled = !canRun || !available || !environment || pending;

  return (
    <div className="space-y-6">
      {!available ? (
        <Alert tone="warn" title={tl("unavailable")}>
          {tl("unavailableText")}
        </Alert>
      ) : null}
      {!environment ? (
        <Alert tone="warn" title={tl("environment.none")}>
          {tl("environment.noneText")}
        </Alert>
      ) : (
        <p className="text-sm text-ink-2">{tl("environment.sending", { environment: environment.name, kind: t(`module.environment.${environment.kind}`), host: ingestHost ?? "—" })}</p>
      )}
      {!canRun ? <Alert tone="info">{tl("permission")}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <fieldset className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{tl("journeys.label")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {JOURNEYS.map((j) => (
              <Radio
                key={j}
                name="journey"
                value={j}
                checked={journey === j}
                onChange={() => setJourney(j)}
                label={tl(`journeys.${j}.title`)}
                description={
                  <>
                    {tl(`journeys.${j}.text`)}
                    <span className="mt-1 block font-mono text-[11px]">{JOURNEY_STEPS[j].map((s) => tl(`steps.${s}`)).join(" → ")}</span>
                  </>
                }
                className={cn("rounded-[var(--radius-control)] border px-3 transition-colors duration-[var(--motion-fast)]", journey === j ? "border-primary bg-primary-soft/40" : "border-line hover:border-line-2")}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{tl("consent.label")}</legend>
          <div className="mt-2 space-y-2">
            {CONSENTS.map((c) => (
              <Radio
                key={c}
                name="consent"
                value={c}
                checked={consent === c}
                onChange={() => setConsent(c)}
                label={tl(`consent.${c}.title`)}
                description={tl(`consent.${c}.text`)}
                className={cn("rounded-[var(--radius-control)] border px-3 transition-colors duration-[var(--motion-fast)]", consent === c ? "border-primary bg-primary-soft/40" : "border-line hover:border-line-2")}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => setConfirmOpen(true)} disabled={runDisabled} loading={pending} leadingIcon={<FlaskConical className="size-4" aria-hidden="true" />}>
              {tl("run")}
            </Button>
            <span className="text-xs text-ink-3">{tl("confirm.events", { n: steps.length })}</span>
          </div>
          <p className="mt-3 text-xs text-ink-3">{tl("notes.audited")}</p>
        </fieldset>
      </div>

      {result && !result.ok ? (
        <Alert tone="bad" title={tl(`errors.${result.error ?? "generic"}`)}>
          {result.collectorStatus !== null ? `${tl("collector.status", { status: result.collectorStatus })} ` : ""}
          {result.collectorReason ? tl("collector.reason", { reason: result.collectorReason }) : ""}
        </Alert>
      ) : null}
      {result?.ok ? <Alert tone="ok">{tl("collector.accepted", { status: result.collectorStatus ?? 202 })}</Alert> : null}
      {loadError === "stale" ? <Alert tone="warn">{t("explorer.stale")}</Alert> : null}
      {loadError === "failed" ? <Alert tone="bad">{t("common.error")}</Alert> : null}

      <section aria-labelledby="tl-timeline" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tl-timeline" className="text-base font-semibold text-ink">
            {tl("timeline.title")}
          </h2>
          {timeline ? (
            <div className="flex items-center gap-3 text-xs text-ink-3">
              <span role="status" aria-live="polite">
                {t("common.lastUpdated", { time: formatTime(timeline.updatedAt, locale) })}
                {polling ? ` · ${tl("timeline.autoRefresh")}` : ""}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => activeRunId && open(activeRunId)} leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}>
                {t("common.refresh")}
              </Button>
            </div>
          ) : null}
        </div>
        {timeline ? <TimelineView timeline={timeline} waitedTooLong={waitedTooLong} /> : <p className="text-sm text-ink-3">{tl("timeline.none")}</p>}
      </section>

      <section aria-labelledby="tl-runs" className="rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <h2 id="tl-runs" className="text-sm font-semibold text-ink">
            {tl("runs.title")}
          </h2>
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">{tl("runs.empty")}</p>
        ) : (
          <Table caption={tl("runs.title")}>
            <THead>
              <tr>
                <Th>{tl("runs.columns.time")}</Th>
                <Th>{tl("runs.columns.journey")}</Th>
                <Th>{tl("runs.columns.consent")}</Th>
                <Th>{tl("runs.columns.status")}</Th>
                <Th>{tl("runs.columns.collector")}</Th>
                <Th>
                  <span className="sr-only">{t("common.actions")}</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {history.map((r) => (
                <Tr key={r.id} className={cn(r.id === activeRunId && "bg-primary-soft/40 hover:bg-primary-soft/40")}>
                  <Td label={tl("runs.columns.time")} className="whitespace-nowrap text-xs tabular-nums text-ink-3">
                    {formatDateTime(r.createdAt, locale)}
                  </Td>
                  <Td label={tl("runs.columns.journey")} className="text-sm">
                    {tl(`journeys.${r.journey as TestLabJourney}.title`)}
                  </Td>
                  <Td label={tl("runs.columns.consent")} className="text-xs">
                    {tl(`consent.${consentChoiceOf(r)}.title`)}
                  </Td>
                  <Td label={tl("runs.columns.status")}>
                    <Status tone={r.status === "sent" ? "ok" : r.status === "pending" ? "neutral" : "bad"} chip indicator="both">
                      {tl(`runs.status.${r.status}`)}
                    </Status>
                  </Td>
                  <Td label={tl("runs.columns.collector")} className="text-xs text-ink-2">
                    {r.collectorStatus !== null ? t("explorer.detail.http", { status: r.collectorStatus }) : "—"}
                    {r.collectorReason ? ` · ${r.collectorReason}` : ""}
                    {r.batchId ? (
                      <>
                        {" · "}
                        <Badge>{r.batchId.slice(-8)}</Badge>
                      </>
                    ) : null}
                  </Td>
                  <Td label={t("common.actions")} className="text-right">
                    <Button type="button" size="sm" variant={r.id === activeRunId ? "secondary" : "ghost"} aria-pressed={r.id === activeRunId} onClick={() => open(r.id)}>
                      {tl("runs.open")}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={tl("confirm.title")}
        description={tl("confirm.text")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              {tl("confirm.cancel")}
            </Button>
            <Button type="button" onClick={run}>
              {tl("confirm.confirm")}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-3">{tl("confirm.journey")}</dt>
          <dd className="text-ink">
            {tl(`journeys.${journey}.title`)} · {tl("confirm.events", { n: steps.length })}
          </dd>
          <dt className="text-ink-3">{tl("confirm.environment")}</dt>
          <dd className="text-ink">{environment ? `${environment.name} (${t(`module.environment.${environment.kind}`)})` : "—"}</dd>
          <dt className="text-ink-3">{tl("confirm.consent")}</dt>
          <dd className="text-ink">{tl(`consent.${consent}.title`)}</dd>
          <dt className="text-ink-3">{tl("confirm.collector")}</dt>
          <dd className="font-mono text-ink">{ingestHost ?? "—"}</dd>
        </dl>
        <p className="mt-3 text-ink-2">{tl("confirm.nothingProduction")}</p>
      </Dialog>
    </div>
  );
}
