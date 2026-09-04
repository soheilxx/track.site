import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { InsightsSubnav } from "@/components/app/insights/subnav";

/** Insights module frame: eyebrow + section navigation (Overview, Attribution, Audiences); each page owns its h1. */
export default async function InsightsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("insights");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("eyebrow")}</p>
        <InsightsSubnav className="mt-2" />
      </div>
      {children}
    </div>
  );
}
