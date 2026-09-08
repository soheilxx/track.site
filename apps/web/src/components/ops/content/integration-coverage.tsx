import { getTranslations } from "next-intl/server";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import type { IntegrationCoverage as Coverage } from "@/server/ops/content";
import { formatDay } from "./format";
import { LiveLink } from "./live-link";
import { Panel } from "./section";
import { StatList } from "./stats";

/** Catalogue entries with their published knowledge articles per locale and the vendor documentation on file. */
export async function IntegrationCoverage({ coverage, locale }: { coverage: Coverage; locale: string }) {
  const t = await getTranslations("opsContent");
  const n = (v: number) => formatNumber(v, locale);
  const { totals } = coverage;
  return (
    <div className="space-y-6">
      <StatList
        label={t("integrations.totals.label")}
        items={[
          { key: "integrations", label: t("integrations.totals.integrations"), value: n(totals.integrations) },
          { key: "destinations", label: t("integrations.totals.destinations"), value: n(totals.destinations) },
          { key: "sources", label: t("integrations.totals.sources"), value: n(totals.sources) },
          { key: "withArticles", label: t("integrations.totals.withArticles"), value: n(totals.withArticles) },
          { key: "withoutArticles", label: t("integrations.totals.withoutArticles"), value: n(totals.withoutArticles), tone: totals.withoutArticles > 0 ? "warn" : "ok" },
          { key: "everyLocale", label: t("integrations.totals.everyLocale"), value: n(totals.everyLocale) },
          { key: "vendorDocs", label: t("integrations.totals.vendorDocs"), value: n(totals.withVendorDocs) },
        ]}
      />
      <Panel>
        <Table caption={t("integrations.caption")}>
          <THead>
            <Tr>
              <Th>{t("integrations.columns.integration")}</Th>
              <Th>{t("integrations.columns.kind")}</Th>
              <Th>{t("integrations.columns.articles")}</Th>
              <Th className="text-right">{t("integrations.columns.groups")}</Th>
              <Th>{t("integrations.columns.vendorDocs")}</Th>
              <Th>{t("integrations.columns.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {coverage.rows.map((row) => (
              <Tr key={row.slug} data-testid="content-integration-row">
                <Td label={t("integrations.columns.integration")}>
                  <p className="font-medium text-ink">{row.name}</p>
                  <code className="text-xs break-all text-ink-3">{row.slug}</code>
                </Td>
                <Td label={t("integrations.columns.kind")}>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone="neutral">{t(`integrations.kinds.${row.kind}`)}</Badge>
                    <Badge tone="neutral">{t(`integrations.categories.${row.category}`)}</Badge>
                  </div>
                </Td>
                <Td label={t("integrations.columns.articles")}>
                  {row.groups.length === 0 ? (
                    <Status tone="warn" indicator="icon">
                      {t("integrations.noArticles")}
                    </Status>
                  ) : (
                    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
                      {coverage.locales.map((l) => (
                        <li key={l} className={row.perLocale[l] === 0 ? "text-warn" : undefined}>
                          <span className="font-medium text-ink">{l.toUpperCase()}</span> {n(row.perLocale[l])}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td label={t("integrations.columns.groups")} numeric>
                  {n(row.groups.length)}
                </Td>
                <Td label={t("integrations.columns.vendorDocs")}>
                  {row.vendorDocsUrl ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Status tone="ok">{t("integrations.vendorDocsYes")}</Status>
                      {row.verifiedAt ? <span className="text-xs text-ink-3">{t("integrations.verifiedOn", { date: formatDay(row.verifiedAt, locale) ?? row.verifiedAt })}</span> : null}
                      <LiveLink href={row.vendorDocsUrl} variant="ghost" label={`${t("integrations.openVendorDocs")} ${row.name}`}>
                        {t("integrations.openVendorDocs")}
                      </LiveLink>
                    </div>
                  ) : (
                    <Status tone="neutral">{t("integrations.vendorDocsNo")}</Status>
                  )}
                </Td>
                <Td label={t("integrations.columns.actions")}>
                  <LiveLink href={row.href} label={t("integrations.openIntegrationLabel", { name: row.name })}>
                    {t("integrations.openIntegration")}
                  </LiveLink>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </div>
  );
}
