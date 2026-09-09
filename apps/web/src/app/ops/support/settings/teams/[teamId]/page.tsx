import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { SettingsSubnav } from "@/components/ops/support/settings/subnav";
import { TeamForm } from "@/components/ops/support/teams/team-form";
import { TeamMembers } from "@/components/ops/support/teams/team-members";
import { TeamState } from "@/components/ops/support/teams/team-state";
import { checkPlatform, platformLocale, withPlatform } from "@/server/ops/platform";
import { listTeamOperatorOptions, loadTeam } from "@/server/support/teams";

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }): Promise<Metadata> {
  const [{ teamId }, t] = await Promise.all([params, getTranslations("supportTeams.settings")]);
  return { title: `${t("title")} · ${teamId.slice(0, 8)}` };
}

/**
 * One team (admin-only, `platform.sla.manage`): rename, members with roles, default flag, archive / restore.
 * Unknown ids answer 404.
 */
export default async function OpsSupportTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const { teamId } = await params;
  const [t, locale, data] = await Promise.all([
    getTranslations("supportTeams"),
    platformLocale(ctx.user),
    withPlatform(ctx, async (tx) => {
      const team = await loadTeam(tx, teamId);
      return team ? { team, operators: await listTeamOperatorOptions(tx) } : null;
    }),
  ]);
  if (!data) notFound();
  const { team, operators } = data;
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={team.name}
        intro={t("settings.detailIntro")}
        context={
          <>
            <span className="font-mono text-xs text-ink-3">{team.slug}</span>
            {team.isDefault ? <Badge tone="primary">{t("settings.default")}</Badge> : null}
            {team.archivedAt ? <Badge tone="neutral">{t("settings.archived")}</Badge> : null}
          </>
        }
        actions={
          <Link href="/ops/support/settings/teams" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("settings.backToTeams")}
          </Link>
        }
      />
      <SettingsSubnav current="general" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <TeamMembers team={team} operators={operators} selfId={ctx.user.id} locale={locale} />
        </div>
        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <TeamForm team={team} />
          <TeamState team={team} locale={locale} />
        </div>
      </div>
    </div>
  );
}
