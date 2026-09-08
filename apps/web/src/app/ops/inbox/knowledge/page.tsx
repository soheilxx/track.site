import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KnowledgeDigest } from "@/components/ops/inbox/knowledge-digest";
import { InboxSubnav } from "@/components/ops/inbox/subnav";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { KNOWLEDGE_DIGEST_DAYS, loadKnowledgeDigest } from "@/server/ops/inbox";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsInbox.knowledge");
  return { title: t("title") };
}

/** Knowledge feedback digest: helpful / not helpful votes per article over the last 30 days (anonymous by design). */
export default async function OpsInboxKnowledgePage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale] = await Promise.all([getTranslations("opsInbox.knowledge"), platformLocale(ctx.user)]);
  const digest = await loadKnowledgeDigest(ctx, locale);
  return (
    <div className="space-y-6">
      <OpsPageHeader title={t("title")} intro={t("intro", { days: KNOWLEDGE_DIGEST_DAYS })} />
      <InboxSubnav current="knowledge" />
      <KnowledgeDigest digest={digest} locale={locale} now={new Date().toISOString()} />
    </div>
  );
}
