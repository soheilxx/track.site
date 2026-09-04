import { getTranslations } from "next-intl/server";
import { Banner } from "@track-site/ui";
import { loadCommandCenter } from "@/server/command-center";
import type { OrgContext } from "@/server/session";
import type { Workspace } from "@/server/workspace";
import { ChartsSection } from "./chart-section";
import { safeTimeZone } from "./format";
import { PrioritySection } from "./priority";
import { RecentEvents } from "./recent-events";
import { StatusStrip } from "./status-strip";

/**
 * Body of the Command Center, streamed behind the page header: loads every measurement for the
 * workspace site and composes priorities → status strip → charts → last verified events. A failed
 * measurement is announced as partial data, never replaced by a guess.
 */
export async function CommandCenterBody({ ctx, workspace, locale }: { ctx: OrgContext; workspace: Workspace; locale: string }) {
  const data = await loadCommandCenter(ctx, workspace);
  if (!data) return null;
  const t = await getTranslations("commandCenter");
  const timeZone = safeTimeZone(data.facts.siteStatus.value?.timezone);
  return (
    <div className="space-y-6" data-testid="cc-body">
      {data.unavailable.length > 0 ? (
        <Banner tone="warn" title={t("partial.title")} data-testid="cc-partial">
          {t("partial.text", { list: data.unavailable.map((key) => t(`measurements.${key}`)).join(", ") })}
        </Banner>
      ) : null}
      <PrioritySection data={data} locale={locale} timeZone={timeZone} />
      <StatusStrip facts={data.facts} locale={locale} timeZone={timeZone} />
      <ChartsSection facts={data.facts} locale={locale} timeZone={timeZone} />
      <RecentEvents facts={data.facts} locale={locale} timeZone={timeZone} />
      <p className="text-xs text-ink-3">{t("footer.note", { site: data.facts.site.name, environment: data.facts.environment?.name ?? t("context.noEnvironment") })}</p>
    </div>
  );
}
