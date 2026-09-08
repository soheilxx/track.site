import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AlertDigest } from "@/components/ops/inbox/alert-digest";
import { InboxSubnav } from "@/components/ops/inbox/subnav";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { ALERT_DIGEST_DAYS, loadAlertDigest } from "@/server/ops/inbox";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsInbox.alerts");
  return { title: t("title") };
}

/** Cross-tenant alert digest: events of the last seven days grouped by kind and organisation (counts only). */
export default async function OpsInboxAlertsPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale, digest] = await Promise.all([getTranslations("opsInbox.alerts"), platformLocale(ctx.user), loadAlertDigest(ctx)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader title={t("title")} intro={t("intro", { days: ALERT_DIGEST_DAYS })} />
      <InboxSubnav current="alerts" />
      <AlertDigest digest={digest} locale={locale} now={new Date().toISOString()} />
    </div>
  );
}
