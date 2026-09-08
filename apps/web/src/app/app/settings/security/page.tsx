import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SettingsSubnav } from "@/components/app/settings/subnav";
import { TwoFactorPanel } from "@/components/app/settings/security/two-factor-panel";
import { requireUser } from "@/server/session";
import { loadTwoFactorStatus } from "./data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("security");
  return { title: t("title") };
}

/**
 * Security (`/app/settings/security`): self-service two-factor authentication of the signed-in
 * account — status, enrolment (password → QR code → code → backup codes), disable, new backup codes.
 * Account-level, so it needs a session but no organisation: a platform operator who is no member of
 * any organisation enrols here before the operations console lets them in (docs/17 §3).
 */
export default async function SecuritySettingsPage() {
  const user = await requireUser();
  const [t, locale, status] = await Promise.all([getTranslations("security"), getLocale(), loadTwoFactorStatus(user)]);
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("intro")}</p>
        </div>
        <SettingsSubnav />
      </div>
      <div className="max-w-3xl">
        <TwoFactorPanel
          enabled={status.enabled}
          enabledSince={status.enabledSince?.toISOString() ?? null}
          backupCodesRemaining={status.backupCodesRemaining}
          account={user.email}
          platformRole={user.platformRole}
          locale={locale}
        />
      </div>
    </div>
  );
}
