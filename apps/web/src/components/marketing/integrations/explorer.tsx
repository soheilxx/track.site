"use client";

import { ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Badge, Button, EmptyState, FilterChips, SearchField, Status } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { INTEGRATION_CATEGORIES, INTEGRATION_MODES, type IntegrationAccess, type IntegrationCategory, type IntegrationKind, type IntegrationMode, type IntegrationVerification } from "@/lib/integrations-catalog";
import { countByCategory, countByMode, filterIntegrations, groupByCategory, hasIntegrationQuery, integrationQueryToSearch, parseIntegrationQuery, type IntegrationQuery, type SearchableIntegration } from "./catalog";
import { IntegrationGlyph } from "./glyph";

/**
 * Client-side search + filters of the integrations overview. The server page parses the URL and
 * renders the initial result set; this component keeps the URL in sync with
 * `history.replaceState` (no navigation, no server round trip per keystroke) and reacts to
 * back/forward through `useSearchParams`. Every string comes from the page's copy module.
 */
export interface ExplorerItem extends SearchableIntegration {
  monogram: string;
  kind: IntegrationKind;
  accessNote: string | null;
  access: IntegrationAccess;
  verification: IntegrationVerification;
}

export interface ExplorerCopy {
  heading: string;
  searchLabel: string;
  searchPlaceholder: string;
  clear: string;
  resultsAll: string;
  resultsSome: string;
  categoryFilter: string;
  modeFilter: string;
  allCategories: string;
  allModes: string;
  reset: string;
  emptyTitle: string;
  emptyText: string;
  resultsHeading: string;
  presets: string;
  categories: Record<IntegrationCategory, string>;
  categoryText: Record<IntegrationCategory, string>;
  modes: Record<IntegrationMode, string>;
  access: Record<IntegrationAccess, string>;
  verificationShort: Record<IntegrationVerification, string>;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(vars[key] ?? ""));
}

export function IntegrationsExplorer({ items, copy, initial }: { items: ExplorerItem[]; copy: ExplorerCopy; initial: IntegrationQuery }) {
  const headingId = useId();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState<IntegrationQuery>(initial);
  // Last search string this component wrote to the URL; anything else arriving via `useSearchParams` is an external change.
  const [written, setWritten] = useState(() => integrationQueryToSearch(initial));
  const [seenUrl, setSeenUrl] = useState(() => integrationQueryToSearch(initial));

  // URL → state (back/forward, a navigation to this route with other params): adopted while rendering, so a
  // stale filter set never flashes; our own writes are recognised by `written` and ignored.
  const urlSearch = integrationQueryToSearch(parseIntegrationQuery(searchParams));
  if (urlSearch !== seenUrl) {
    setSeenUrl(urlSearch);
    if (urlSearch !== written) {
      setWritten(urlSearch);
      setQuery(parseIntegrationQuery(searchParams));
    }
  }

  // State → URL, debounced so typing does not spam history; replaceState keeps the router in sync without a navigation.
  useEffect(() => {
    const search = integrationQueryToSearch(query);
    if (search === written) return;
    const timer = window.setTimeout(() => {
      setWritten(search);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, written]);

  const filtered = useMemo(() => filterIntegrations(items, query), [items, query]);
  const categoryCounts = useMemo(() => countByCategory(items, query), [items, query]);
  const modeCounts = useMemo(() => countByMode(items, query), [items, query]);
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const active = hasIntegrationQuery(query);
  const reset = () => setQuery({ q: "", categories: [], modes: [] });
  const resultsText = filtered.length === items.length ? fill(copy.resultsAll, { total: items.length }) : fill(copy.resultsSome, { shown: filtered.length, total: items.length });

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-h2 text-ink">
        {copy.heading}
      </h2>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
        <SearchField className="min-w-0 flex-1" size="lg" value={query.q} onValueChange={(q) => setQuery((c) => ({ ...c, q }))} label={copy.searchLabel} placeholder={copy.searchPlaceholder} clearLabel={copy.clear} resultsText={resultsText} autoComplete="off" spellCheck={false} />
        {active ? (
          <Button type="button" variant="secondary" size="lg" onClick={reset} className="shrink-0">
            {copy.reset}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <FilterChips<IntegrationCategory>
          label={copy.categoryFilter}
          allLabel={copy.allCategories}
          options={INTEGRATION_CATEGORIES.map((c) => ({ value: c, label: copy.categories[c], count: categoryCounts[c] }))}
          value={query.categories}
          onValueChange={(categories) => setQuery((c) => ({ ...c, categories }))}
        />
        <FilterChips<IntegrationMode>
          label={copy.modeFilter}
          allLabel={copy.allModes}
          options={INTEGRATION_MODES.map((m) => ({ value: m, label: copy.modes[m], count: modeCounts[m] }))}
          value={query.modes}
          onValueChange={(modes) => setQuery((c) => ({ ...c, modes }))}
        />
      </div>
      <div className="mt-10">
        {filtered.length === 0 ? (
          <EmptyState
            title={copy.emptyTitle}
            description={copy.emptyText}
            action={
              <Button type="button" variant="secondary" onClick={reset}>
                {copy.reset}
              </Button>
            }
          />
        ) : query.q ? (
          <ResultGroup heading={copy.resultsHeading} items={filtered} copy={copy} />
        ) : (
          groups.map((g) => <ResultGroup key={g.category} heading={copy.categories[g.category]} text={copy.categoryText[g.category]} items={g.items} copy={copy} />)
        )}
      </div>
    </section>
  );
}

function ResultGroup({ heading, text, items, copy }: { heading: string; text?: string; items: ExplorerItem[]; copy: ExplorerCopy }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-line pt-6 not-first:mt-10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h3 id={id} className="font-display text-h3 text-ink">
          {heading} <span className="text-small font-normal text-ink-3 tabular-nums">({items.length})</span>
        </h3>
        {text ? <p className="max-w-xl text-small text-ink-3">{text}</p> : null}
      </div>
      <ul className="mt-2 divide-y divide-line">
        {items.map((item) => (
          <ResultRow key={item.slug} item={item} copy={copy} />
        ))}
      </ul>
    </section>
  );
}

function ResultRow({ item, copy }: { item: ExplorerItem; copy: ExplorerCopy }) {
  return (
    <li className="relative flex gap-4 rounded-[var(--radius-control)] px-2 py-4 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2/60 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-primary sm:px-3">
      <IntegrationGlyph monogram={item.monogram} category={item.category} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <h4 className="text-base font-semibold text-ink">
          <Link href={`/integrations/${item.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {item.name}
          </Link>
        </h4>
        <p className="mt-1 text-small text-ink-2">{item.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex flex-wrap gap-1.5">
            {item.modes.map((m) => (
              <Badge key={m} tone="neutral">
                {copy.modes[m]}
              </Badge>
            ))}
          </span>
          {item.presets ? <span className="text-micro text-ink-3">{fill(copy.presets, { n: item.presets.length })}</span> : null}
          <Status tone="ok" indicator="icon" className="text-micro">
            {copy.verificationShort[item.verification]}
          </Status>
          {item.access !== "open" ? (
            <Status tone="warn" indicator="icon" className="text-micro">
              {copy.access[item.access]}
            </Status>
          ) : null}
        </div>
      </div>
      <span aria-hidden="true" className="hidden self-center text-ink-3 sm:inline-flex">
        <ArrowRight className="size-4" />
      </span>
    </li>
  );
}
