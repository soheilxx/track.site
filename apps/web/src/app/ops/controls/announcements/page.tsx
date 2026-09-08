import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@track-site/ui";
import { AnnouncementsTable } from "@/components/ops/controls/announcements-table";
import { OpsForbidden } from "@/components/ops/shell";
import { listAnnouncements, organizationNames } from "@/server/ops/controls";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tOps] = await Promise.all([getTranslations("opsControls.announcements"), getTranslations("ops.pages.controls")]);
  return { title: `${t("title")} · ${tOps("title")}` };
}

/** Controls → announcements: every announcement with status, window and audience; create and revoke. */
export default async function OpsAnnouncementsPage() {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [t, locale, items] = await Promise.all([getTranslations("opsControls.announcements"), platformLocale(access.ctx.user), listAnnouncements(access.ctx)]);
  const ids = [...new Set(items.flatMap((i) => i.audience.organizationIds ?? []))];
  const names = await organizationNames(access.ctx, ids);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("intro")}</p>
        </div>
        <Link href="/ops/controls/announcements/new" className={buttonVariants()} data-testid="ops-announcement-new">
          <Plus className="size-4" aria-hidden="true" /> {t("new")}
        </Link>
      </div>
      <AnnouncementsTable items={items} organisations={Object.fromEntries(names)} locale={locale} />
    </div>
  );
}
