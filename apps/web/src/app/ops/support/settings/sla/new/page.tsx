import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PLAN_IDS } from "@track-site/catalog";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { SLA_PATHS } from "@/components/ops/support/sla/constants";
import { PolicyForm } from "@/components/ops/support/sla/policy-form";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { defaultSlaPolicyFormValues } from "@/server/support/sla";
import { listPlatformUsers } from "../queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportSla.pages.new");
  return { title: t("title") };
}

/** New SLA policy, prefilled with the seeded defaults (admin, `platform.sla.manage`). */
export default async function OpsSupportSlaNewPage() {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [t, locale, operators] = await Promise.all([getTranslations("supportSla"), platformLocale(access.ctx.user), listPlatformUsers(access.ctx)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("pages.new.title")}
        intro={t("pages.new.intro")}
        context={
          <Link href={SLA_PATHS.list} className="text-primary underline-offset-4 hover:underline">
            {t("nav.list")}
          </Link>
        }
      />
      <PolicyForm mode="create" initial={defaultSlaPolicyFormValues()} plans={PLAN_IDS} operators={operators} locale={locale} />
    </div>
  );
}
