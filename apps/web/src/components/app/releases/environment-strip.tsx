import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Status, cn } from "@track-site/ui";
import type { EnvironmentReleaseState } from "@/server/releases";
import { formatDateTime, formatRelative } from "./format";
import { ENVIRONMENT_TONE } from "./labels";

/**
 * One card per environment of the site (Test / Staging / Production): the live version, the open
 * draft with its state, the number of versions. Each card is a link that focuses the page on that
 * environment (`?env=`), so every view has a shareable URL; the selected card carries `aria-current`.
 */
export async function EnvironmentStrip({ states, selectedId, locale }: { states: EnvironmentReleaseState[]; selectedId: string | null; locale: string }) {
  const t = await getTranslations("releases");
  return (
    <nav aria-label={t("environment.navLabel")}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {states.map((s) => {
          const selected = s.environment.id === selectedId;
          const kind = t(`environment.kind.${s.environment.kind}`);
          return (
            <li key={s.environment.id} className="min-w-0">
              <Link
                href={`/app/releases?env=${s.environment.id}`}
                aria-current={selected ? "true" : undefined}
                data-testid={`release-env-${s.environment.kind}`}
                className={cn(
                  "block h-full min-w-0 rounded-[var(--radius-card)] border bg-surface p-4 shadow-card transition-colors duration-[var(--motion-fast)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  selected ? "border-primary" : "border-line hover:border-line-2",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Status tone={ENVIRONMENT_TONE[s.environment.kind]} chip indicator="both">
                    {kind}
                    {s.environment.testMode ? ` · ${t("environment.testMode")}` : ""}
                  </Status>
                  <span className="text-xs text-ink-3">{s.environment.name}</span>
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{t("strip.active")}</dt>
                    <dd className="text-ink">
                      {s.active ? (
                        <>
                          <span className="font-semibold tabular-nums">{t("strip.version", { version: s.active.version })}</span>
                          <span className="text-ink-2"> · {t("strip.publishedAgo", { time: formatRelative(s.active.publishedAt, locale) })}</span>
                          {s.active.kind === "rollback" ? <span className="text-ink-3"> · {t("strip.restored")}</span> : null}
                        </>
                      ) : (
                        <span className="text-ink-3">{t("strip.noActive")}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{t("strip.draft")}</dt>
                    <dd className="text-ink">
                      {!s.available ? (
                        <span className="text-ink-3">{t("migrationMissing")}</span>
                      ) : s.draft ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold tabular-nums">{t("strip.version", { version: s.draft.nextVersion })}</span>
                          <span className="text-ink-2">{t("strip.draftChanges", { count: s.draft.changes })}</span>
                          {s.draft.lintErrors > 0 ? (
                            <Status tone="bad" indicator="icon" className="text-xs">
                              {t("strip.lintErrors", { count: s.draft.lintErrors })}
                            </Status>
                          ) : null}
                          {s.draft.scheduleError ? (
                            <Status tone="bad" indicator="icon" className="text-xs">
                              {t("strip.scheduleFailed")}
                            </Status>
                          ) : s.draft.scheduledAt ? (
                            <Status tone="info" indicator="icon" className="text-xs">
                              {t("strip.scheduled", { time: formatDateTime(s.draft.scheduledAt, locale) })}
                            </Status>
                          ) : null}
                          {s.draft.pendingApprovals > 0 ? (
                            <Status tone="info" indicator="icon" className="text-xs">
                              {t("strip.approvalsPending", { count: s.draft.pendingApprovals })}
                            </Status>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-ink-3">{t("strip.noDraft")}</span>
                      )}
                    </dd>
                  </div>
                  <div className="text-xs text-ink-3">
                    <dt className="sr-only">{t("history.title")}</dt>
                    <dd>{t("strip.versions", { count: s.versions })}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
