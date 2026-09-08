import { getTranslations } from "next-intl/server";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { RecentErrorsView } from "@/server/ops/health";
import { fmtCount, fmtDateTime, fmtRelative } from "./format";
import { HealthSection, Panel } from "./section";
import { SEVERITY_TONE } from "./tones";

/** Latest alert events across tenants and audit entries recording a failure; kinds and organisation names only. */
export async function RecentErrors({ recent, locale, nowMs }: { recent: RecentErrorsView; locale: string; nowMs: number }) {
  const t = await getTranslations("opsHealth");
  const open = recent.openAlerts;
  const kindLabel = (kind: string) => (t.has(`errors.kinds.${kind}`) ? t(`errors.kinds.${kind}`) : kind);
  const severityLabel = (severity: string) => (t.has(`errors.severity.${severity}`) ? t(`errors.severity.${severity}`) : severity);
  return (
    <HealthSection
      id="errors"
      title={t("errors.title")}
      intro={t("errors.intro")}
      aside={
        <span className="text-ink-3">
          {t("errors.open")}:{" "}
          <Status tone={open.critical > 0 ? "bad" : "neutral"} className="text-xs">
            {fmtCount(open.critical, locale)} {t("errors.critical")}
          </Status>{" "}
          <Status tone={open.warning > 0 ? "warn" : "neutral"} className="text-xs">
            {fmtCount(open.warning, locale)} {t("errors.warning")}
          </Status>{" "}
          <Status tone="neutral" className="text-xs">
            {fmtCount(open.info, locale)} {t("errors.info")}
          </Status>
        </span>
      }
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">{t("errors.alerts.title")}</h3>
          {recent.alerts.length === 0 ? (
            <EmptyState title={t("errors.alerts.empty")} />
          ) : (
            <Panel>
              <Table caption={t("errors.alerts.title")}>
                <THead>
                  <Tr>
                    <Th>{t("errors.alerts.columns.when")}</Th>
                    <Th>{t("errors.alerts.columns.severity")}</Th>
                    <Th>{t("errors.alerts.columns.kind")}</Th>
                    <Th>{t("errors.alerts.columns.organization")}</Th>
                    <Th>{t("errors.alerts.columns.state")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {recent.alerts.map((row) => (
                    <Tr key={row.id} data-testid="ops-health-alert">
                      <Td label={t("errors.alerts.columns.when")} className="whitespace-nowrap">
                        <time dateTime={row.triggeredAt}>{fmtDateTime(row.triggeredAt, locale)}</time>
                        <p className="text-xs text-ink-3">{fmtRelative(row.triggeredAt, locale, nowMs)}</p>
                      </Td>
                      <Td label={t("errors.alerts.columns.severity")}>
                        <Status tone={SEVERITY_TONE[row.severity] ?? "neutral"} indicator="icon">
                          {severityLabel(row.severity)}
                        </Status>
                      </Td>
                      <Td label={t("errors.alerts.columns.kind")}>{kindLabel(row.kind)}</Td>
                      <Td label={t("errors.alerts.columns.organization")}>{row.organization?.name ?? <span className="text-ink-3">{t("errors.platform")}</span>}</Td>
                      <Td label={t("errors.alerts.columns.state")}>
                        {row.resolvedAt ? (
                          <Status tone="neutral">{t("errors.alerts.resolved", { when: fmtRelative(row.resolvedAt, locale, nowMs) ?? "" })}</Status>
                        ) : (
                          <Status tone="warn">{t("errors.alerts.openState")}</Status>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Panel>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">{t("errors.audit.title")}</h3>
          {recent.audit.length === 0 ? (
            <EmptyState title={t("errors.audit.empty")} />
          ) : (
            <Panel>
              <Table caption={t("errors.audit.title")}>
                <THead>
                  <Tr>
                    <Th>{t("errors.audit.columns.when")}</Th>
                    <Th>{t("errors.audit.columns.action")}</Th>
                    <Th>{t("errors.audit.columns.target")}</Th>
                    <Th>{t("errors.audit.columns.organization")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {recent.audit.map((row) => (
                    <Tr key={row.id} data-testid="ops-health-audit">
                      <Td label={t("errors.audit.columns.when")} className="whitespace-nowrap">
                        <time dateTime={row.createdAt}>{fmtDateTime(row.createdAt, locale)}</time>
                        <p className="text-xs text-ink-3">{fmtRelative(row.createdAt, locale, nowMs)}</p>
                      </Td>
                      <Td label={t("errors.audit.columns.action")} className="font-mono text-xs">
                        {row.action}
                      </Td>
                      <Td label={t("errors.audit.columns.target")} className="font-mono text-xs">
                        {row.targetType}
                      </Td>
                      <Td label={t("errors.audit.columns.organization")}>{row.organization?.name ?? <span className="text-ink-3">{t("errors.platform")}</span>}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Panel>
          )}
        </div>
      </div>
    </HealthSection>
  );
}
