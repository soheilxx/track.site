import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { AutoReplyPreview } from "@/components/ops/support/settings/auto-reply-preview";
import { GeneralSettingsForm } from "@/components/ops/support/settings/general-form";
import { SettingsSubnav } from "@/components/ops/support/settings/subnav";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { FROM_NAME_MAX, ONLINE_WINDOW_MINUTES, SIGNATURE_MAX, businessHoursToForm, countAgentsOnline, loadSupportSettings, previewAutoReply, timeZoneOptions } from "@/server/support/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportMacros.settings.sections");
  return { title: t("general") };
}

/**
 * General desk settings (admin-only, `platform.sla.manage`): sender, reply domain, signature,
 * auto-acknowledgement with its preview, auto-assignment, business hours and CSAT. Blocked senders and the
 * auto-close interval have no storage in this schema and are announced as pending instead of shown.
 */
export default async function OpsSupportSettingsGeneralPage() {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale, settings, agentsOnline] = await Promise.all([getTranslations("supportMacros"), platformLocale(ctx.user), loadSupportSettings(ctx), countAgentsOnline(ctx)]);
  const preview = previewAutoReply(settings, locale);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("settings.sections.general")}
        intro={t("settings.general.intro")}
        actions={
          <Link href="/ops/support/settings" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("common.back")}
          </Link>
        }
      />
      <SettingsSubnav current="general" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <GeneralSettingsForm
          settings={settings}
          hours={businessHoursToForm(settings.businessHours)}
          timeZones={timeZoneOptions()}
          agentsOnline={agentsOnline}
          onlineWindowMinutes={ONLINE_WINDOW_MINUTES}
          limits={{ fromNameMax: FROM_NAME_MAX, signatureMax: SIGNATURE_MAX }}
        />
        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <AutoReplyPreview preview={preview} enabled={settings.autoReplyEnabled} />
          <Alert tone="info" title={t("settings.general.pendingTitle")}>
            {t("settings.general.pendingText")}
          </Alert>
        </div>
      </div>
    </div>
  );
}
