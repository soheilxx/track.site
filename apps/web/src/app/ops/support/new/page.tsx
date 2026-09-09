import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { NewTicketForm } from "@/components/ops/support/new/new-ticket-form";
import { ACTIVE_LOCALES, LOCALE_NAMES } from "@/i18n/routing";
import { checkPlatform, platformCan, platformLocale, withPlatform } from "@/server/ops/platform";
import { listMacros } from "@/server/support/macros";
import { defaultTeamForAgent, listTeamOptions } from "@/server/support/teams";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportTeams.new");
  return { title: t("title") };
}

/**
 * Track Operations → Support → New ticket (docs/18 §"Agent-created tickets and teams", task N). Needs
 * `platform.tickets.write`; loads the macros the operator may use, the active teams and the operator's
 * default team. The form's server action re-checks everything.
 */
export default async function OpsSupportNewTicketPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.tickets.write");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale, macros, teamData] = await Promise.all([
    getTranslations("supportTeams"),
    platformLocale(ctx.user),
    listMacros(ctx),
    withPlatform(ctx, async (tx) => ({ teams: await listTeamOptions(tx), defaultTeam: await defaultTeamForAgent(tx, ctx.user.id) })),
  ]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("new.title")}
        intro={t("new.intro")}
        actions={
          <Link href="/ops/support" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("common.toQueue")}
          </Link>
        }
      />
      <NewTicketForm
        agent={{ id: ctx.user.id, name: ctx.user.name, locale }}
        locales={ACTIVE_LOCALES}
        localeNames={LOCALE_NAMES}
        teams={teamData.teams}
        defaultTeamId={teamData.defaultTeam?.id ?? null}
        macros={macros}
        canAssign={platformCan(ctx, "platform.tickets.assign")}
      />
    </div>
  );
}
