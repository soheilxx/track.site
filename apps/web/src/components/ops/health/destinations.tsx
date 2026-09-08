import { getTranslations } from "next-intl/server";
import { EmptyState, Status } from "@track-site/ui";
import { SNAPSHOT_STALE_AFTER_MS, type DestinationsView } from "@/server/ops/health";
import { fmtCount, fmtDateTime, fmtPercent, fmtRelative } from "./format";
import { Facts, HealthSection, Panel, Unknown, type Fact } from "./section";
import { INTEGRATION_STATUS_TONE } from "./tones";

const STATUS_ORDER = ["connected", "error", "not_connected", "paused", "draft"] as const;

/** Aggregates of the worker's per-destination snapshots plus destination counts by status — no tenant named. */
export async function Destinations({ destinations, locale, nowMs }: { destinations: DestinationsView; locale: string; nowMs: number }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("states.unknown")} />;
  const d = destinations;
  const known: string[] = STATUS_ORDER.filter((s) => d.byStatus[s] !== undefined);
  const statuses = [...known, ...Object.keys(d.byStatus).filter((s) => !known.includes(s))];
  const facts: Fact[] = [
    { label: t("destinations.snapshots"), value: fmtCount(d.snapshots, locale) },
    {
      label: `${t("destinations.fresh")} / ${t("destinations.stale")}`,
      value:
        d.snapshots === 0 ? (
          unknown
        ) : d.stale > 0 ? (
          <Status tone={d.fresh === 0 ? "warn" : "info"} indicator="icon">
            {fmtCount(d.fresh, locale)} / {fmtCount(d.stale, locale)}
          </Status>
        ) : (
          `${fmtCount(d.fresh, locale)} / ${fmtCount(d.stale, locale)}`
        ),
    },
    {
      label: t("destinations.latest"),
      value: d.latestComputedAt ? (
        <>
          <time dateTime={d.latestComputedAt}>{fmtDateTime(d.latestComputedAt, locale)}</time>
          <span className="ml-1 text-xs text-ink-3">{fmtRelative(d.latestComputedAt, locale, nowMs)}</span>
        </>
      ) : (
        unknown
      ),
    },
    { label: t("destinations.oldest"), value: d.oldestComputedAt ? <time dateTime={d.oldestComputedAt}>{fmtDateTime(d.oldestComputedAt, locale)}</time> : unknown },
    { label: t("destinations.organizations"), value: fmtCount(d.organizations, locale) },
    { label: t("destinations.attempts"), value: fmtCount(d.attempts.total, locale) },
    { label: t("destinations.errorRate"), value: fmtPercent(d.attempts.errorRate, locale) ?? unknown },
    {
      label: t("destinations.highErrorRate"),
      value: d.highErrorRate > 0 ? (
        <Status tone="warn" indicator="icon">
          {fmtCount(d.highErrorRate, locale)}
        </Status>
      ) : (
        fmtCount(d.highErrorRate, locale)
      ),
    },
    {
      label: t("destinations.withDeadLetters"),
      value: d.withDeadLetters > 0 ? (
        <Status tone="warn" indicator="icon">
          {fmtCount(d.withDeadLetters, locale)}
        </Status>
      ) : (
        fmtCount(d.withDeadLetters, locale)
      ),
    },
    { label: t("destinations.queueReady"), value: fmtCount(d.queueReady, locale) },
    { label: t("destinations.oldestQueued"), value: d.oldestQueuedAt ? <time dateTime={d.oldestQueuedAt}>{fmtDateTime(d.oldestQueuedAt, locale)}</time> : unknown },
    {
      label: t("destinations.integrations"),
      value: (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {statuses.map((status) => (
              <li key={status}>
                <Status tone={INTEGRATION_STATUS_TONE[status] ?? "neutral"} className="text-xs">
                  {t.has(`destinations.statuses.${status}`) ? t(`destinations.statuses.${status}`) : status}: {fmtCount(d.byStatus[status] ?? 0, locale)}
                </Status>
              </li>
            ))}
          {d.integrations === 0 ? <li className="text-ink-3">{fmtCount(0, locale)}</li> : null}
        </ul>
      ),
    },
  ];
  return (
    <HealthSection id="destinations" title={t("destinations.title")} intro={t("destinations.intro", { minutes: Math.round(SNAPSHOT_STALE_AFTER_MS / 60_000) })}>
      {d.snapshots === 0 ? <EmptyState title={t("destinations.empty")} /> : null}
      <Panel>
        <Facts items={facts} columns={4} />
      </Panel>
    </HealthSection>
  );
}
