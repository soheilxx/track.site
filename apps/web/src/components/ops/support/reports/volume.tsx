import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { VolumeView, ReportRange } from "@/server/support/reports";
import { VolumeChart, type VolumePoint } from "./charts";
import { REPORT_CHANNELS } from "./constants";
import { count, day, decimal, percent, shortDay } from "./format";
import { Figure, Section, ShareBar, TableDisclosure, TableFrame } from "./section";

/**
 * Tickets created per day or ISO week, stacked by channel, with the tickets resolved in the same bucket as a
 * line; the accessible table twin sits behind a native disclosure and the channel mix of the range next to it.
 */
export async function VolumeSection({
  volume,
  range,
  locale,
}: {
  volume: VolumeView;
  range: ReportRange;
  locale: string;
}) {
  const [t, tv] = await Promise.all([
    getTranslations("supportReports.volume"),
    getTranslations("support"),
  ]);
  const labels = {
    email: tv("channel.email"),
    form: tv("channel.form"),
    dashboard: tv("channel.dashboard"),
    api: tv("channel.api"),
    solved: t("series.solved"),
  };
  const points: VolumePoint[] = volume.buckets.map((b) => ({
    label: shortDay(b.key, locale),
    ...b.byChannel,
    solved: b.solved,
  }));
  const bucketColumn = range.bucket === "week" ? t("columns.week") : t("columns.day");
  const aside = [
    <Figure key="created" label={t("figures.created")} value={count(volume.total, locale)} />,
    <Figure key="solved" label={t("figures.solved")} value={count(volume.solved, locale)} />,
    <Figure key="perDay" label={t("figures.perDay")} value={decimal(volume.perDay, locale)} />,
  ];
  return (
    <Section id="support-reports-volume" title={t("title")} intro={t("intro")} aside={aside}>
      {!volume.any ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <figure className="min-w-0 space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <figcaption className="text-sm font-medium text-ink">{t("caption")}</figcaption>
            <VolumeChart
              data={points}
              labels={labels}
              locale={locale}
              title={t("caption")}
              description={t("chart")}
            />
            <TableDisclosure summary={t("table")}>
              <Table caption={t("caption")} stack={false}>
                <THead>
                  <Tr>
                    <Th>{bucketColumn}</Th>
                    {REPORT_CHANNELS.map((channel) => (
                      <Th key={channel} className="text-right">
                        {labels[channel]}
                      </Th>
                    ))}
                    <Th className="text-right">{t("columns.total")}</Th>
                    <Th className="text-right">{t("columns.solved")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {volume.buckets.map((b) => (
                    <Tr key={b.key}>
                      <Td>
                        {day(b.key, locale)}
                        {b.partial ? (
                          <span className="ml-2 text-xs text-ink-3">{t("partial")}</span>
                        ) : null}
                      </Td>
                      {REPORT_CHANNELS.map((channel) => (
                        <Td key={channel} numeric className="text-ink-2">
                          {count(b.byChannel[channel], locale)}
                        </Td>
                      ))}
                      <Td numeric className="font-medium text-ink">
                        {count(b.total, locale)}
                      </Td>
                      <Td numeric className="text-ink-2">
                        {count(b.solved, locale)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableDisclosure>
          </figure>
          <TableFrame>
            <Table caption={t("mix.caption")} showCaption>
              <THead>
                <Tr>
                  <Th>{t("columns.channel")}</Th>
                  <Th className="text-right">{t("columns.count")}</Th>
                  <Th>{t("columns.share")}</Th>
                </Tr>
              </THead>
              <TBody>
                {volume.byChannel.map((row) => (
                  <Tr key={row.channel}>
                    <Td label={t("columns.channel")} className="font-medium text-ink">
                      {labels[row.channel]}
                    </Td>
                    <Td label={t("columns.count")} numeric>
                      {count(row.count, locale)}
                    </Td>
                    <Td label={t("columns.share")}>
                      <span className="flex items-center gap-2">
                        <ShareBar share={row.share} className="max-w-24" />
                        <span className="tabular-nums text-ink-2">
                          {percent(row.share, locale)}
                        </span>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableFrame>
        </div>
      )}
    </Section>
  );
}
