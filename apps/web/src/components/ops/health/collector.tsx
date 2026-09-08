import { getTranslations } from "next-intl/server";
import { Alert, Status } from "@track-site/ui";
import { COLLECTOR_TIMEOUT_MS, type CollectorStatus } from "@/server/ops/health";
import { fmtCount, fmtDateTime, fmtDuration } from "./format";
import { Facts, HealthSection, Panel, Unknown, type Fact } from "./section";
import { COLLECTOR_TONE } from "./tones";

/** The collector's own /health answer, as facts; unreachable and invalid answers explained in words. */
export async function CollectorPanel({ collector, locale }: { collector: CollectorStatus; locale: string }) {
  const t = await getTranslations("opsHealth");
  const unknown = <Unknown label={t("states.unknown")} />;
  const facts: Fact[] = [
    { label: t("collector.host"), value: <span className="font-mono text-xs">{collector.host}</span> },
    { label: t("collector.http"), value: collector.httpStatus ?? unknown },
    { label: t("collector.latency"), value: fmtDuration(collector.latencyMs, locale) ?? unknown },
    { label: t("collector.db"), value: collector.db ? t(`collector.dbStates.${collector.db}`) : unknown },
    { label: t("collector.driver"), value: collector.queue?.driver ?? unknown },
    { label: t("collector.ready"), value: collector.queue?.ready != null ? fmtCount(collector.queue.ready, locale) : unknown },
    { label: t("collector.dlq"), value: collector.queue?.dlq != null ? fmtCount(collector.queue.dlq, locale) : unknown },
    {
      label: t("collector.killSwitch"),
      value: collector.killSwitch === null ? unknown : collector.killSwitch ? <Status tone="bad" indicator="icon">{t("collector.killOn")}</Status> : t("collector.killOff"),
    },
    { label: t("collector.reportedAt"), value: fmtDateTime(collector.reportedAt, locale) ?? unknown },
    { label: t("collector.checkedAt"), value: fmtDateTime(collector.checkedAt, locale) },
  ];
  return (
    <HealthSection
      id="collector"
      title={t("collector.title")}
      intro={t("collector.intro", { seconds: Math.round(COLLECTOR_TIMEOUT_MS / 1000) })}
      aside={
        <Status tone={COLLECTOR_TONE[collector.state]} indicator="both" data-testid="ops-health-collector-state">
          {t(`states.${collector.state}`)}
        </Status>
      }
    >
      {collector.state === "unreachable" || collector.state === "timeout" ? (
        <Alert tone="bad">{t("collector.unreachableText", { host: collector.host })}</Alert>
      ) : collector.state === "invalid" ? (
        <Alert tone="warn">{t("collector.invalidText", { host: collector.host })}</Alert>
      ) : collector.state === "kill_switch" ? (
        <Alert tone="bad">{t("overall.reasons.collector_kill_switch")}</Alert>
      ) : null}
      <Panel>
        <Facts items={facts} columns={2} />
      </Panel>
    </HealthSection>
  );
}
