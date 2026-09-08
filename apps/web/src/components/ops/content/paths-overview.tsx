import { getTranslations } from "next-intl/server";
import { EmptyState, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { LOCALE_NAMES } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import { operatorLocale, type PathsOverview as Overview } from "@/server/ops/content";
import { LiveLink } from "./live-link";
import { Panel } from "./section";
import { StatList } from "./stats";

/** Learning paths per locale: listed vs. resolved article ids, hub visibility and the unresolved ids by name. */
export async function PathsOverview({ overview, locale }: { overview: Overview; locale: string }) {
  const t = await getTranslations("opsContent");
  const n = (v: number) => formatNumber(v, locale);
  if (overview.rows.length === 0) return <EmptyState title={t("paths.empty")} description={t("paths.emptyText")} />;
  const hub = overview.hubHref[operatorLocale(locale)];
  return (
    <div className="space-y-6">
      <StatList
        label={t("paths.totals.label")}
        items={[
          { key: "paths", label: t("paths.totals.paths"), value: n(overview.totals.paths) },
          { key: "attention", label: t("paths.totals.attention"), value: n(overview.totals.attention), tone: overview.totals.attention > 0 ? "warn" : "ok" },
          { key: "missing", label: t("paths.totals.missingLocales"), value: n(overview.totals.missingLocales), tone: overview.totals.missingLocales > 0 ? "bad" : "ok" },
          { key: "unresolved", label: t("paths.totals.unresolved"), value: n(overview.totals.unresolved), tone: overview.totals.unresolved > 0 ? "warn" : "ok" },
        ]}
      />
      <Panel>
        <Table caption={t("paths.caption")}>
          <THead>
            <Tr>
              <Th>{t("paths.columns.path")}</Th>
              <Th>{t("paths.columns.locales")}</Th>
              <Th>{t("paths.columns.flags")}</Th>
              <Th>{t("paths.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {overview.rows.map((row) => (
              <Tr key={row.id} data-testid="content-path-row">
                <Td label={t("paths.columns.path")} className="min-w-[14rem]">
                  <p className="font-medium text-ink">{row.title}</p>
                  <code className="text-xs break-all text-ink-3">{row.id}</code>
                </Td>
                <Td label={t("paths.columns.locales")}>
                  <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {overview.locales.map((l) => {
                      const state = row.locales[l];
                      return (
                        <li key={l} className="min-w-0">
                          <span className="font-medium text-ink">{LOCALE_NAMES[l]}</span>{" "}
                          {state ? (
                            <>
                              <span className={state.unresolved.length ? "text-warn" : "text-ink-2"}>{t("paths.resolvedOf", { resolved: n(state.resolved), listed: n(state.listed) })}</span>
                              {state.visible ? <span className="text-ink-3"> · {t("paths.reading", { count: n(state.readingMinutes) })}</span> : null}
                              {!state.visible ? <p className="text-xs text-bad">{t("paths.hidden")}</p> : null}
                              {state.unresolved.length ? (
                                <p className="text-xs text-ink-3">
                                  {t("paths.unresolvedIds")}:{" "}
                                  {state.unresolved.map((id) => (
                                    <code key={id} className="mr-1 break-all">
                                      {id}
                                    </code>
                                  ))}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-bad">{t("paths.missing")}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Td>
                <Td label={t("paths.columns.flags")}>
                  {row.attention ? (
                    <Status tone="warn" indicator="icon">
                      {t("common.attention")}
                    </Status>
                  ) : (
                    <Status tone="ok" indicator="icon">
                      {t("common.ok")}
                    </Status>
                  )}
                </Td>
                <Td label={t("paths.columns.actions")}>
                  <LiveLink href={hub}>{t("paths.openHub", { locale: operatorLocale(locale).toUpperCase() })}</LiveLink>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
