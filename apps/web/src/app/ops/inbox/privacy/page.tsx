import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PrivacyOverview } from "@/components/ops/inbox/privacy-overview";
import { InboxSubnav } from "@/components/ops/inbox/subnav";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { loadPrivacyOverview } from "@/server/ops/inbox";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsInbox.privacy");
  return { title: t("title") };
}

/** Data subject requests across tenants: counts and due dates per organisation, never subjects or reports. */
export default async function OpsInboxPrivacyPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale, overview] = await Promise.all([getTranslations("opsInbox.privacy"), platformLocale(ctx.user), loadPrivacyOverview(ctx)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader title={t("title")} intro={t("intro")} />
      <InboxSubnav current="privacy" />
      <PrivacyOverview overview={overview} locale={locale} now={new Date().toISOString()} />
    </div>
  );
}
