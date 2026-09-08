import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { formatDateTime } from "@/components/ops/content/format";
import { Freshness } from "@/components/ops/content/freshness";
import { ContentHeader } from "@/components/ops/content/header";
import { Footnote } from "@/components/ops/content/section";
import { ContentSubnav } from "@/components/ops/content/subnav";
import { OpsForbidden } from "@/components/ops/shell";
import { loadContentFreshness } from "@/server/ops/content";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsContent.sections");
  return { title: t("freshness") };
}

/** Sitemap and feed freshness: the last production build and, per locale, the counts the static routes would render now. */
export default async function OpsContentFreshnessPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale] = await Promise.all([getTranslations("opsContent"), platformLocale(ctx.user)]);
  const freshness = await loadContentFreshness();
  return (
    <div className="space-y-6">
      <ContentHeader section="freshness" intro={t("freshness.intro")} locale={locale} />
      <ContentSubnav current="freshness" />
      <Freshness freshness={freshness} locale={locale} now={freshness.generatedAt} />
      <Footnote>{t("common.generatedAt", { time: formatDateTime(freshness.generatedAt, locale) ?? freshness.generatedAt })}</Footnote>
    </div>
  );
}
