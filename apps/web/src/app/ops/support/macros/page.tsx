import { ArrowLeft, Plus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { MacroList } from "@/components/ops/support/macros/macro-list";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform, platformCan, platformLocale } from "@/server/ops/platform";
import { listMacros, macroCategories } from "@/server/support/macros";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support.pages.macros");
  return { title: t("title") };
}

/**
 * Track Operations → Support → Macros (docs/18, task T5): the global macros and the operator's own personal
 * ones with search (`/`), scope and category filters, actions and usage counts. `platform.macros.manage`;
 * global macros are edited by admins only (the editor and the actions check the scope).
 */
export default async function OpsSupportMacrosPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.macros.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, tSupport, locale, macros] = await Promise.all([getTranslations("supportMacros"), getTranslations("support"), platformLocale(ctx.user), listMacros(ctx)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={tSupport("pages.macros.title")}
        intro={t("list.intro")}
        actions={
          <>
            <Link href="/ops/support" className={buttonVariants({ variant: "secondary" })}>
              <ArrowLeft className="size-4" aria-hidden="true" /> {t("common.backToSupport")}
            </Link>
            {platformCan(ctx, "platform.sla.manage") ? (
              <Link href="/ops/support/settings" className={buttonVariants({ variant: "secondary" })} data-testid="support-macros-settings">
                <Settings2 className="size-4" aria-hidden="true" /> {t("common.toSettings")}
              </Link>
            ) : null}
            <Link href="/ops/support/macros/new" className={buttonVariants()} data-testid="support-macros-new">
              <Plus className="size-4" aria-hidden="true" /> {t("list.new")}
            </Link>
          </>
        }
      />
      <SupportSubnav current="macros" role={ctx.platformRole} />
      <MacroList macros={macros} categories={macroCategories(macros)} locale={locale} />
    </div>
  );
}
