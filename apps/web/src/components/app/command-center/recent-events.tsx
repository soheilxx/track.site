import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, EmptyState, Status, TBody, Table, Td, Th, THead, Tr, VisuallyHidden, buttonVariants, type Tone } from "@track-site/ui";
import type { CommandCenterFacts } from "@/server/command-center";
import { formatRelative, formatTime } from "./format";

const STATE_TONE: Record<string, Tone> = { delivered: "ok", routed: "ok", stored: "ok", policy_passed: "ok", received: "neutral" };

/**
 * The last accepted events of the active environment straight from the event store: name, source
 * (verified or not), the consent purposes the event carried, its processing state and how many of
 * its destinations reported a delivery. No payloads, no identifiers beyond the event id that links
 * to the lineage view.
 */
export async function RecentEvents({ facts, locale, timeZone }: { facts: CommandCenterFacts; locale: string; timeZone: string }) {
  const t = await getTranslations("commandCenter.recentEvents");
  const tState = await getTranslations("commandCenter.state");
  const now = new Date(facts.now);
  const m = facts.recentEvents;
  const rows = m.value ?? [];
  const headingId = "cc-events-heading";
  return (
    <section aria-labelledby={headingId} className="rounded-[var(--radius-card)] border border-line bg-surface" data-testid="cc-recent-events" data-state={m.status}>
      <div className="border-b border-line px-5 py-4">
        <h2 id={headingId} className="text-base font-semibold text-ink">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
      </div>
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={m.status === "empty" || m.status === "measured" ? t("empty.title") : tState(m.status)}
            description={m.status === "empty" || m.status === "measured" ? t("empty.text") : undefined}
            action={
              <>
                {facts.config.value ? (
                  <Link href={`/app/sites/${facts.site.id}`} className={buttonVariants({ size: "sm" })}>
                    {t("empty.installSnippet")}
                  </Link>
                ) : (
                  <Link href="/app/ai-setup" className={buttonVariants({ size: "sm" })}>
                    {t("empty.publishConfig")}
                  </Link>
                )}
                <Link href={`/app/events?site=${facts.site.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                  {t("empty.openEvents")}
                </Link>
              </>
            }
          />
        </div>
      ) : (
        <Table caption={t("caption")} wrapperClassName="px-2 py-2">
          <THead>
            <tr>
              <Th>{t("columns.time")}</Th>
              <Th>{t("columns.event")}</Th>
              <Th>{t("columns.source")}</Th>
              <Th>{t("columns.consent")}</Th>
              <Th>{t("columns.state")}</Th>
              <Th className="text-right">{t("columns.deliveries")}</Th>
              <Th>
                <VisuallyHidden>{t("columns.lineage")}</VisuallyHidden>
              </Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((e) => {
              const purposes = e.consentGranted.filter((p) => p !== "necessary");
              return (
                <Tr key={e.id}>
                  <Td label={t("columns.time")}>
                    <time dateTime={e.at} className="text-ink">
                      {formatTime(e.at, locale, timeZone)}
                    </time>
                    <span className="block text-xs text-ink-3">{formatRelative(e.at, now, locale)}</span>
                  </Td>
                  <Td label={t("columns.event")}>
                    <span className="font-mono text-xs text-ink">{e.name}</span>
                    {e.test ? (
                      <Badge tone="warn" className="ml-2">
                        {t("test")}
                      </Badge>
                    ) : null}
                  </Td>
                  <Td label={t("columns.source")}>
                    <span className="text-ink">{e.source}</span>
                    <Status tone={e.verified ? "ok" : "neutral"} indicator="icon" className="ml-2 text-xs">
                      {e.verified ? t("verified") : t("unverified")}
                    </Status>
                  </Td>
                  <Td label={t("columns.consent")}>
                    <span className="text-ink">{purposes.length ? purposes.join(", ") : t("necessaryOnly")}</span>
                    <span className="block text-xs text-ink-3">{t("consentSource", { source: e.consentSource })}</span>
                  </Td>
                  <Td label={t("columns.state")}>
                    <Status tone={STATE_TONE[e.state] ?? "neutral"} chip>
                      {t.has(`state.${e.state}`) ? t(`state.${e.state}` as "state.routed") : e.state}
                    </Status>
                  </Td>
                  <Td label={t("columns.deliveries")} numeric>
                    {e.deliveries > 0 ? t("deliveries", { delivered: e.delivered, total: e.deliveries }) : t("noDeliveries")}
                  </Td>
                  <Td label={t("columns.lineage")}>
                    <Link href={`/app/events/explorer?site=${facts.site.id}&event=${encodeURIComponent(e.id)}&window=30d`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      {t("openLineage")}
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </section>
  );
}
