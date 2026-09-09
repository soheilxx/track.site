import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { SLA_PATHS } from "@/components/ops/support/sla/constants";
import { PoliciesTable } from "@/components/ops/support/sla/policies-table";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { listSlaPolicies } from "./queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportSla.pages.list");
  return { title: t("title") };
}

/**
 * Track Operations → Support → Settings → SLA policies (docs/18 §"SLA engine"). Admin only
 * (`platform.sla.manage`): the policies with their targets, business hours and escalation, the row
 * actions (edit, make default, delete) and a plain description of what the worker job does with them.
 */
export default async function OpsSupportSlaPage() {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [t, locale, policies] = await Promise.all([getTranslations("supportSla"), platformLocale(access.ctx.user), listSlaPolicies(access.ctx)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("pages.list.title")}
        intro={t("pages.list.intro")}
        context={
          <Link href={SLA_PATHS.settings} className="text-primary underline-offset-4 hover:underline">
            {t("nav.settings")}
          </Link>
        }
        actions={
          <Link href={SLA_PATHS.create} className={buttonVariants()} data-testid="ops-sla-new">
            <Plus className="size-4" aria-hidden="true" />
            {t("nav.new")}
          </Link>
        }
      />
      <SupportSubnav current="settings" role={access.ctx.platformRole} />
      <PoliciesTable policies={policies} locale={locale} />
      <section aria-labelledby="ops-sla-how-title" className="rounded-[var(--radius-card)] border border-dashed border-line-2 px-4 py-3 text-sm">
        <h2 id="ops-sla-how-title" className="font-semibold text-ink">
          {t("howItWorks.title")}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-3">
          <li>{t("howItWorks.clocks")}</li>
          <li>{t("howItWorks.warnings")}</li>
          <li>{t("howItWorks.breaches")}</li>
          <li>{t("howItWorks.autoClose")}</li>
          <li>{t("howItWorks.selection")}</li>
        </ul>
      </section>
    </div>
  );
}
