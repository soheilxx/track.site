import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PLAN_IDS } from "@track-site/catalog";
import { Badge } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { SLA_PATHS } from "@/components/ops/support/sla/constants";
import { formatDateTime } from "@/components/ops/support/sla/format";
import { PolicyForm } from "@/components/ops/support/sla/policy-form";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { policyToFormValues } from "@/server/support/sla";
import { listPlatformUsers, loadSlaPolicy } from "../queries";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("supportSla.pages.edit");
  return { title: `${t("title")} · ${id.slice(0, 8)}` };
}

/** Edit one SLA policy (admin, `platform.sla.manage`); unknown ids render the console's not-found page. */
export default async function OpsSupportSlaEditPage({ params }: { params: Params }) {
  const access = await checkPlatform("PLATFORM_ADMIN", "platform.sla.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { id } = await params;
  const [t, locale, policy, operators] = await Promise.all([getTranslations("supportSla"), platformLocale(access.ctx.user), loadSlaPolicy(access.ctx, id), listPlatformUsers(access.ctx)]);
  if (!policy) notFound();
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={policy.name}
        intro={t("pages.edit.intro")}
        context={
          <>
            <Link href={SLA_PATHS.list} className="text-primary underline-offset-4 hover:underline">
              {t("nav.list")}
            </Link>
            {policy.isDefault ? <Badge tone="info">{t("table.defaultBadge")}</Badge> : null}
            <span>{t("edit.tickets", { count: policy.ticketCount })}</span>
            <span>{t("edit.updatedAt", { at: formatDateTime(policy.updatedAt, locale) ?? t("common.unknown") })}</span>
          </>
        }
      />
      <PolicyForm mode="edit" initial={policyToFormValues(policy)} plans={PLAN_IDS} operators={operators} locale={locale} />
    </div>
  );
}
