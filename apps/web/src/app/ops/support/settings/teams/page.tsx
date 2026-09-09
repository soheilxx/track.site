import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { SettingsSubnav } from "@/components/ops/support/settings/subnav";
import { TeamForm } from "@/components/ops/support/teams/team-form";
import { TeamsTable } from "@/components/ops/support/teams/teams-table";
import { checkPlatform, platformLocale, withPlatform } from "@/server/ops/platform";
import { listTeams } from "@/server/support/teams";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportTeams.settings");
  return { title: t("title") };
}

/**
 * Support → Settings → Teams (docs/18 §"Agent-created tickets and teams"): every team with member and
 * open-ticket counts, the create form. Admin-only like every desk setting (`platform.sla.manage`).
 */
export default async function OpsSupportTeamsPage() {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale, teams] = await Promise.all([getTranslations("supportTeams"), platformLocale(ctx.user), withPlatform(ctx, listTeams)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("settings.title")}
        intro={t("settings.intro")}
        actions={
          <Link href="/ops/support/settings" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("common.toSettings")}
          </Link>
        }
      />
      <SettingsSubnav current="general" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TeamsTable teams={teams} locale={locale} />
        <TeamForm team={null} />
      </div>
    </div>
  );
}
