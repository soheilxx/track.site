import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard, Status, TBody, THead, Table, Td, Th, Tr, buttonVariants, type Tone } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { FIELD_GROUPS, type DispatchOutcome, type FieldGroup, type PersistenceOutcome, type SimDestination, type SimulationResult } from "@/server/consent-simulator";
import { connectorLabel, purposeLabel, regionGroupLabel, regionModeLabel, signalLabel, type TranslateFn } from "./labels";

const PERSIST_TONE: Record<PersistenceOutcome["status"], Tone> = { allowed: "ok", reduced: "warn", blocked: "neutral" };
const DISPATCH_TONE: Record<DispatchOutcome["status"], Tone> = { forwarded: "ok", blocked: "neutral" };

interface SimulationResultsProps {
  result: SimulationResult;
  policyLabel: string;
  countryName: string;
  locale: string;
}

/** Everything the simulation produced, in reading order: scenario → counts → data flow → consent mode → table → legend. */
export async function SimulationResults({ result, policyLabel, countryName, locale }: SimulationResultsProps) {
  const t = await getTranslations("consent.simulator.result");
  const ts = await getTranslations("consent.simulator");
  const tc = await getTranslations("consent");
  const { summary, destinations, rows } = result;
  const fieldList = (groups: FieldGroup[]) => groups.map((g) => ts(`fields.${g}`)).join(", ");

  return (
    <div className="space-y-6">
      <Card variant="flat">
        <CardHeader>
          <CardTitle>{t("scenario")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="font-medium text-ink-2">{t("policyUsed")}</dt>
            <dd className="text-ink">{policyLabel}</dd>
            <dt className="font-medium text-ink-2">{t("region")}</dt>
            <dd className="text-ink">{t("regionValue", { country: countryName, group: regionGroupLabel(tc, result.regionGroup), mode: regionModeLabel(tc, result.regionMode) })}</dd>
            <dt className="font-medium text-ink-2">{t("signal")}</dt>
            <dd className="text-ink">{result.explicitSignal ? t("signalExplicit", { signal: signalLabel(tc, result.input.signal) }) : t("signalDefault")}</dd>
            <dt className="font-medium text-ink-2">{t("effectivePurposes")}</dt>
            <dd>
              <ul className="flex flex-wrap gap-1.5">
                {result.effectiveGranted.map((p) => (
                  <li key={p}>
                    <Badge tone="primary">{purposeLabel(tc, p)}</Badge>
                  </li>
                ))}
              </ul>
              {result.input.gpc ? <p className="mt-1 text-xs text-ink-3">{t("gpcApplied")}</p> : null}
            </dd>
            <dt className="font-medium text-ink-2">{t("source")}</dt>
            <dd className="text-ink">{ts(`form.sources.${result.input.source}`)}</dd>
            <dt className="font-medium text-ink-2">{t("events")}</dt>
            <dd className="text-ink">{t("eventsCount", { count: summary.events })}</dd>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label={t("allowed")} value={formatNumber(summary.allowed, locale)} tone={summary.allowed ? "ok" : "neutral"} hint={t("stored")} />
        <StatCard label={t("reduced")} value={formatNumber(summary.reduced, locale)} tone={summary.reduced ? "warn" : "neutral"} hint={t("stored")} />
        <StatCard label={t("blocked")} value={formatNumber(summary.blocked, locale)} hint={t("stored")} />
        <StatCard label={t("forwarded")} value={destinations.length ? formatNumber(summary.forwarded, locale) : "–"} tone={summary.forwarded ? "ok" : "neutral"} hint={t("pairsHint")} />
        <StatCard label={t("dispatchBlocked")} value={destinations.length ? formatNumber(summary.dispatchBlocked, locale) : "–"} hint={t("pairsHint")} />
      </div>

      <FlowStrip result={result} t={t} tc={tc} locale={locale} />

      <Card variant="flat">
        <CardHeader>
          <CardTitle>{t("consentMode")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(result.consentMode).map(([flag, value]) => (
              <li key={flag} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2">
                <span className="font-mono text-xs text-ink">{flag}</span>
                <Status tone={value === "granted" ? "ok" : "neutral"} indicator="icon">
                  {t(value)}
                </Status>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {destinations.length === 0 ? (
        <EmptyState
          title={t("noDestinations")}
          description={t("noDestinationsText")}
          action={
            <Link href="/app/destinations" className={buttonVariants({ variant: "secondary" })}>
              {t("addDestination")}
            </Link>
          }
        />
      ) : destinations.some((d) => d.hypothetical) ? (
        <p className="text-sm text-ink-3">{t("hypotheticalNote")}</p>
      ) : null}

      <Card variant="flat">
        <CardContent className="px-2 py-2 sm:px-3">
          <Table caption={t("table.caption")}>
            <THead>
              <Tr>
                <Th>{t("table.event")}</Th>
                <Th>{t("table.stored")}</Th>
                {destinations.map((d) => (
                  <Th key={d.id}>
                    <span className="flex flex-col gap-0.5 normal-case">
                      <span>{d.hypothetical ? connectorLabel(tc, d.connectorType) : d.name}</span>
                      <span className="text-[11px] font-normal tracking-normal text-ink-3">{d.hypothetical ? ts("form.hypothetical") : `${connectorLabel(tc, d.connectorType)} · ${tc(`destinationStatus.${d.status}`)}`}</span>
                    </span>
                  </Th>
                ))}
              </Tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <Tr key={row.event.name}>
                  <Td label={t("table.event")}>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-ink">{row.event.name}</span>
                      <span className="text-xs text-ink-3">{row.event.isStandard ? ts(`form.categories.${row.event.category}`) : t("table.custom")}</span>
                    </span>
                  </Td>
                  <Td label={t("table.stored")}>
                    <PersistenceCell outcome={row.persistence} t={t} ts={ts} tc={tc} fieldList={fieldList} />
                  </Td>
                  {row.dispatch.map((d) => {
                    const destination = destinations.find((x) => x.id === d.destinationId)!;
                    return (
                      <Td key={d.destinationId} label={destination.hypothetical ? connectorLabel(tc, destination.connectorType) : destination.name}>
                        <DispatchCell outcome={d} destination={destination} t={t} ts={ts} tc={tc} fieldList={fieldList} />
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("fieldsTitle")}</CardTitle>
            <p className="text-sm text-ink-3">{t("fieldsIntro")}</p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              {FIELD_GROUPS.map((g) => (
                <div key={g} className="contents">
                  <dt className="font-mono text-xs text-ink-2">{g}</dt>
                  <dd className="text-ink">{ts(`fields.${g}`)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("notesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
              {["1", "2", "3", "4", "5"].map((n) => (
                <li key={n}>{t(`notes.${n}`)}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PersistenceCell({ outcome, t, ts, tc, fieldList }: { outcome: PersistenceOutcome; t: TranslateFn; ts: TranslateFn; tc: TranslateFn; fieldList: (groups: FieldGroup[]) => string }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Status tone={PERSIST_TONE[outcome.status]} indicator="both">
        {t(outcome.status)}
      </Status>
      <span className="text-xs text-ink-3">{outcome.reason ? ts(`reasons.${outcome.reason}`) : t("table.requires", { purpose: purposeLabel(tc, outcome.purposeRequired) })}</span>
      {outcome.status === "reduced" ? <span className="text-xs text-ink-3">{t("table.withheld", { fields: fieldList(outcome.withheld) })}</span> : null}
      {outcome.status === "allowed" ? <span className="text-xs text-ink-3">{t("table.kept", { fields: fieldList(outcome.kept) })}</span> : null}
    </span>
  );
}

function DispatchCell({ outcome, destination, t, ts, tc, fieldList }: { outcome: DispatchOutcome; destination: SimDestination; t: TranslateFn; ts: TranslateFn; tc: TranslateFn; fieldList: (groups: FieldGroup[]) => string }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Status tone={DISPATCH_TONE[outcome.status]} indicator="both">
        {t(outcome.status === "forwarded" ? "forwarded" : "dispatchBlocked")}
      </Status>
      {outcome.status === "blocked" ? (
        <span className="text-xs text-ink-3">
          {outcome.reason === "destination_paused" ? `${ts("reasons.destination_paused")} (${tc(`destinationStatus.${destination.status}`)})` : ts(`reasons.${outcome.reason ?? "not_persisted"}`)}
          {outcome.purposeRequired ? ` · ${t("table.requires", { purpose: purposeLabel(tc, outcome.purposeRequired) })}` : ""}
        </span>
      ) : (
        <>
          {outcome.purposeRequired ? <span className="text-xs text-ink-3">{t("table.requires", { purpose: purposeLabel(tc, outcome.purposeRequired) })}</span> : null}
          <span className="text-xs text-ink-3">{t("table.forwards", { fields: fieldList(outcome.forwarded) })}</span>
          <span className="text-xs text-ink-3">{outcome.clickIds.length ? t("table.clickIds", { ids: outcome.clickIds.join(", ") }) : outcome.clickIdsWithheld ? t("table.clickIdsWithheld") : t("table.noClickIds")}</span>
        </>
      )}
    </span>
  );
}

/** Website/server → Track → consent gate → event store → destinations, with the scenario's counts on each step. */
function FlowStrip({ result, t, tc, locale }: { result: SimulationResult; t: TranslateFn; tc: TranslateFn; locale: string }) {
  const { summary, destinations, rows } = result;
  const stored = summary.allowed + summary.reduced;
  const gateTone: Tone = !result.explicitSignal ? "neutral" : result.effectiveGranted.length > 1 ? "ok" : "warn";
  const origin = result.input.source === "browser" ? t("flow.website") : result.input.source === "shop" ? t("flow.shop") : t("flow.server");
  const steps: Array<{ key: string; label: string; detail: string; tone: Tone }> = [
    { key: "origin", label: origin, detail: t("eventsCount", { count: summary.events }), tone: "info" },
    { key: "track", label: t("flow.track"), detail: result.input.policy === "draft" ? tc("policy.draft") : tc("policy.published"), tone: "info" },
    { key: "gate", label: t("flow.gate"), detail: result.explicitSignal ? result.effectiveGranted.map((p) => purposeLabel(tc, p)).join(", ") : t("signalDefault"), tone: gateTone },
    { key: "store", label: t("flow.store"), detail: `${t("allowed")} ${formatNumber(summary.allowed, locale)} · ${t("reduced")} ${formatNumber(summary.reduced, locale)} · ${t("blocked")} ${formatNumber(summary.blocked, locale)}`, tone: stored ? "ok" : "neutral" },
  ];
  return (
    <section aria-label={t("flow.title")} className="rounded-[var(--radius-panel)] border border-line bg-surface-2 p-4">
      <ol className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {steps.map((step, i) => (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2">
              <Status tone={step.tone} className="text-xs">
                {step.label}
              </Status>
              <p className="mt-1 truncate text-xs text-ink-2" title={step.detail}>
                {step.detail}
              </p>
            </div>
            {i < steps.length ? <ArrowRight className="hidden size-4 shrink-0 text-ink-3 lg:block" aria-hidden="true" /> : null}
          </li>
        ))}
        <li className="min-w-0 flex-1">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2">
            <Status tone={summary.forwarded ? "ok" : "neutral"} className="text-xs">
              {t("flow.destinations")}
            </Status>
            {destinations.length ? (
              <ul className="mt-1 space-y-0.5">
                {destinations.slice(0, 4).map((d) => {
                  const forwarded = rows.filter((r) => r.dispatch.find((x) => x.destinationId === d.id)?.status === "forwarded").length;
                  return (
                    <li key={d.id} className="truncate text-xs text-ink-2">
                      {d.hypothetical ? connectorLabel(tc, d.connectorType) : d.name}: {t("flow.forwardedCount", { count: forwarded, total: rows.length })}
                    </li>
                  );
                })}
                {destinations.length > 4 ? <li className="text-xs text-ink-3">+{destinations.length - 4}</li> : null}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-3">{t("noDestinations")}</p>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}
