import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { formatDateTime } from "@/components/ops/content/format";
import { ContentHeader } from "@/components/ops/content/header";
import { PathsOverview } from "@/components/ops/content/paths-overview";
import { Footnote } from "@/components/ops/content/section";
import { ContentSubnav } from "@/components/ops/content/subnav";
import { OpsForbidden } from "@/components/ops/shell";
import { loadPathsOverview } from "@/server/ops/content";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsContent.sections");
  return { title: t("paths") };
}

/** Curated learning paths per locale: listed vs. resolved article ids and what the public hub shows. */
export default async function OpsContentPathsPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale] = await Promise.all([getTranslations("opsContent"), platformLocale(ctx.user)]);
  const overview = await loadPathsOverview();
  return (
    <div className="space-y-6">
      <ContentHeader section="paths" intro={t("paths.intro")} locale={locale} />
      <ContentSubnav current="paths" />
      <PathsOverview overview={overview} locale={locale} />
      <Footnote>{t("common.generatedAt", { time: formatDateTime(overview.generatedAt, locale) ?? overview.generatedAt })}</Footnote>
    </div>
  );
}
