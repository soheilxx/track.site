import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr, VisuallyHidden } from "@track-site/ui";
import {
  verdictTone,
  type AttributionHealth,
  type ClickIdSummary,
  type DestinationForwarding,
} from "@/server/insights-attribution";
import { InsightsSection } from "./evidence";
import { count, formatDateTime, formatDayKey, formatSpan, percent } from "./format";

/** Captured click ids per parameter: volume, origin, lifetime, carry-over span, consent check. */
export async function ClickIdTable({ clickIds }: { clickIds: ClickIdSummary[] }) {
  const t = await getTranslations("insights.attribution.clickIds");
  const tv = await getTranslations("insights.attribution.vendors");
  const locale = await getLocale();
  const units = { hours: t("unitHours"), days: t("unitDays") };
  return (
    <InsightsSection id="click-ids" title={t("title")} kind="observed" lead={t("lead")}>
      {clickIds.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-dashed border-line-2 px-4 py-6 text-center text-sm text-ink-3">
          {t("empty")}
        </p>
      ) : (
        <Table caption={t("caption")}>
          <THead>
            <tr>
              <Th>{t("columns.param")}</Th>
              <Th className="text-right">{t("columns.events")}</Th>
              <Th className="text-right">{t("columns.values")}</Th>
              <Th>{t("columns.origin")}</Th>
              <Th>{t("columns.lifetime")}</Th>
              <Th>{t("columns.span")}</Th>
              <Th>{t("columns.consent")}</Th>
              <Th>{t("columns.seen")}</Th>
            </tr>
          </THead>
          <TBody>
            {clickIds.map((row) => (
              <Tr key={row.param}>
                <Td label={t("columns.param")}>
                  <span className="font-mono text-xs text-ink">{row.param}</span>
                  <span className="ml-2 text-xs text-ink-3">{tv(row.vendor as "google")}</span>
                </Td>
                <Td label={t("columns.events")} numeric>
                  {count(row.events, locale)}
                </Td>
                <Td label={t("columns.values")} numeric>
                  {count(row.values, locale)}
                </Td>
                <Td label={t("columns.origin")}>
                  <ul className="space-y-0.5 text-xs">
                    {row.origins.map((o) => (
                      <li key={o.origin} className="text-ink-2">
                        {t(`origin.${o.origin}`)}{" "}
                        <span className="tabular-nums text-ink-3">{percent(o.share, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td label={t("columns.lifetime")}>
                  {row.ttlDays === null
                    ? t("unknown")
                    : row.ttlDays.min === row.ttlDays.max
                      ? t("lifetimeDays", { days: row.ttlDays.max })
                      : t("lifetimeRange", { min: row.ttlDays.min, max: row.ttlDays.max })}
                </Td>
                <Td label={t("columns.span")}>
                  {row.medianSpanHours === null || row.maxSpanHours === null
                    ? t("unknown")
                    : t("span", {
                        median: formatSpan(row.medianSpanHours, locale, units),
                        max: formatSpan(row.maxSpanHours, locale, units),
                      })}
                </Td>
                <Td label={t("columns.consent")}>
                  <Status tone={row.withoutConsent > 0 ? "bad" : "ok"} indicator="icon">
                    {row.withoutConsent > 0
                      ? t("consentBad", { n: count(row.withoutConsent, locale) })
                      : t("consentOk")}
                  </Status>
                </Td>
                <Td label={t("columns.seen")} className="text-xs text-ink-2">
                  {row.firstSeen && row.lastSeen
                    ? t("seen", {
                        first: formatDateTime(row.firstSeen, locale),
                        last: formatDateTime(row.lastSeen, locale),
                      })
                    : t("unknown")}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <p className="text-xs text-ink-3">{t("originNote")}</p>
    </InsightsSection>
  );
}

/** Forwarding per destination, derived from the delivery record and the destination's click-id allow-list. */
export async function DestinationTable({
  destinations,
  siteId,
  compact = false,
}: {
  destinations: DestinationForwarding[];
  siteId: string;
  compact?: boolean;
}) {
  const t = await getTranslations("insights.attribution.destinations");
  const locale = await getLocale();
  return (
    <InsightsSection
      id="destinations"
      title={t("title")}
      kind="observed"
      lead={compact ? undefined : t("lead")}
    >
      {destinations.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-dashed border-line-2 px-4 py-6 text-center text-sm text-ink-3">
          <p>{t("empty")}</p>
          <Link
            href={`/app/sites/${siteId}/destinations/new`}
            className="mt-2 inline-flex min-h-9 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11"
          >
            {t("emptyAction")}
          </Link>
        </div>
      ) : (
        <Table caption={t("caption")}>
          <THead>
            <tr>
              <Th>{t("columns.destination")}</Th>
              <Th>{t("columns.status")}</Th>
              <Th>{t("columns.accepts")}</Th>
              <Th className="text-right">{t("columns.eligible")}</Th>
              <Th className="text-right">{t("columns.forwarded")}</Th>
              {compact ? null : (
                <>
                  <Th className="text-right">{t("columns.failed")}</Th>
                  <Th className="text-right">{t("columns.pending")}</Th>
                  <Th className="text-right">{t("columns.notRouted")}</Th>
                  <Th className="text-right">{t("columns.expired")}</Th>
                </>
              )}
              <Th>{t("columns.last")}</Th>
              <Th>
                <VisuallyHidden>{t("columns.actions")}</VisuallyHidden>
              </Th>
            </tr>
          </THead>
          <TBody>
            {destinations.map((d) => (
              <Tr key={d.id}>
                <Td label={t("columns.destination")}>
                  <span className="font-medium text-ink">{d.name}</span>
                  <span className="ml-2 font-mono text-xs text-ink-3">{d.connectorType}</span>
                  {d.testMode ? (
                    <Badge tone="neutral" className="ml-2">
                      {t("testMode")}
                    </Badge>
                  ) : null}
                </Td>
                <Td label={t("columns.status")}>
                  <Status
                    tone={verdictTone(d.verdict)}
                    indicator="icon"
                    title={t(`verdictHelp.${d.verdict}`)}
                  >
                    {t(`verdict.${d.verdict}`)}
                  </Status>
                  {d.verdict === "inactive" ? (
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {d.pausedAt ? t("status.paused") : t(`status.${d.status as "draft"}`)}
                    </span>
                  ) : null}
                </Td>
                <Td label={t("columns.accepts")}>
                  {d.accepts.length === 0 ? (
                    <span className="text-xs text-ink-3">{t("acceptsNone")}</span>
                  ) : (
                    <span className="font-mono text-xs text-ink-2">{d.accepts.join(", ")}</span>
                  )}
                </Td>
                <Td label={t("columns.eligible")} numeric>
                  {d.accepts.length === 0 ? "–" : count(d.eligible, locale)}
                </Td>
                <Td label={t("columns.forwarded")} numeric>
                  {d.accepts.length === 0 ? "–" : count(d.deliveredWithId, locale)}
                </Td>
                {compact ? null : (
                  <>
                    <Td label={t("columns.failed")} numeric>
                      {d.accepts.length === 0 ? "–" : count(d.failed, locale)}
                    </Td>
                    <Td label={t("columns.pending")} numeric>
                      {d.accepts.length === 0 ? "–" : count(d.pending, locale)}
                    </Td>
                    <Td label={t("columns.notRouted")} numeric>
                      {d.accepts.length === 0 ? "–" : count(d.notRouted, locale)}
                    </Td>
                    <Td label={t("columns.expired")} numeric>
                      {d.accepts.length === 0 ? "–" : count(d.expiredAtDelivery, locale)}
                    </Td>
                  </>
                )}
                <Td label={t("columns.last")} className="text-xs text-ink-2">
                  {d.lastForwardedAt ? formatDateTime(d.lastForwardedAt, locale) : t("never")}
                </Td>
                <Td label={t("columns.actions")}>
                  <Link
                    href={`/app/sites/${siteId}/destinations/${d.id}`}
                    className="inline-flex min-h-9 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11"
                  >
                    {t("open")}
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <p className="text-xs text-ink-3">{t("note")}</p>
    </InsightsSection>
  );
}

/** Daily capture: bars for consented events and events carrying a click id; the table under the chart is the accessible form. */
export async function DailyCapture({ daily }: { daily: AttributionHealth["daily"] }) {
  const t = await getTranslations("insights.attribution.daily");
  const locale = await getLocale();
  const max = Math.max(0, ...daily.map((d) => d.marketing));
  const width = daily.length * 12;
  const height = 100;
  return (
    <InsightsSection id="daily" title={t("title")} kind="observed" lead={t("lead")}>
      {max === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-dashed border-line-2 px-4 py-6 text-center text-sm text-ink-3">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-32 w-full"
            aria-hidden="true"
            focusable="false"
          >
            {daily.map((d, i) => {
              const mh = (d.marketing / max) * height;
              const ch = (d.withClickIds / max) * height;
              return (
                <g key={d.day}>
                  <rect
                    x={i * 12 + 1}
                    y={height - mh}
                    width={10}
                    height={mh}
                    className="fill-line-2"
                  />
                  <rect
                    x={i * 12 + 1}
                    y={height - ch}
                    width={10}
                    height={ch}
                    className="fill-primary"
                  />
                </g>
              );
            })}
          </svg>
          <ul className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
            <li className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-line-2" />
              {t("legend.marketing")}
            </li>
            <li className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-primary" />
              {t("legend.withClickIds")}
            </li>
          </ul>
          <details className="mt-3">
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
              {t("showTable")}
            </summary>
            <Table caption={t("caption")} className="mt-2" stack={false}>
              <THead>
                <tr>
                  <Th>{t("columns.day")}</Th>
                  <Th className="text-right">{t("columns.total")}</Th>
                  <Th className="text-right">{t("columns.marketing")}</Th>
                  <Th className="text-right">{t("columns.withClickIds")}</Th>
                </tr>
              </THead>
              <TBody>
                {daily.map((d) => (
                  <Tr key={d.day}>
                    <Td>{formatDayKey(d.day, locale)}</Td>
                    <Td numeric>{count(d.total, locale)}</Td>
                    <Td numeric>{count(d.marketing, locale)}</Td>
                    <Td numeric>{count(d.withClickIds, locale)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </details>
        </div>
      )}
    </InsightsSection>
  );
}

/** Attribution touchpoints per channel (the `attribution_touchpoints` table); honest when nothing was recorded. */
export async function TouchpointTable({
  touchpoints,
}: {
  touchpoints: AttributionHealth["touchpoints"];
}) {
  const t = await getTranslations("insights.attribution.touchpoints");
  const locale = await getLocale();
  return (
    <InsightsSection id="touchpoints" title={t("title")} kind="observed" lead={t("lead")}>
      {touchpoints.channels.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-dashed border-line-2 px-4 py-6 text-center text-sm text-ink-3">
          {t("empty")}
        </p>
      ) : (
        <Table caption={t("caption")}>
          <THead>
            <tr>
              <Th>{t("columns.channel")}</Th>
              <Th className="text-right">{t("columns.touchpoints")}</Th>
              <Th className="text-right">{t("columns.visitors")}</Th>
              <Th className="text-right">{t("columns.withClickIds")}</Th>
              <Th>{t("columns.last")}</Th>
            </tr>
          </THead>
          <TBody>
            {touchpoints.channels.map((c) => (
              <Tr key={c.channel}>
                <Td label={t("columns.channel")} className="font-medium text-ink">
                  {c.channel}
                </Td>
                <Td label={t("columns.touchpoints")} numeric>
                  {count(c.touchpoints, locale)}
                </Td>
                <Td label={t("columns.visitors")} numeric>
                  {count(c.visitors, locale)}
                </Td>
                <Td label={t("columns.withClickIds")} numeric>
                  {count(c.withClickIds, locale)}
                </Td>
                <Td label={t("columns.last")} className="text-xs text-ink-2">
                  {c.lastAt ? formatDateTime(c.lastAt, locale) : "–"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </InsightsSection>
  );
}
