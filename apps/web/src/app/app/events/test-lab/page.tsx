import { getTranslations } from "next-intl/server";
import { can } from "@track-site/core";
import { TestLab } from "@/components/app/events/test-lab";
import { env } from "@/env";
import { loadTestLabRuns, loadTestLabTimeline, testEnvironmentOf } from "@/server/events";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * Live Test Lab (supplement §8 module 5): guided PageView / Lead / AddToCart / Checkout / Purchase
 * journeys sent through the real collector with an ephemeral key of the site's test-mode environment.
 * Running a journey needs `sites.update` (the action enforces it); everyone with `events.read` can
 * inspect past runs.
 */
export default async function TestLabPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("events.testLab");
  const workspace = await activeSite(ctx);
  if (!workspace.site) return null;
  const site = workspace.site;
  const environment = testEnvironmentOf(workspace.environments);
  const { runs, available } = await loadTestLabRuns(ctx, site);
  const runId = q.run && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(q.run) ? q.run : (runs[0]?.id ?? null);
  const initialTimeline = runId && available ? await loadTestLabTimeline(ctx, site, runId) : null;
  const e = env();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      <TestLab siteId={site.id} environment={environment ? { id: environment.id, kind: environment.kind, name: environment.name } : null} ingestHost={e.HOST_INGEST ?? null} canRun={can(ctx.role, "sites.update")} available={available} runs={runs} initialTimeline={initialTimeline} />
    </div>
  );
}
