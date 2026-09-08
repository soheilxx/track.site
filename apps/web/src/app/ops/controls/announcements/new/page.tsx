import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PLAN_IDS } from "@track-site/catalog";
import { buttonVariants } from "@track-site/ui";
import { AnnouncementForm } from "@/components/ops/controls/announcement-form";
import { toUtcInputValue } from "@/components/ops/controls/format";
import { OpsForbidden } from "@/components/ops/shell";
import { checkPlatform } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tOps] = await Promise.all([getTranslations("opsControls.announcements.form"), getTranslations("ops.pages.controls")]);
  return { title: `${t("title")} · ${tOps("title")}` };
}

/** Controls → new announcement. */
export default async function OpsNewAnnouncementPage() {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const t = await getTranslations("opsControls.announcements.form");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("text")}</p>
        </div>
        <Link href="/ops/controls/announcements" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden="true" /> {t("back")}
        </Link>
      </div>
      <AnnouncementForm plans={PLAN_IDS} defaultStartsAt={toUtcInputValue(new Date())} />
    </div>
  );
}
