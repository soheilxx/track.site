import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Card, CardContent, EmptyState, Status, TBody, Table, Td, Th, THead, Tr, buttonVariants } from "@track-site/ui";
import type { VersionRowView } from "@/server/releases";
import { formatDateTime, formatRelative } from "./format";

/** Version history of one environment: dense table on desktop, stacked rows on mobile, one link per version. */
export async function VersionsTable({ versions, locale }: { versions: VersionRowView[]; locale: string }) {
  const t = await getTranslations("releases");
  if (versions.length === 0) return <EmptyState title={t("history.empty")} description={t("history.emptyText")} />;
  return (
    <Card variant="flat">
      <CardContent className="px-2 py-2 sm:px-3">
        <Table caption={t("history.caption")}>
          <THead>
            <Tr>
              <Th>{t("history.version")}</Th>
              <Th>{t("history.status")}</Th>
              <Th>{t("history.summary")}</Th>
              <Th>{t("history.author")}</Th>
              <Th>{t("history.published")}</Th>
              <Th className="text-right">{t("history.changes")}</Th>
              <Th>
                <span className="sr-only">{t("history.open")}</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {versions.map((v) => (
              <Tr key={v.id} data-testid="release-version-row">
                <Td label={t("history.version")}>
                  <Link href={`/app/releases/${v.id}`} className="font-semibold tabular-nums text-ink hover:underline">
                    {t("strip.version", { version: v.version })}
                  </Link>
                </Td>
                <Td label={t("history.status")}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Status tone={v.status === "active" ? "ok" : "neutral"} chip indicator="both">
                      {t(`history.statusLabel.${v.status}`)}
                    </Status>
                    {v.rolledBack ? <Badge tone="warn">{t("history.rolledBack")}</Badge> : null}
                    {v.restored ? <Badge tone="info">{t("history.restored")}</Badge> : null}
                    {v.scheduled ? <Badge tone="neutral">{t("history.scheduled")}</Badge> : null}
                    {v.approved ? <Badge tone="ok">{t("history.approved")}</Badge> : null}
                  </span>
                </Td>
                <Td label={t("history.summary")}>
                  <span className="line-clamp-2 max-w-md text-ink-2" title={v.summary ?? undefined}>
                    {v.summary ?? t("history.initial")}
                  </span>
                </Td>
                <Td label={t("history.author")}>{v.createdByName ?? (v.createdBy ? t("unknownUser") : t("system"))}</Td>
                <Td label={t("history.published")}>
                  <time dateTime={v.lastPublishedAt ?? v.createdAt} title={formatDateTime(v.lastPublishedAt ?? v.createdAt, locale, "long")}>
                    {formatRelative(v.lastPublishedAt ?? v.createdAt, locale)}
                  </time>
                </Td>
                <Td label={t("history.changes")} numeric>
                  {v.changes}
                </Td>
                <Td label={t("history.open")}>
                  <Link href={`/app/releases/${v.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    {t("history.open")}
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
