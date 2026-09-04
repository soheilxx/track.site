import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, buttonVariants } from "@track-site/ui";
import { EventsNav } from "@/components/app/events/events-nav";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Events module frame (supplement §8 modules 2, 3, 5): the active workspace site and environment as
 * context line plus the sub-navigation overview · coverage · explorer · test lab. Pages render their
 * own <h1>. Without a site the module shows one honest empty state and no page content.
 */
export default async function EventsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("events.module");
  const workspace = await activeSite(ctx);
  if (!workspace.site) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <EmptyState
          title={t("noSite")}
          description={t("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("createSite")}
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">
          {t("title")} · <span className="normal-case tracking-normal text-ink-2">{workspace.site.name}</span>
          {workspace.environment ? <span className="normal-case tracking-normal"> · {t(`environment.${workspace.environment.kind}`)}</span> : null}
        </p>
        <EventsNav />
      </div>
      {children}
    </div>
  );
}
