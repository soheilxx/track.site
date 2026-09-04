import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Status, TBody, Table, Td, Th, THead, Tr, buttonVariants } from "@track-site/ui";
import { IMPACT_WINDOW_DAYS, type ImpactPreview as ImpactPreviewData } from "@/server/releases";
import type { WorkspaceEnvironment } from "@/server/workspace";
import { formatCount, formatDateTime, formatRelative, formatShare } from "./format";
import { CHANGE_TONE, type TranslateFn } from "./labels";

const DESTINATION_STATUSES = new Set(["draft", "not_connected", "connected", "paused", "error"]);

function purposeList(t: TranslateFn, purposes: string[]): string {
  return purposes.length ? purposes.map((p) => t(`impact.consent.purpose.${p}`)).join(", ") : t("impact.consent.none");
}

function regionMode(t: TranslateFn, mode: string | null): string {
  return mode === null ? t("impact.consent.none") : t(`impact.consent.regionModes.${mode}`);
}

/**
 * Change Impact Preview (supplement §8, module 10): affected events, destinations and consent
 * purposes from the diff; volume from the environment's aggregates of the impact window; plan limits
 * from the tariff catalogue and the usage period; the expected data-quality effect as explained rules.
 * Every figure is a measurement or stays unknown — nothing is forecast.
 */
