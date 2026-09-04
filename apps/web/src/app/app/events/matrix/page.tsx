import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, EmptyState, buttonVariants } from "@track-site/ui";
import { CoverageLegend, CoverageTable } from "@/components/app/events/coverage-table";
import { formatDateTime } from "@/components/app/events/format";
import { loadCoverageMatrix } from "@/server/events";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Event Coverage Matrix (supplement §8 module 2) for the active site and environment.
 *
 * Route segment is `matrix` (URL /app/events/matrix), not `coverage`: the shared ignore lists
 * (the eslint.config.mjs coverage glob, .prettierignore, tsconfig.base.json `exclude`, .gitignore)
 * treat every `coverage/` directory as test-coverage output and would silently skip this page.
 */
export default async function CoveragePage() {
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("events.coverage");
  const tm = await getTranslations("events.module");
  const locale = await getLocale();
  const workspace = await activeSite(ctx);
  if (!workspace.site) return null;
  if (!workspace.environment) return <EmptyState title={tm("noEnvironment")} />;
  const matrix = await loadCoverageMatrix(ctx, workspace.site, workspace.environment);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
        </div>
        <p className="text-xs text-ink-3">
          {matrix.configVersion !== null ? t("configVersion", { version: matrix.configVersion }) : t("noConfig")} · {t("generatedAt", { time: formatDateTime(matrix.generatedAt, locale) })}
        </p>
      </div>
      {!matrix.hasPlan && !matrix.hasDefinitions ? (
        <Alert tone="info" title={t("noPlanTitle")}>
          {t("noPlanText")}
        </Alert>
      ) : null}
      {matrix.rows.length === 0 ? (
        <EmptyState
          title={t("empty")}
          description={t("emptyText")}
          action={
            <Link href="/app/ai-setup" className={buttonVariants()}>
              {t("emptyAction")}
            </Link>
          }
        />
      ) : (
        <>
          <CoverageLegend />
          <div className="rounded-[var(--radius-card)] border border-line bg-surface">
            <CoverageTable matrix={matrix} />
          </div>
        </>
      )}
    </div>
  );
}
