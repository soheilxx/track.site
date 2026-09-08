import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { WorkerView } from "@/server/ops/health";
import { fmtDateTime, fmtDuration, fmtRelative } from "./format";
import { HealthSection, Panel, Unknown } from "./section";
import { JOB_TONE } from "./tones";

/** One row per scheduled job (schedule mirror ∪ heartbeat rows); the error opens in a disclosure. */
export async function WorkerJobs({ worker, locale, nowMs }: { worker: WorkerView; locale: string; nowMs: number }) {
  const t = await getTranslations("opsHealth");
  const hasHeartbeat = worker.jobs.some((j) => j.lastRunAt !== null);
  return (
    <HealthSection
      id="worker"
      title={t("worker.title")}
      intro={t("worker.intro")}
      aside={
        <Status tone={JOB_TONE[worker.state]} indicator="both" data-testid="ops-health-worker-state">
          {t(`states.${worker.state}`)}
        </Status>
      }
    >
      {!hasHeartbeat ? <EmptyState title={t("states.never")} description={t("worker.empty")} /> : null}
      <Panel>
        <Table caption={t("worker.title")}>
          <THead>
            <Tr>
              <Th>{t("worker.columns.job")}</Th>
              <Th>{t("worker.columns.state")}</Th>
              <Th>{t("worker.columns.lastRun")}</Th>
              <Th>{t("worker.columns.lastOk")}</Th>
              <Th className="text-right">{t("worker.columns.duration")}</Th>
              <Th className="text-right">{t("worker.columns.interval")}</Th>
              <Th>{t("worker.columns.host")}</Th>
              <Th>{t("worker.columns.error")}</Th>
            </Tr>
          </THead>
          <TBody>
            {worker.jobs.map((job) => (
              <Tr key={job.job} data-testid="ops-health-job" data-state={job.state}>
                <Td label={t("worker.columns.job")} className="font-mono text-xs">
                  {job.job}
                </Td>
                <Td label={t("worker.columns.state")}>
                  <Status tone={JOB_TONE[job.state]} indicator="icon">
                    {t(`states.${job.state}`)}
                  </Status>
                </Td>
                <Td label={t("worker.columns.lastRun")} className="whitespace-nowrap">
                  {job.lastRunAt ? (
                    <>
                      <time dateTime={job.lastRunAt}>{fmtDateTime(job.lastRunAt, locale)}</time>
                      <p className="text-xs text-ink-3">{fmtRelative(job.lastRunAt, locale, nowMs)}</p>
                    </>
                  ) : (
                    <span className="text-ink-3">{t("worker.never")}</span>
                  )}
                </Td>
                <Td label={t("worker.columns.lastOk")} className="whitespace-nowrap">
                  {job.lastOkAt ? (
                    <>
                      <time dateTime={job.lastOkAt}>{fmtDateTime(job.lastOkAt, locale)}</time>
                      <p className="text-xs text-ink-3">{fmtRelative(job.lastOkAt, locale, nowMs)}</p>
                    </>
                  ) : (
                    <span className="text-ink-3">{t("worker.never")}</span>
                  )}
                </Td>
                <Td label={t("worker.columns.duration")} numeric>
                  {fmtDuration(job.lastDurationMs, locale) ?? <Unknown label={t("states.unknown")} />}
                </Td>
                <Td label={t("worker.columns.interval")} numeric>
                  {job.intervalMs !== null ? fmtDuration(job.intervalMs, locale) : <span className="text-ink-3">{t("worker.unknownInterval")}</span>}
                </Td>
                <Td label={t("worker.columns.host")} className="font-mono text-xs">
                  {job.host ?? <Unknown label={t("states.unknown")} />}
                </Td>
                <Td label={t("worker.columns.error")}>
                  {job.lastError ? (
                    <details className="group">
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-[var(--radius-control-sm)] text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="size-3.5 transition-transform duration-[var(--motion-fast)] group-open:rotate-180" aria-hidden="true" />
                        <span className="sr-only">{t("worker.errorFor", { job: job.job })}</span>
                        <span aria-hidden="true">{t("worker.showError")}</span>
                      </summary>
                      <p className="mt-1 max-w-md font-mono text-xs break-words text-ink-2">{job.lastError}</p>
                    </details>
                  ) : (
                    <span className="text-ink-3">{t("worker.noError")}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </HealthSection>
  );
}