export async function ImpactPreview({ impact, environment, locale }: { impact: ImpactPreviewData; environment: WorkspaceEnvironment; locale: string }) {
  const t = await getTranslations("releases");
  const days = IMPACT_WINDOW_DAYS;
  const envLabel = t(`environment.kind.${environment.kind}`);
  const unknown = <span className="text-ink-3">{t("impact.events.notMeasured")}</span>;
  return (
    <section aria-labelledby="release-impact-title" className="space-y-5" data-testid="release-impact">
      <div>
        <h2 id="release-impact-title" className="text-lg font-semibold text-ink">
          {t("impact.title")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("impact.intro", { days, environment: envLabel })}</p>
        <p className="mt-1 text-xs text-ink-3">{t("impact.generatedAt", { time: formatDateTime(impact.generatedAt, locale) })}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card variant="flat" className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("impact.events.title")}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2 sm:px-3">
            {impact.events.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-ink-3">{t("impact.events.empty")}</p>
            ) : (
              <Table caption={t("impact.events.caption")}>
                <THead>
                  <Tr>
                    <Th>{t("impact.events.event")}</Th>
                    <Th>{t("impact.events.change")}</Th>
                    <Th className="text-right">{t("impact.events.accepted", { days })}</Th>
                    <Th className="text-right">{t("impact.events.delivered", { days })}</Th>
                    <Th className="text-right">{t("impact.events.issues")}</Th>
                    <Th>{t("impact.events.destinations")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {impact.events.map((e) => (
                    <Tr key={e.name}>
                      <Td label={t("impact.events.event")}>
                        <span className="font-mono text-xs text-ink">{e.name}</span>
                        {e.critical ? (
                          <Badge tone="warn" className="ml-2">
                            {t("impact.events.critical")}
                          </Badge>
                        ) : null}
                      </Td>
                      <Td label={t("impact.events.change")}>
                        <Status tone={CHANGE_TONE[e.change]} indicator="icon">
                          {t(`impact.events.kind.${e.change}`)}
                        </Status>
                      </Td>
                      <Td label={t("impact.events.accepted", { days })} numeric>
                        {e.accepted === null ? unknown : formatCount(e.accepted, locale)}
                      </Td>
                      <Td label={t("impact.events.delivered", { days })} numeric>
                        {e.delivered === null ? unknown : formatCount(e.delivered, locale)}
                      </Td>
                      <Td label={t("impact.events.issues")} numeric>
                        {formatCount(e.openIssues, locale)}
                      </Td>
                      <Td label={t("impact.events.destinations")}>{e.destinations.length ? e.destinations.join(", ") : <span className="text-ink-3">—</span>}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card variant="flat" className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("impact.destinations.title")}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2 sm:px-3">
            {impact.destinations.length === 0 ? (
              <p className="px-2 pb-2 text-sm text-ink-3">{t("impact.destinations.empty")}</p>
            ) : (
              <Table caption={t("impact.destinations.caption")}>
                <THead>
                  <Tr>
                    <Th>{t("impact.destinations.destination")}</Th>
                    <Th>{t("impact.destinations.change")}</Th>
                    <Th>{t("impact.destinations.purpose")}</Th>
                    <Th>{t("impact.destinations.events")}</Th>
                    <Th>{t("impact.destinations.status")}</Th>
                    <Th>{t("impact.destinations.health")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {impact.destinations.map((d) => (
                    <Tr key={d.id}>
                      <Td label={t("impact.destinations.destination")}>
                        <span className="font-medium text-ink">{d.name}</span> <span className="font-mono text-xs text-ink-3">{d.type}</span>
                      </Td>
                      <Td label={t("impact.destinations.change")}>
                        <Status tone={CHANGE_TONE[d.change]} indicator="icon">
                          {t(`impact.destinations.kind.${d.change}`)}
                        </Status>
                      </Td>
                      <Td label={t("impact.destinations.purpose")}>
                        {d.purposeBefore && d.purposeAfter && d.purposeBefore !== d.purposeAfter ? (
                          <span>
                            <span className="line-through text-ink-3">{t(`impact.consent.purpose.${d.purposeBefore}`)}</span> → {t(`impact.consent.purpose.${d.purposeAfter}`)}
                          </span>
                        ) : (
                          t(`impact.consent.purpose.${d.purposeAfter ?? d.purposeBefore ?? "necessary"}`)
                        )}
                      </Td>
                      <Td label={t("impact.destinations.events")}>{d.mappedEvents.length ? <span className="font-mono text-xs">{d.mappedEvents.join(", ")}</span> : <span className="text-ink-3">—</span>}</Td>
                      <Td label={t("impact.destinations.status")}>{t(`impact.destinations.statusLabel.${d.status && DESTINATION_STATUSES.has(d.status) ? d.status : "unknown"}`)}</Td>
                      <Td label={t("impact.destinations.health")}>
                        {d.health ? (
                          <span className="tabular-nums">
                            {t("impact.destinations.healthText", { success: formatCount(d.health.attemptsSuccess, locale), errorRate: d.health.errorRate === null ? "–" : formatShare(d.health.errorRate * 100, locale), hours: Math.round(d.health.windowMinutes / 60) })}
                            {d.health.stale ? <span className="text-warn"> · {t("impact.destinations.stale")}</span> : null}
                          </span>
                        ) : (
                          <span className="text-ink-3">{t("impact.destinations.noHealth")}</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("impact.consent.title")}</CardTitle>
            {impact.consent.weaker ? (
              <CardDescription>
                <Status tone="warn" indicator="icon">
                  {t("impact.consent.weaker")}
                </Status>
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-ink-2">
              <li>{t("impact.consent.purposes", { purposes: purposeList(t, impact.consent.purposesAfter) })}</li>
              {impact.consent.added.length ? <li>{t("impact.consent.added", { purposes: purposeList(t, impact.consent.added) })}</li> : null}
              {impact.consent.removed.length ? <li className="text-warn">{t("impact.consent.removed", { purposes: purposeList(t, impact.consent.removed) })}</li> : null}
              {impact.consent.regionMode ? <li>{t("impact.consent.regionMode", { before: regionMode(t, impact.consent.regionMode.before), after: regionMode(t, impact.consent.regionMode.after) })}</li> : null}
              {impact.consent.consentMode ? <li>{t("impact.consent.consentMode", { before: impact.consent.consentMode.before ? t(`impact.consent.consentModes.${impact.consent.consentMode.before}`) : t("impact.consent.none"), after: t(`impact.consent.consentModes.${impact.consent.consentMode.after}`) })}</li> : null}
              {impact.consent.gpc ? <li>{t("impact.consent.gpc", { before: impact.consent.gpc.before === null ? t("impact.consent.none") : impact.consent.gpc.before ? t("impact.consent.respected") : t("impact.consent.ignored"), after: impact.consent.gpc.after ? t("impact.consent.respected") : t("impact.consent.ignored") })}</li> : null}
              {impact.consent.clickIdTtl ? <li>{t("impact.consent.clickIdTtl", { before: impact.consent.clickIdTtl.before ?? "–", after: impact.consent.clickIdTtl.after })}</li> : null}
              {!impact.consent.regionMode && !impact.consent.consentMode && !impact.consent.gpc && !impact.consent.clickIdTtl && impact.consent.added.length === 0 && impact.consent.removed.length === 0 ? <li className="text-ink-3">{t("impact.consent.unchanged")}</li> : null}
            </ul>
          </CardContent>
        </Card>

        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("impact.volume.title")}</CardTitle>
            <CardDescription>{impact.volume.lastBucketAt ? t("impact.volume.lastBucket", { time: formatRelative(impact.volume.lastBucketAt, locale) }) : null}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!impact.volume.measured ? (
              <p className="text-sm text-ink-3">{!impact.volume.available ? t("impact.volume.unavailable") : t("impact.volume.empty", { days })}</p>
            ) : null}
            {impact.volume.stale && impact.volume.lastBucketAt ? <Alert tone="warn">{t("impact.volume.stale", { time: formatDateTime(impact.volume.lastBucketAt, locale) })}</Alert> : null}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">{t("impact.volume.baseline")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{impact.volume.baselineAccepted === null ? <span className="text-base font-normal text-ink-3">{t("impact.events.notMeasured")}</span> : formatCount(impact.volume.baselineAccepted, locale)}</dd>
                <dd className="text-xs text-ink-3">{t("impact.volume.baselineHint", { days })}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("impact.volume.removed")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{formatCount(impact.volume.removedAccepted, locale)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("impact.volume.billable")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{impact.volume.billable === null ? <span className="text-base font-normal text-ink-3">{t("impact.events.notMeasured")}</span> : formatCount(impact.volume.billable, locale)}</dd>
              </div>
            </dl>
            {impact.volume.unmeasuredEvents.length ? <p className="text-sm text-ink-2">{t("impact.volume.unmeasured", { count: impact.volume.unmeasuredEvents.length, events: impact.volume.unmeasuredEvents.join(", ") })}</p> : null}
          </CardContent>
        </Card>

        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("impact.plan.title")}</CardTitle>
            <CardDescription>{t("impact.plan.plan", { plan: impact.plan.planId })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-ink-2">
            <p>{impact.plan.eventsPerMonth === null ? t("impact.plan.noLimit") : t("impact.plan.limit", { limit: formatCount(impact.plan.eventsPerMonth, locale) })}</p>
            <p>{impact.plan.usedBillable === null ? t("impact.plan.usedUnknown", { period: impact.plan.periodKey }) : t("impact.plan.used", { used: formatCount(impact.plan.usedBillable, locale), period: impact.plan.periodKey, share: impact.plan.usedSharePercent === null ? "–" : formatShare(impact.plan.usedSharePercent, locale) })}</p>
            <p>{impact.plan.projectedMonthly === null ? t("impact.plan.projectedUnknown") : t("impact.plan.projected", { projected: formatCount(impact.plan.projectedMonthly, locale), share: impact.plan.projectedSharePercent === null ? "–" : formatShare(impact.plan.projectedSharePercent, locale) })}</p>
            {impact.plan.thresholdCrossed !== null ? <Alert tone={impact.plan.thresholdCrossed >= 100 ? "bad" : "warn"}>{t("impact.plan.threshold", { threshold: impact.plan.thresholdCrossed })}</Alert> : null}
            <Link href="/app/billing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("impact.plan.billing")}
            </Link>
          </CardContent>
        </Card>

        <Card variant="flat" className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("impact.dq.title")}</CardTitle>
            <CardDescription>{t("impact.dq.intro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="release-impact-dq">
              {impact.dataQuality.map((d, i) => (
                <li key={`${d.code}-${i}`} className="flex items-start gap-2 text-sm text-ink">
                  <Status tone={d.tone} indicator="icon" className="mt-0.5 shrink-0">
                    <span className="sr-only">{t(`impact.dq.tone.${d.tone}`)}</span>
                  </Status>
                  <span>
                    {t(`impact.dq.${d.code}`, d.params)} <span className="font-mono text-xs text-ink-3">{d.code}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
