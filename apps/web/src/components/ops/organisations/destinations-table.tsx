import { getTranslations } from "next-intl/server";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime, formatRelative } from "@/components/app/alerts/format";
import { formatNumber } from "@/lib/format";
import type { DestinationView } from "@/server/ops/organisations";
import { DESTINATION_HEALTH_TONE, DESTINATION_STATUS_TONE, FRESHNESS_TONE, destinationHealthLabel, destinationStatusLabel, freshnessLabel } from "./labels";

/** Destinations with status, connector health and the worker's delivery snapshot — never credentials, vendor messages or payloads. */
export async function DestinationsTable({ destinations, locale, now }: { destinations: DestinationView[]; locale: string; now: string }) {
  const t = await getTranslations("opsOrganisations.detail.destinations");
  const tAll = await getTranslations("opsOrganisations");
  const tc = await getTranslations("opsOrganisations.common");
  const nowMs = Date.parse(now);
  if (destinations.length === 0) return <p className="text-sm text-ink-3">{t("empty")}</p>;
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("caption")}>
          <THead>
            <Tr>
              <Th>{t("name")}</Th>
              <Th>{t("status")}</Th>
              <Th>{t("health")}</Th>
              <Th>{t("deliveries")}</Th>
              <Th>{t("lastSuccess")}</Th>
              <Th>{t("queue")}</Th>
              <Th>{t("snapshot")}</Th>
            </Tr>
          </THead>
          <TBody>
            {destinations.map((d) => {
              const s = d.snapshot;
              const measured = s.freshness !== "missing";
              return (
                <Tr key={d.id}>
                  <Td label={t("name")}>
                    <p className="font-medium text-ink">{d.name}</p>
                    <p className="text-xs text-ink-3">
                      {d.connectorType} · {d.siteName}
                      {d.testMode ? ` · ${t("testMode")}` : null}
                    </p>
                  </Td>
                  <Td label={t("status")}>
                    <Badge tone={DESTINATION_STATUS_TONE[d.status] ?? "neutral"}>{destinationStatusLabel(tAll, d.status)}</Badge>
                  </Td>
                  <Td label={t("health")}>
                    <Status tone={DESTINATION_HEALTH_TONE[d.health.status] ?? "neutral"} indicator="both">
                      {destinationHealthLabel(tAll, d.health.status)}
                    </Status>
                    {d.health.checkedAt ? <p className="text-xs text-ink-3">{t("checkedAt", { date: formatRelative(d.health.checkedAt, locale, nowMs) ?? "" })}</p> : null}
                  </Td>
                  <Td label={t("deliveries")} className="tabular-nums">
                    {measured && s.attemptsTotal != null ? (
                      <>
                        <p className="text-ink">{t("deliveriesValue", { success: formatNumber(s.attemptsSuccess ?? 0, locale), total: formatNumber(s.attemptsTotal, locale) })}</p>
                        <p className="text-xs text-ink-3">
                          {s.errorRate != null ? t("errorRate", { rate: formatNumber(s.errorRate, locale, { style: "percent", maximumFractionDigits: 1 }) }) : null}
                          {s.windowMinutes != null ? ` · ${t("window", { minutes: formatNumber(s.windowMinutes, locale) })}` : null}
                        </p>
                      </>
                    ) : (
                      <span className="text-ink-3">{tc("notMeasured")}</span>
                    )}
                  </Td>
                  <Td label={t("lastSuccess")} className="whitespace-nowrap text-ink-2">
                    {s.lastSuccessAt ? (
                      <time dateTime={s.lastSuccessAt} title={formatDateTime(s.lastSuccessAt, locale) ?? undefined}>
                        {formatRelative(s.lastSuccessAt, locale, nowMs)}
                      </time>
                    ) : (
                      <span className="text-ink-3">{tc("none")}</span>
                    )}
                    {s.lastErrorClass ? <p className="text-xs text-ink-3">{t("lastError", { errorClass: s.lastErrorClass })}</p> : null}
                  </Td>
                  <Td label={t("queue")} className="tabular-nums">
                    {measured && (s.queueReady != null || s.queueDead != null) ? t("queueValue", { ready: formatNumber(s.queueReady ?? 0, locale), dead: formatNumber(s.queueDead ?? 0, locale) }) : <span className="text-ink-3">{tc("notMeasured")}</span>}
                  </Td>
                  <Td label={t("snapshot")}>
                    <Status tone={FRESHNESS_TONE[s.freshness] ?? "neutral"} indicator="both">
                      {freshnessLabel(tAll, s.freshness)}
                    </Status>
                    {s.computedAt ? <p className="text-xs text-ink-3">{formatRelative(s.computedAt, locale, nowMs)}</p> : null}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-ink-3">{t("noSecrets")}</p>
    </div>
  );
}
