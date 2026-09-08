import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { formatDateTime } from "@/components/ops/content/format";
import { ContentHeader } from "@/components/ops/content/header";
import { IntegrationCoverage } from "@/components/ops/content/integration-coverage";
import { Footnote } from "@/components/ops/content/section";
import { ContentSubnav } from "@/components/ops/content/subnav";
import { OpsForbidden } from "@/components/ops/shell";
import { loadIntegrationCoverage } from "@/server/ops/content";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("opsContent.sections");
  return { title: t("integrations") };
}

/** Integration catalogue coverage: published knowledge articles per locale and vendor documentation per catalogue entry. */
export default async function OpsContentIntegrationsPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, locale] = await Promise.all([getTranslations("opsContent"), platformLocale(ctx.user)]);
  const coverage = await loadIntegrationCoverage(locale);
  return (
    <div className="space-y-6">
      <ContentHeader section="integrations" intro={t("integrations.intro")} locale={locale} />
      <ContentSubnav current="integrations" />
      <IntegrationCoverage coverage={coverage} locale={locale} />
      <Footnote>{t("common.generatedAt", { time: formatDateTime(coverage.generatedAt, locale) ?? coverage.generatedAt })}</Footnote>
    </div>
  );
}
