import { getTranslations } from "next-intl/server";
import { EmptyState, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import type { TopView } from "@/server/support/reports";
import { count, percent } from "./format";
import { Note, Section, ShareBar, TableFrame } from "./section";

/** Top categories or tags of the range's tickets with their share of all tickets (a ticket counts once per tag). */
async function TopList({
  kind,
  view,
  locale,
}: {
  kind: "categories" | "tags";
  view: TopView;
  locale: string;
}) {
  const t = await getTranslations(`supportReports.${kind}`);
  const keyColumn = kind === "categories" ? t("columns.category") : t("columns.tag");
  return (
    <Section id={`support-reports-${kind}`} title={t("title")} intro={t("intro")}>
      {view.rows.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.text")} />
      ) : (
        <div className="space-y-2">
          <TableFrame>
            <Table caption={t("caption")}>
              <THead>
                <Tr>
                  <Th>{keyColumn}</Th>
                  <Th className="text-right">{t("columns.count")}</Th>
                  <Th>{t("columns.share")}</Th>
                </Tr>
              </THead>
              <TBody>
                {view.rows.map((row) => (
                  <Tr key={row.key}>
                    <Td label={keyColumn} className="font-medium break-words text-ink">
                      {row.key}
                    </Td>
                    <Td label={t("columns.count")} numeric>
                      {count(row.count, locale)}
                    </Td>
                    <Td label={t("columns.share")}>
                      <span className="flex items-center gap-2">
                        <ShareBar share={row.share} className="max-w-32" />
                        <span className="tabular-nums text-ink-2">
                          {percent(row.share, locale)}
                        </span>
                      </span>
                    </Td>
                  </Tr>
                ))}
                <Tr>
                  <Td label={keyColumn} className="text-ink-3">
                    {t("none")}
                  </Td>
                  <Td label={t("columns.count")} numeric className="text-ink-2">
                    {count(view.none, locale)}
                  </Td>
                  <Td label={t("columns.share")} className="tabular-nums text-ink-2">
                    {percent(view.total > 0 ? view.none / view.total : null, locale)}
                  </Td>
                </Tr>
              </TBody>
            </Table>
          </TableFrame>
          {view.more > 0 ? <Note>{t("more", { count: view.more })}</Note> : null}
        </div>
      )}
    </Section>
  );
}

export async function CategoriesSection({
  categories,
  locale,
}: {
  categories: TopView;
  locale: string;
}) {
  return <TopList kind="categories" view={categories} locale={locale} />;
}

export async function TagsSection({ tags, locale }: { tags: TopView; locale: string }) {
  return <TopList kind="tags" view={tags} locale={locale} />;
}
