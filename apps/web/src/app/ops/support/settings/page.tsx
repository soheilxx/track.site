import { ArrowLeft, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { SettingsOverview } from "@/components/ops/support/settings/overview";
import { SettingsSubnav } from "@/components/ops/support/settings/subnav";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { countAgentsOnline, listSlaPolicySummaries, loadInboundLedger, loadSupportSettings } from "@/server/support/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support.pages.settings");
  return { title: t("title") };
}

/**
 * Track Operations → Support → Settings (docs/18 §11, task T5): overview of the saved desk settings, the
 * agents online, the inbound e-mail ledger (webhook outcomes incl. failures) and the SLA policies as stored.
 * Admin-only (`platform.sla.manage`); the general form lives under `/ops/support/settings/general`.
 */
export default async function OpsSupportSettingsPage() {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, tSupport, locale, settings, policies, agentsOnline, ledger] = await Promise.all([
    getTranslations("supportMacros"),
    getTranslations("support"),
    platformLocale(ctx.user),
    loadSupportSettings(ctx),
    listSlaPolicySummaries(ctx),
    countAgentsOnline(ctx),
    loadInboundLedger(ctx),
  ]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={tSupport("pages.settings.title")}
        intro={t("settings.overview.intro")}
        actions={
          <>
            <Link href="/ops/support" className={buttonVariants({ variant: "secondary" })}>
              <ArrowLeft className="size-4" aria-hidden="true" /> {t("common.backToSupport")}
            </Link>
            <Link href="/ops/support/macros" className={buttonVariants({ variant: "secondary" })} data-testid="support-settings-macros">
              <ScrollText className="size-4" aria-hidden="true" /> {t("common.toMacros")}
            </Link>
          </>
        }
      />
      <SupportSubnav current="settings" role={ctx.platformRole} />
      <SettingsSubnav current="overview" />
      <SettingsOverview settings={settings} policies={policies} agentsOnline={agentsOnline} ledger={ledger} locale={locale} />
    </div>
  );
}
