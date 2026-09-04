import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, Status, buttonVariants, type Tone } from "@track-site/ui";
import { CommandCenterBody, CommandCenterSkeleton, PageHeader } from "@/components/app/command-center";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/** Same mapping as the shell's environment indicator: production is the live path, staging/test flag events as test. */
const ENVIRONMENT_TONE: Record<"production" | "staging" | "development", Tone> = { production: "ok", staging: "warn", development: "info" };

/**
 * Tracking Command Center (redesign supplement §8, module 1) for the active workspace site: the
 * header renders immediately, the measured body streams in behind a skeleton. Reading needs the
 * events permission; every module link leads to the workflow that owns the action — this page
 * itself mutates nothing.
 */
export default async function CommandCenterPage() {
  const ctx = await requireOrgContext("events.read");
  const [t, tEnvironment, locale, workspace] = await Promise.all([getTranslations("commandCenter"), getTranslations("shell.environment.kind"), getLocale(), activeSite(ctx)]);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("intro")} />
        <EmptyState
          title={t("noSite.title")}
          description={t("noSite.text")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("noSite.createSite")}
            </Link>
          }
        />
      </div>
    );
  }
  const site = workspace.site;
  const environment = workspace.environment;
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("intro")}
        context={
          <>
            <span>
              {t("context.site")}: <span className="font-medium text-ink">{site.name}</span>
            </span>
            <span>
              {t("context.trackingId")}: <span className="font-mono text-ink">{site.trackingId}</span>
            </span>
            {environment ? (
              <Status tone={ENVIRONMENT_TONE[environment.kind]} chip indicator="both">
                {t("context.environment")}: {tEnvironment(environment.kind)}
              </Status>
            ) : (
              <Status tone="neutral" chip>
                {t("context.noEnvironment")}
              </Status>
            )}
          </>
        }
        actions={
          <>
            <Link href="/app/ai-setup" className={buttonVariants({ size: "sm" })}>
              {t("header.openAiSetup")}
            </Link>
            <Link href={`/app/events?site=${site.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
              {t("header.openEvents")}
            </Link>
            <Link href={`/app/sites/${site.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
              {t("header.openSite")}
            </Link>
          </>
        }
      />
      <Suspense fallback={<CommandCenterSkeleton label={t("loading")} />}>
        <CommandCenterBody ctx={ctx} workspace={workspace} locale={locale} />
      </Suspense>
    </div>
  );
}
