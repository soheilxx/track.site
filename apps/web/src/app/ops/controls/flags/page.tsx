import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FlagCreateForm, FlagsTable } from "@/components/ops/controls/flags-table";
import { OpsForbidden } from "@/components/ops/shell";
import { listFeatureFlags } from "@/server/ops/controls";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tOps] = await Promise.all([getTranslations("opsControls.flags"), getTranslations("ops.pages.controls")]);
  return { title: `${t("title")} · ${tOps("title")}` };
}

/** Controls → feature flags: global defaults with override counts, the code-registered keys, and the create form. */
export default async function OpsFlagsPage() {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [t, locale, flags] = await Promise.all([getTranslations("opsControls.flags"), platformLocale(access.ctx.user), listFeatureFlags(access.ctx)]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FlagsTable flags={flags} locale={locale} />
        <FlagCreateForm />
      </div>
    </div>
  );
}
