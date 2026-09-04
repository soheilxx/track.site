import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, StatCard, Status, buttonVariants } from "@track-site/ui";
import type { AttributionHealth } from "@/server/insights-attribution";
import { EvidenceBadge, InsightsSection } from "./evidence";
import { count, formatDateTime, percent } from "./format";

const STALE_AFTER_MS = 24 * 3_600_000;

/**
 * Observed facts of the window: consent coverage, click-id capture, the consent-compliant capture
 * rate and the policy check (click ids stored without marketing consent must be zero). A value that
 * cannot be measured is shown as a dash with the reason — never as zero.
 */
export async function AttributionFacts({
  health,
  now = new Date(),
}: {
  health: AttributionHealth;
  now?: Date;
}) {
  const t = await getTranslations("insights.attribution.facts");
  const locale = await getLocale();
  const o = health.observed;
  const coverage = o.total > 0 ? o.marketing / o.total : null;
  const stale = o.lastEventAt ? now.getTime() - o.lastEventAt.getTime() > STALE_AFTER_MS : false;
  return (
    <InsightsSection id="facts" title={t("title")} kind="observed">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("consent.label")}
          value={coverage === null ? "–" : percent(coverage, locale)}
          hint={
            o.total > 0
              ? t("consent.hint", {
                  marketing: count(o.marketing, locale),
                  total: count(o.total, locale),
                })
              : t("consent.unknown")
          }
        />
        <StatCard
          label={t("withClickIds.label")}
          value={count(o.withClickIds, locale)}
          hint={
            o.marketing > 0
              ? t("withClickIds.hint", { marketing: count(o.marketing, locale) })
              : t("withClickIds.hintNoConsent")
          }
        />
        <StatCard
          label={t("captureRate.label")}
          value={o.captureRate === null ? "–" : percent(o.captureRate, locale)}
          hint={o.captureRate === null ? t("captureRate.unknown") : t("captureRate.hint")}
        />
        <StatCard
          label={t("violations.label")}
          value={count(o.clickIdsWithoutConsent, locale)}
          tone={o.clickIdsWithoutConsent > 0 ? "bad" : o.total > 0 ? "ok" : "neutral"}
          hint={
            o.total === 0
              ? t("violations.unknown")
              : o.clickIdsWithoutConsent > 0
                ? t("violations.bad")
                : t("violations.ok")
          }
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
        <span>
          {o.lastEventAt
            ? t("lastEvent", { at: formatDateTime(o.lastEventAt, locale) })
            : t("noEvents")}
        </span>
        {stale ? (
          <Status tone="warn" indicator="icon">
            {t("stale")}
          </Status>
        ) : null}
      </p>
    </InsightsSection>
  );
}

/** Capture settings that were really in force for the environment (published bundle) or the platform defaults. */
export async function CaptureConfig({ config }: { config: AttributionHealth["config"] }) {
  const t = await getTranslations("insights.attribution.config");
  return (
    <InsightsSection id="config" title={t("title")} kind="observed" lead={t("lead")}>
      <Card variant="flat" className="px-5 py-4">
        {config === null ? (
          <p className="text-sm text-ink-2">{t("unknownEnv")}</p>
        ) : (
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-3">{t("source")}</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {config.source === "published" && config.version !== null
                  ? t("published", { version: config.version })
                  : t("default")}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{t("capture")}</dt>
              <dd className="mt-0.5">
                <Status tone={config.capture ? "ok" : "warn"} indicator="icon">
                  {config.capture ? t("captureOn") : t("captureOff")}
                </Status>
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">{t("ttl")}</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-ink">
                {t("ttlDays", { days: config.ttlDays })}
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-3 text-xs text-ink-3">{t("note")}</p>
      </Card>
    </InsightsSection>
  );
}

/** Modelled hints: each carries its assumption and stays "not measurable" without evidence. */
export async function ModelledHints({ health }: { health: AttributionHealth }) {
  const t = await getTranslations("insights.attribution.hints");
  const locale = await getLocale();
  const m = health.modelled;
  const items = [
    { key: "paid", value: m.paidWithoutClickId },
    { key: "gap", value: m.consentGapEstimate },
  ] as const;
  return (
    <InsightsSection id="hints" title={t("title")} kind="modelled" lead={t("lead")}>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <Card variant="flat" className="h-full px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{t(`${item.key}.title`)}</h3>
                <EvidenceBadge kind="modelled" />
              </div>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                {item.value === null ? "–" : count(item.value, locale)}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                {item.value === null ? t(`${item.key}.unknown`) : t(`${item.key}.text`)}
              </p>
              <p className="mt-2 text-xs text-ink-3">{t(`${item.key}.assumption`)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </InsightsSection>
  );
}

/** What Track cannot know — stated instead of filled in. */
export async function UnknownList({ health }: { health: AttributionHealth }) {
  const t = await getTranslations("insights.attribution.unknown");
  const locale = await getLocale();
  const u = health.unknown;
  return (
    <InsightsSection id="unknown" title={t("title")} kind="unknown" lead={t("lead")}>
      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface text-sm">
        <li className="px-5 py-3">
          <p className="font-medium text-ink">
            {t("noConsent.title", { n: count(u.eventsWithoutMarketingConsent, locale) })}
          </p>
          <p className="mt-0.5 text-ink-3">{t("noConsent.text")}</p>
        </li>
        <li className="px-5 py-3">
          <p className="font-medium text-ink">{t("vendor.title")}</p>
          <p className="mt-0.5 text-ink-3">{t("vendor.text")}</p>
        </li>
        <li className="px-5 py-3">
          <p className="font-medium text-ink">
            {t("destinations.title", { n: count(u.destinationsWithoutObservation, locale) })}
          </p>
          <p className="mt-0.5 text-ink-3">{t("destinations.text")}</p>
        </li>
      </ul>
    </InsightsSection>
  );
}

/** How the figures are defined; the same words the tables use. */
export async function Definitions() {
  const t = await getTranslations("insights.attribution.definitions");
  const keys = ["capture", "origin", "lifetime", "forwarding"] as const;
  return (
    <section aria-labelledby="definitions-title" className="space-y-3">
      <h2 id="definitions-title" className="text-base font-semibold text-ink">
        {t("title")}
      </h2>
      <dl className="grid gap-4 text-sm md:grid-cols-2">
        {keys.map((key) => (
          <div
            key={key}
            className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3"
          >
            <dt className="font-medium text-ink">{t(`${key}.term`)}</dt>
            <dd className="mt-1 text-ink-2">{t(`${key}.text`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Empty state of the window with the two useful next steps. */
export async function NoEventsState({ siteId }: { siteId: string }) {
  const t = await getTranslations("insights.attribution.empty");
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-2 px-6 py-12 text-center">
      <h2 className="text-base font-semibold text-ink">{t("title")}</h2>
      <p className="mt-1 max-w-md text-sm text-ink-3">{t("text")}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href="/app/events" className={buttonVariants()}>
          {t("events")}
        </Link>
        <Link href={`/app/sites/${siteId}`} className={buttonVariants({ variant: "secondary" })}>
          {t("setup")}
        </Link>
      </div>
    </div>
  );
}
