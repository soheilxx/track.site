import { FlaskConical, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { Banner, EmptyState, Status, buttonVariants } from "@track-site/ui";
import { DraftPanel } from "@/components/app/releases/draft-panel";
import { EnvironmentStrip } from "@/components/app/releases/environment-strip";
import { ImpactPreview } from "@/components/app/releases/impact-preview";
import { ENVIRONMENT_TONE } from "@/components/app/releases/labels";
import { ReleasesPageHeader } from "@/components/app/releases/page-header";
import { VersionsTable } from "@/components/app/releases/versions-table";
import { loadDraftDetail, loadEnvironmentStates, loadVersionHistory, memberDirectory, selectEnvironment } from "@/server/releases";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Change & Release Center (supplement §8, module 9) with the Change Impact Preview (module 10):
 * per environment of the active site the live version and the open draft; for the selected
 * environment the draft with lint, readable diff, four-eyes approvals, schedule, test evidence, the
 * impact preview and the version history. Reading needs `config.read`; every action enforces its own
 * permission server-side. The scope (site) comes from the workspace, the focused environment from
 * `?env=` (validated against the site) with the shell's environment as default.
 */
export default async function ReleasesPage({ searchParams }: { searchParams: Promise<{ env?: string }> }) {
  const [q, ctx] = await Promise.all([searchParams, requireOrgContext("config.read")]);
  const [t, workspace] = await Promise.all([getTranslations("releases"), activeSite(ctx)]);
  const locale = ctx.user.locale;
  const site = workspace.site;

  if (!site) {
    return (
      <div className="space-y-6">
        <ReleasesPageHeader title={t("title")} intro={t("intro")} />
        <EmptyState
          title={t("noSite")}
          description={t("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("createSite")}
            </Link>
          }
        />
      </div>
    );
  }

  const environment = selectEnvironment(workspace.environments, workspace.environment, q.env);
  const directory = await memberDirectory(ctx);
  const [states, draft, history] = await Promise.all([
    loadEnvironmentStates(ctx, site, workspace.environments, directory.names),
    environment ? loadDraftDetail(ctx, site, environment, workspace.environments, directory) : Promise.resolve(null),
    environment ? loadVersionHistory(ctx, site, environment, directory.names) : Promise.resolve([]),
  ]);
  const available = states.length === 0 || states.every((s) => s.available);
  const canPublish = can(ctx.role, "config.publish");
  const canDraft = can(ctx.role, "config.draft");
  const envLabel = environment ? t(`environment.kind.${environment.kind}`) : null;

  return (
    <div className="space-y-8">
      <ReleasesPageHeader
        title={t("title")}
        intro={t("intro")}
        context={
          <>
            <span>
              {t("siteContext", { site: site.name })} · <span className="font-mono text-ink-3">{site.trackingId}</span>
            </span>
            {environment ? (
              <Status tone={ENVIRONMENT_TONE[environment.kind]} chip indicator="both" data-testid="release-environment">
                {envLabel}
                {environment.testMode ? ` · ${t("environment.testMode")}` : ""}
              </Status>
            ) : null}
            <span className="text-ink-3">{t("switchSiteHint")}</span>
          </>
        }
        actions={
          <>
            <Link href="/app/ai-setup" className={buttonVariants({ variant: "secondary" })}>
              <Sparkles className="size-4" aria-hidden="true" /> {t("links.aiSetup")}
            </Link>
            <Link href="/app/events/test-lab" className={buttonVariants({ variant: "ghost" })}>
              <FlaskConical className="size-4" aria-hidden="true" /> {t("links.testLab")}
            </Link>
          </>
        }
      />

      {!available ? (
        <Banner tone="warn" title={t("migrationMissing")}>
          {t("migrationMissingText")}
        </Banner>
      ) : null}

      <EnvironmentStrip states={states} selectedId={environment?.id ?? null} locale={locale} />

      {environment ? (
        draft ? (
          <>
            <DraftPanel detail={draft} environment={environment} userId={ctx.user.id} canPublish={canPublish} canDraft={canDraft} locale={locale} />
            {!draft.invalid ? <ImpactPreview impact={draft.impact} environment={environment} locale={locale} /> : null}
          </>
        ) : (
          <section aria-labelledby="release-draft-title" className="space-y-4">
            <h2 id="release-draft-title" className="text-lg font-semibold text-ink">
              {t("draft.title", { environment: envLabel ?? "" })}
            </h2>
            <EmptyState
              title={t("draft.empty", { environment: envLabel ?? "" })}
              description={t("draft.emptyText")}
              action={
                <>
                  <Link href="/app/ai-setup" className={buttonVariants()}>
                    {t("links.aiSetup")}
                  </Link>
                  <Link href="/app/destinations" className={buttonVariants({ variant: "secondary" })}>
                    {t("links.destinations")}
                  </Link>
                  <Link href="/app/data-quality" className={buttonVariants({ variant: "ghost" })}>
                    {t("links.dataQuality")}
                  </Link>
                </>
              }
            />
          </section>
        )
      ) : null}

      {environment ? (
        <section aria-labelledby="release-history-title" className="space-y-4" data-testid="release-history">
          <div>
            <h2 id="release-history-title" className="text-lg font-semibold text-ink">
              {t("history.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("history.intro", { environment: envLabel ?? "" })}</p>
          </div>
          <VersionsTable versions={history} locale={locale} />
        </section>
      ) : null}
    </div>
  );
}
