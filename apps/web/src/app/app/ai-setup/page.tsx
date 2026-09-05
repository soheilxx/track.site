import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadSetupState } from "@track-site/ai";
import { activeVersion, defaultEnvironment, withTenant } from "@track-site/db";
import { EmptyState, buttonVariants } from "@track-site/ui";
import { SetupChat } from "@/components/chat/setup-chat";
import { aiConfigured } from "@/server/ai/context";
import { db } from "@/server/db";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * AI Setup for the active workspace site: the step form on the page, the chat in the persistent
 * Track AI panel (bound to this site). A site whose default environment has no published
 * configuration is in its first-run setup: Track AI starts large and central on this page and
 * docks back into the panel after the verified publish (supplement §9).
 */
export default async function AiSetupPage() {
  const ctx = await requireOrgContext("ai.chat");
  const t = await getTranslations("shell.pages.aiSetup");
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
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
  const site = workspace.site;
  const [state, firstRun] = await Promise.all([
    loadSetupState(db(), ctx.organization.id, site.id, ctx.user.locale),
    withTenant(db(), ctx.organization.id, async (tx) => {
      const environment = await defaultEnvironment(tx, site.id);
      return environment ? (await activeVersion(tx, environment.id)) === null : true;
    }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
        <p className="mt-2 text-sm text-ink-2">
          {t("siteContext", { site: site.name })} · <span className="font-mono text-ink-3">{site.trackingId}</span>
          {site.primaryDomain ? <span className="text-ink-3"> · {site.primaryDomain}</span> : null}
        </p>
      </div>
      <SetupChat siteId={site.id} aiEnabled={aiConfigured()} locale={ctx.user.locale} initialStep={state.currentStep} firstRun={firstRun} />
    </div>
  );
}
