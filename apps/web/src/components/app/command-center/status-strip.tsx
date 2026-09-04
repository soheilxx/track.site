import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge, IconButton, Status, Tooltip, type Tone } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { THRESHOLDS, type CommandCenterFacts, type MeasurementStatus } from "@/server/command-center";
import { formatDateTime, formatDuration, formatPercent, formatRelative } from "./format";

interface StripItem {
  key: string;
  label: string;
  help: string;
  value: string;
  tone: Tone;
  details: string[];
  status: MeasurementStatus;
}

const STATE_TONE: Record<MeasurementStatus, Tone> = { measured: "ok", empty: "neutral", stale: "warn", unavailable: "bad", not_measurable: "neutral" };

/**
 * Compact status strip: ten measurements in one bordered band (not ten equal cards), each with a
 * short explanation of the term, the measured value as dot + icon + text, and its measurement state.
 * Values that were not measured say so; nothing is filled in.
 */
export async function StatusStrip({ facts, locale, timeZone }: { facts: CommandCenterFacts; locale: string; timeZone: string }) {
  const t = await getTranslations("commandCenter");
  const now = new Date(facts.now);
  const rel = (iso: string) => formatRelative(iso, now, locale);
  const n = (value: number) => formatNumber(value, locale);
  const fallback = (key: keyof typeof facts, label: string, help: string, status: MeasurementStatus, value?: string): StripItem => ({ key, label, help, value: value ?? t(`state.${status}`), tone: "neutral", details: [], status });

  const items: StripItem[] = [];

  {
    const m = facts.siteStatus;
    const label = t("strip.siteStatus.label");
    const help = t("strip.siteStatus.help");
    if (m.value) {
      const v = m.value;
      items.push({ key: "siteStatus", label, help, status: m.status, value: v.killSwitch ? t("strip.siteStatus.killSwitch") : t(`strip.siteStatus.${v.status}`), tone: v.killSwitch || v.status !== "active" ? "bad" : "ok", details: v.killSwitch ? [t(`strip.siteStatus.${v.status}`)] : [] });
    } else items.push(fallback("siteStatus", label, help, m.status));
  }

  {
    const m = facts.config;
    const label = t("strip.config.label");
    const help = t("strip.config.help");
    if (m.value) items.push({ key: "config", label, help, status: m.status, value: t("strip.config.version", { version: m.value.version }), tone: "ok", details: [t("strip.config.published", { time: rel(m.value.publishedAt) })] });
    else if (m.status === "empty") items.push({ key: "config", label, help, status: m.status, value: t("strip.config.none"), tone: "warn", details: [] });
    else items.push(fallback("config", label, help, m.status));
  }

  {
    const m = facts.lastEvents;
    const label = t("strip.lastEvents.label");
    const help = t("strip.lastEvents.help");
    if (m.value?.lastAt) {
      const v = m.value;
      const lastAt = m.value.lastAt;
      const hours = (now.getTime() - new Date(lastAt).getTime()) / 3_600_000;
      items.push({
        key: "lastEvents",
        label,
        help,
        status: m.status,
        value: rel(lastAt),
        tone: hours >= THRESHOLDS.silenceHours ? "warn" : "ok",
        details: [t("strip.lastEvents.browser", { time: v.browserAt ? rel(v.browserAt) : t("strip.lastEvents.never") }), t("strip.lastEvents.server", { time: v.serverAt ? rel(v.serverAt) : t("strip.lastEvents.never") })],
      });
    } else if (m.value) items.push({ key: "lastEvents", label, help, status: m.status, value: t("strip.lastEvents.none"), tone: "warn", details: [] });
    else items.push(fallback("lastEvents", label, help, m.status));
  }

  {
    const m = facts.health;
    const label = t("strip.health.label");
    const help = t("strip.health.help");
    if (m.value) items.push({ key: "health", label, help, status: m.status, value: t("strip.health.value", { score: m.value.score }), tone: m.value.score >= 80 ? "ok" : m.value.score >= 50 ? "warn" : "bad", details: [t("strip.health.computed", { time: rel(m.value.computedAt) })] });
    else if (m.status === "empty") items.push({ key: "health", label, help, status: m.status, value: t("strip.health.none"), tone: "neutral", details: [] });
    else items.push(fallback("health", label, help, m.status));
  }

  {
    const m = facts.consent;
    const label = t("strip.consent.label");
    const help = t("strip.consent.help");
    if (m.value) {
      const v = m.value;
      const policy = v.policy ? t("strip.consent.policy", { status: t(`strip.consent.status.${v.policy.status}`) }) : t("strip.consent.noPolicy");
      if (v.events > 0 && v.explicitShare !== null) {
        items.push({
          key: "consent",
          label,
          help,
          status: m.status,
          value: t("strip.consent.value", { pct: formatPercent(v.explicitShare * 100, locale) }),
          tone: v.explicitShare >= THRESHOLDS.consentCoverageMin ? "ok" : "warn",
          details: [t("strip.consent.events", { n: v.events }), ...(v.marketingShare !== null ? [t("strip.consent.marketing", { pct: formatPercent(v.marketingShare * 100, locale) })] : []), policy],
        });
      } else items.push({ key: "consent", label, help, status: m.status, value: t("strip.consent.none"), tone: v.policy?.status === "published" ? "neutral" : "warn", details: [policy] });
    } else items.push(fallback("consent", label, help, m.status));
  }

  {
    const m = facts.destinations;
    const label = t("strip.destinations.label");
    const help = t("strip.destinations.help");
    if (m.value) {
      const v = m.value;
      if (v.total === 0) items.push({ key: "destinations", label, help, status: m.status, value: t("strip.destinations.none"), tone: "neutral", details: [] });
      else
        items.push({
          key: "destinations",
          label,
          help,
          status: m.status,
          value: t("strip.destinations.value", { connected: n(v.connected), total: n(v.total) }),
          tone: v.error > 0 || v.credentialProblems.length > 0 ? "bad" : v.connected > 0 ? "ok" : "warn",
          details: [...(v.error > 0 ? [t("strip.destinations.errors", { n: v.error })] : []), ...(v.credentialProblems.length > 0 ? [t("strip.destinations.credentials", { n: v.credentialProblems.length })] : []), ...(v.lastSuccessAt ? [t("strip.destinations.lastSuccess", { time: rel(v.lastSuccessAt) })] : [])],
        });
    } else items.push(fallback("destinations", label, help, m.status));
  }

  {
    const m = facts.duplicates;
    const label = t("strip.duplicates.label");
    const help = t("strip.duplicates.help");
    if (m.value && m.value.rate !== null) items.push({ key: "duplicates", label, help, status: m.status, value: formatPercent(m.value.rate * 100, locale), tone: m.value.rate >= THRESHOLDS.duplicateRate ? "warn" : "ok", details: [t("strip.duplicates.detail", { deduplicated: n(m.value.deduplicated), received: n(m.value.received) })] });
    else if (m.status === "empty" || m.value) items.push({ key: "duplicates", label, help, status: m.status, value: t("strip.duplicates.none"), tone: "neutral", details: [] });
    else items.push(fallback("duplicates", label, help, m.status));
  }

  {
    const m = facts.delivery;
    const label = t("strip.delivery.label");
    const help = t("strip.delivery.help");
    if (m.value) {
      const v = m.value;
      const failed = v.failed + v.dead;
      const deadLetters = v.deadLetters > 0 ? [t("strip.delivery.deadLetters", { n: v.deadLetters })] : [];
      if (v.attempts > 0 && v.failureRate !== null)
        items.push({
          key: "delivery",
          label,
          help,
          status: m.status,
          value: t("strip.delivery.value", { failed: n(failed), attempts: n(v.attempts) }),
          tone: v.deadLetters > 0 || v.failureRate >= THRESHOLDS.deliveryFailureCritical ? "bad" : v.failureRate >= THRESHOLDS.deliveryFailureRate ? "warn" : "ok",
          details: [t("strip.delivery.rate", { pct: formatPercent(v.failureRate * 100, locale) }), ...deadLetters, ...(v.topErrorClass ? [t("strip.delivery.topError", { errorClass: v.topErrorClass })] : [])],
        });
      else items.push({ key: "delivery", label, help, status: m.status, value: v.deadLetters > 0 ? t("strip.delivery.deadLetters", { n: v.deadLetters }) : t("strip.delivery.none"), tone: v.deadLetters > 0 ? "bad" : "neutral", details: [] });
    } else items.push(fallback("delivery", label, help, m.status));
  }

  {
    const m = facts.queue;
    const label = t("strip.queue.label");
    const help = t("strip.queue.help");
    if (m.value) {
      const v = m.value;
      const details = [t("strip.queue.pending", { n: v.pending }), t("strip.queue.inFlight", { n: v.inFlight })];
      if (v.oldestAgeSeconds === null) items.push({ key: "queue", label, help, status: m.status, value: t("strip.queue.noBacklog"), tone: "ok", details });
      else items.push({ key: "queue", label, help, status: m.status, value: formatDuration(v.oldestAgeSeconds, locale), tone: v.oldestAgeSeconds >= THRESHOLDS.queueLagSeconds ? "warn" : "ok", details });
    } else if (m.status === "not_measurable") items.push({ key: "queue", label, help, status: m.status, value: t("strip.queue.notMeasurable"), tone: "neutral", details: [] });
    else items.push(fallback("queue", label, help, m.status));
  }

  {
    const m = facts.usage;
    const label = t("strip.usage.label");
    const help = t("strip.usage.help");
    if (m.value) {
      const v = m.value;
      const details = [
        ...(v.pct !== null ? [t("strip.usage.pct", { pct: formatPercent(v.pct, locale), plan: v.planId, period: v.periodKey })] : []),
        ...(v.hardLimitHitAt ? [t("strip.usage.hardLimit")] : v.softLimitHitAt ? [t("strip.usage.softLimit")] : []),
        t("strip.usage.policy", { policy: t.has(`strip.usage.policies.${v.policy}`) ? t(`strip.usage.policies.${v.policy}` as "strip.usage.policies.pause") : v.policy }),
      ];
      items.push({
        key: "usage",
        label,
        help,
        status: m.status,
        value: v.limit ? t("strip.usage.value", { used: n(v.billable), limit: n(v.limit) }) : t("strip.usage.noLimit", { used: n(v.billable) }),
        tone: v.hardLimitHitAt ? "bad" : v.pct !== null && v.pct >= THRESHOLDS.usageSoftPct ? "warn" : v.pct !== null && v.pct >= THRESHOLDS.usageWarnPct ? "info" : "ok",
        details,
      });
    } else items.push(fallback("usage", label, help, m.status));
  }

  return (
    <section aria-labelledby="cc-status-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cc-status-heading" className="text-base font-semibold text-ink">
          {t("strip.heading")}
        </h2>
        <p className="text-xs text-ink-3">
          {t("context.measuredAtAbsolute", { time: formatDateTime(facts.now, locale, timeZone) })} · {t("context.timezone", { timezone: timeZone })}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-testid="cc-status-strip">
        {items.map((item) => (
          <div key={item.key} className="min-w-0 bg-surface px-4 py-3" data-testid={`cc-status-${item.key}`} data-state={item.status}>
            <dt className="flex items-center gap-1 text-xs font-medium tracking-wide text-ink-3 uppercase">
              <span>{item.label}</span>
              <Tooltip content={item.help} side="bottom">
                <IconButton label={t("strip.help", { term: item.label })} className="size-6 text-ink-3 pointer-coarse:size-11">
                  <Info className="size-3.5" aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </dt>
            <dd className="mt-1.5">
              <Status tone={item.tone} indicator="both" className="text-sm">
                {item.value}
              </Status>
              {item.details.map((detail) => (
                <p key={detail} className="mt-0.5 text-xs text-ink-3">
                  {detail}
                </p>
              ))}
              {item.status !== "measured" ? (
                <p className="mt-1.5">
                  <Badge tone={STATE_TONE[item.status]}>{t(`state.${item.status}`)}</Badge>
                </p>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
