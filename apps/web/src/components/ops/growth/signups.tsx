import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { DAILY_WINDOW_DAYS, WEEKLY_WINDOW_WEEKS, type SignupsView } from "@/server/ops/growth";
import { SignupsChart, type SignupPoint } from "./charts";
import { count, day, shortDay } from "./format";
import { Figure, Section, TableDisclosure } from "./section";

/**
 * Sign-ups per day (last 30 days) and per week (last 12 ISO weeks): one grouped bar chart each, with the
 * accessible table twin behind a native disclosure. The figures on the right are the 7-, 30- and
 * previous-30-day windows.
 */
export async function SignupsSection({ signups, locale }: { signups: SignupsView; locale: string }) {
  const t = await getTranslations("opsGrowth.signups");
  const series = { organizations: t("series.organizations"), users: t("series.users") };
  const daily: SignupPoint[] = signups.daily.map((d) => ({ label: shortDay(d.day, locale), organizations: d.organizations, users: d.users }));
  const weekly: SignupPoint[] = signups.weekly.map((w) => ({ label: shortDay(w.weekStart, locale), organizations: w.organizations, users: w.users }));
  const figure = (key: "last7" | "last30" | "previous30") => (
    <Figure key={key} label={t(`figures.${key}`)} value={count(signups[key].organizations, locale)} hint={t("figures.accounts", { count: signups[key].users })} />
  );
  return (
    <Section id="ops-growth-signups" title={t("title")} intro={t("intro")} aside={[figure("last7"), figure("last30"), figure("previous30")]}>
      {!signups.any ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <figure className="min-w-0 space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <figcaption className="text-sm font-medium text-ink">{t("daily.title", { days: DAILY_WINDOW_DAYS })}</figcaption>
            <SignupsChart data={daily} labels={series} locale={locale} title={t("daily.title", { days: DAILY_WINDOW_DAYS })} description={t("chart.daily")} />
            <TableDisclosure summary={t("table")}>
              <Table caption={t("daily.title", { days: DAILY_WINDOW_DAYS })} stack={false}>
                <THead>
                  <Tr>
                    <Th>{t("columns.day")}</Th>
                    <Th className="text-right">{t("columns.organizations")}</Th>
                    <Th className="text-right">{t("columns.users")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {signups.daily.map((d) => (
                    <Tr key={d.day}>
                      <Td>{day(d.day, locale)}</Td>
                      <Td numeric className="font-medium text-ink">
                        {count(d.organizations, locale)}
                      </Td>
                      <Td numeric className="text-ink-2">
                        {count(d.users, locale)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableDisclosure>
          </figure>
          <figure className="min-w-0 space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <figcaption className="text-sm font-medium text-ink">{t("weekly.title", { weeks: WEEKLY_WINDOW_WEEKS })}</figcaption>
            <SignupsChart data={weekly} labels={series} locale={locale} title={t("weekly.title", { weeks: WEEKLY_WINDOW_WEEKS })} description={t("chart.weekly")} />
            <TableDisclosure summary={t("table")}>
              <Table caption={t("weekly.title", { weeks: WEEKLY_WINDOW_WEEKS })} stack={false}>
                <THead>
                  <Tr>
                    <Th>{t("columns.week")}</Th>
                    <Th className="text-right">{t("columns.organizations")}</Th>
                    <Th className="text-right">{t("columns.users")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {signups.weekly.map((w) => (
                    <Tr key={w.weekStart}>
                      <Td>
                        {day(w.weekStart, locale)}
                        {w.partial ? <span className="ml-2 text-xs text-ink-3">{t("partial")}</span> : null}
                      </Td>
                      <Td numeric className="font-medium text-ink">
                        {count(w.organizations, locale)}
                      </Td>
                      <Td numeric className="text-ink-2">
                        {count(w.users, locale)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableDisclosure>
          </figure>
        </div>
      )}
    </Section>
  );
}
