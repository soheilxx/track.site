import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Status, buttonVariants, type Tone } from "@track-site/ui";
import { dateTime } from "@/components/ops/growth/format";
import { COLLECTOR_TONE, JOB_TONE, OVERALL_TONE } from "@/components/ops/health/tones";
import type { PlatformHealthView } from "@/server/ops/health";
import { Unavailable } from "./unavailable";

const TILES = ["collector", "worker", "queues", "deliveries", "database"] as const;
type TileKey = (typeof TILES)[number];

/** Same thresholds as the health page's summary, reduced to one tone per source. */
export function healthTileTones(view: PlatformHealthView): Record<TileKey, Tone> {
  const q = view.queues;
  const queues: Tone = !q.measured ? "neutral" : q.totals.dead > 0 || (q.totals.maxLagMs ?? 0) >= 15 * 60_000 ? "warn" : "ok";
  const d = view.deliveries.totals.last24h;
  const deliveries: Tone = view.deliveries.rows.some((r) => r.warn) ? "warn" : d.total === 0 ? "neutral" : "ok";
  const database: Tone = view.database.state === "ok" && view.vendors.dbProbe ? "ok" : "bad";
  return { collector: COLLECTOR_TONE[view.collector.state], worker: JOB_TONE[view.worker.state], queues, deliveries, database };
}

/** Overall platform state with its reasons and one line per source; the health page has the details. */
export async function HealthCard({ view, locale }: { view: PlatformHealthView | null; locale: string }) {
  const [t, tHealth] = await Promise.all([getTranslations("opsGrowth.overview.health"), getTranslations("opsHealth")]);
  const tones = view ? healthTileTones(view) : null;
  return (
    <section aria-labelledby="ops-overview-health-title" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="ops-overview-health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-overview-health-title" className="text-base font-semibold text-ink">
          {t("title")}
        </h2>
        <Link href="/ops/health" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("link")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {!view || !tones ? (
        <Unavailable />
      ) : (
        <>
          <Status tone={OVERALL_TONE[view.overall.state]} indicator="both" className="text-base" data-testid="ops-overview-health-overall">
            {tHealth(`overall.${view.overall.state}`)}
          </Status>
          {view.overall.reasons.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
              {view.overall.reasons.map((reason) => (
                <li key={reason}>{tHealth.has(`overall.reasons.${reason}`) ? tHealth(`overall.reasons.${reason}`) : reason}</li>
              ))}
            </ul>
          ) : null}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {TILES.map((key) => (
              <div key={key} className="flex items-center justify-between gap-3 border-b border-line py-1 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                <dt className="text-ink-3">{t(`tiles.${key}`)}</dt>
                <dd>
                  <Status tone={tones[key]} indicator="both">
                    {t(`state.${tones[key]}`)}
                  </Status>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-3 tabular-nums">{t("checkedAt", { at: dateTime(view.generatedAt, locale) })}</p>
        </>
      )}
    </section>
  );
}
