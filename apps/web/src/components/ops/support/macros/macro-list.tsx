"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { Badge, Card, CardContent, EmptyState, FilterChips, Kbd, SearchField, TBody, THead, Table, Td, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/controls/format";
import { formatNumber } from "@/lib/format";
import type { MacroView } from "@/server/support/macros";
import { ActionSummary } from "./action-summary";

type ScopeFilter = "global" | "personal";
const UNCATEGORISED = "__none__";

const editable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

/** First line of a body for the list; the editor shows the whole text. */
function firstLine(body: string, max = 100): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * Macro list with a keyboard-reachable search (`/` focuses it, Escape clears it), scope and category chips
 * and a dense table (stacked below 48 rem). Filtering is client-side over the macros the operator may see;
 * the result count is announced politely.
 */
export function MacroList({ macros, categories, locale }: { macros: MacroView[]; categories: string[]; locale: string }) {
  const t = useTranslations("supportMacros");
  const ts = useTranslations("support");
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const deferred = useDeferredValue(query);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || editable(event.target)) return;
      const input = document.getElementById(searchId);
      if (!(input instanceof HTMLInputElement)) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchId]);

  const hasUncategorised = useMemo(() => macros.some((m) => !m.category), [macros]);
  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    return macros.filter((m) => {
      if (scope.length && !scope.includes(m.scope)) return false;
      if (category.length && !category.includes(m.category ?? UNCATEGORISED)) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.category ?? "").toLowerCase().includes(q) || m.bodyText.toLowerCase().includes(q);
    });
  }, [macros, deferred, scope, category]);

  const active = query.trim().length > 0 || scope.length > 0 || category.length > 0;
  const resultsText = active ? t("list.resultsFiltered", { count: filtered.length, total: macros.length }) : t("list.results", { count: macros.length });

  if (macros.length === 0) {
    return (
      <EmptyState
        title={t("list.empty")}
        description={t("list.emptyText")}
        action={
          <Link href="/ops/support/macros/new" className={buttonVariants()}>
            {t("list.new")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <SearchField
            id={searchId}
            value={query}
            onValueChange={setQuery}
            label={t("list.search")}
            showLabel
            placeholder={t("list.searchPlaceholder")}
            clearLabel={t("list.clear")}
            resultsText={resultsText}
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            data-testid="support-macros-search"
          />
          <p className="mt-1 text-xs text-ink-3">
            {t.rich("list.searchHint", { kbd: (chunks) => <Kbd>{chunks}</Kbd> })}
          </p>
        </div>
        <div className="space-y-3">
          <FilterChips<ScopeFilter>
            label={t("list.scopeFilter")}
            multiple={false}
            allLabel={t("list.scopeAll")}
            value={scope}
            onValueChange={setScope}
            options={[
              { value: "global", label: ts("macroScope.global"), count: macros.filter((m) => m.scope === "global").length },
              { value: "personal", label: ts("macroScope.personal"), count: macros.filter((m) => m.scope === "personal").length },
            ]}
          />
          {categories.length || hasUncategorised ? (
            <FilterChips
              label={t("list.categoryFilter")}
              allLabel={t("list.categoryAll")}
              value={category}
              onValueChange={setCategory}
              options={[
                ...categories.map((c) => ({ value: c, label: c, count: macros.filter((m) => m.category === c).length })),
                ...(hasUncategorised ? [{ value: UNCATEGORISED, label: t("list.uncategorised"), count: macros.filter((m) => !m.category).length }] : []),
              ]}
            />
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("list.emptyFiltered")} description={t("list.emptyFilteredText")} />
      ) : (
        <Card variant="flat">
          <CardContent className="px-2 py-2 sm:px-3">
            <Table caption={t("list.caption")}>
              <THead>
                <Tr>
                  <Th>{t("list.columns.name")}</Th>
                  <Th>{t("list.columns.category")}</Th>
                  <Th>{t("list.columns.scope")}</Th>
                  <Th>{t("list.columns.actions")}</Th>
                  <Th className="text-right">{t("list.columns.usage")}</Th>
                  <Th>{t("list.columns.updated")}</Th>
                  <Th>{t("list.columns.open")}</Th>
                </Tr>
              </THead>
              <TBody>
                {filtered.map((macro) => (
                  <Tr key={macro.id} data-testid="support-macro-row">
                    <Td label={t("list.columns.name")}>
                      <p className="font-medium text-ink">{macro.name}</p>
                      <p className="mt-0.5 max-w-md text-xs break-words text-ink-3">{firstLine(macro.bodyText)}</p>
                    </Td>
                    <Td label={t("list.columns.category")}>{macro.category ? <Badge tone="neutral">{macro.category}</Badge> : <span className="text-ink-3">{t("common.none")}</span>}</Td>
                    <Td label={t("list.columns.scope")}>
                      <Badge tone={macro.scope === "global" ? "info" : "neutral"}>{ts(`macroScope.${macro.scope}`)}</Badge>
                    </Td>
                    <Td label={t("list.columns.actions")}>
                      <ActionSummary actions={macro.actions} compact />
                    </Td>
                    <Td label={t("list.columns.usage")} numeric>
                      {formatNumber(macro.usageCount, locale)}
                    </Td>
                    <Td label={t("list.columns.updated")}>{formatDateTime(macro.updatedAt, locale) ?? t("common.none")}</Td>
                    <Td label={t("list.columns.open")}>
                      <Link
                        href={`/ops/support/macros/${macro.id}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                        aria-label={macro.editable ? t("list.editLabel", { name: macro.name }) : t("list.viewLabel", { name: macro.name })}
                      >
                        {macro.editable ? t("common.edit") : t("common.view")}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
