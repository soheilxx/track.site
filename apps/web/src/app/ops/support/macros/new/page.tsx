import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { MacroEditor } from "@/components/ops/support/macros/macro-editor";
import { SupportSubnav } from "@/components/ops/support/subnav";
import { checkPlatform } from "@/server/ops/platform";
import { listMacros, macroCategories } from "@/server/support/macros";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportMacros.editor");
  return { title: t("createTitle") };
}

/** New macro: personal for every operator, global for admins (the action re-checks the scope). */
export default async function OpsSupportMacroNewPage() {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.macros.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const [t, macros] = await Promise.all([getTranslations("supportMacros"), listMacros(ctx)]);
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={t("editor.createTitle")}
        intro={t("editor.intro")}
        actions={
          <Link href="/ops/support/macros" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("editor.backToList")}
          </Link>
        }
      />
      <SupportSubnav current="macros" role={ctx.platformRole} />
      <MacroEditor macro={null} canManageGlobal={ctx.platformRole === "PLATFORM_ADMIN"} agentName={ctx.user.name} categories={macroCategories(macros)} />
    </div>
  );
}
