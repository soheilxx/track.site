import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { MacroEditor } from "@/components/ops/support/macros/macro-editor";
import { MacroReadOnly } from "@/components/ops/support/macros/macro-view";
import { checkPlatform, platformLocale } from "@/server/ops/platform";
import { listMacros, macroCategories } from "@/server/support/macros";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("supportMacros.editor");
  return { title: t("editTitle") };
}

/**
 * One macro: the editor when the operator may manage it (own personal macro; global macros for admins),
 * otherwise the read-only view. An unknown id or another operator's personal macro is a 404 — nothing is
 * revealed about it.
 */
export default async function OpsSupportMacroPage({ params }: { params: Promise<{ macroId: string }> }) {
  const access = await checkPlatform("PLATFORM_SUPPORT", "platform.macros.manage");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const { ctx } = access;
  const { macroId } = await params;
  const [t, ts, locale, macros] = await Promise.all([getTranslations("supportMacros"), getTranslations("support"), platformLocale(ctx.user), listMacros(ctx)]);
  const macro = macros.find((m) => m.id === macroId);
  if (!macro) notFound();
  return (
    <div className="space-y-6">
      <OpsPageHeader
        title={macro.editable ? t("editor.editTitle") : t("editor.viewTitle")}
        intro={macro.editable ? t("editor.intro") : undefined}
        context={
          <>
            <span className="font-medium text-ink">{macro.name}</span>
            <Badge tone={macro.scope === "global" ? "info" : "neutral"}>{ts(`macroScope.${macro.scope}`)}</Badge>
          </>
        }
        actions={
          <Link href="/ops/support/macros" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {t("editor.backToList")}
          </Link>
        }
      />
      {macro.editable ? (
        <MacroEditor macro={macro} canManageGlobal={ctx.platformRole === "PLATFORM_ADMIN"} agentName={ctx.user.name} categories={macroCategories(macros)} />
      ) : (
        <MacroReadOnly macro={macro} agentName={ctx.user.name} locale={locale} />
      )}
    </div>
  );
}
