"use client";

import { Check } from "lucide-react";
import { useId, type MouseEvent } from "react";
import { Badge, EmptyState, buttonVariants, cn } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import { FACET_KEYS, hubQueryToSearch, withoutFacet, type FacetKey, type HubQuery } from "@/lib/knowledge-search";
import { KNOWLEDGE_PATH } from "@/lib/routes";
import { Cover } from "../cover";
import { useHub } from "./provider";
import { resultsText } from "./search-box";
import { fill } from "./text";
import type { DirectoryItem, FacetOption } from "./types";

/**
 * Complete, filterable directory (supplement §6 no. 6): six single-valued facets with real hit
 * counts, the ranked result list and an accessible empty state. Filter chips are links to the
 * filtered URL (crawlable, work without JavaScript); with the island hydrated a click updates the
 * state instead and the URL follows through `history.replaceState`.
 */
const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-chip)] border px-3 text-sm font-medium no-underline transition-[background-color,color,border-color] duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11",
    active ? "border-primary bg-primary-soft text-primary" : "border-line-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
  );

function hrefFor(query: HubQuery): string {
  return `${KNOWLEDGE_PATH}${hubQueryToSearch(query)}`;
}

/** `{ [facet]: value }` as a typed patch (computed keys of a union type widen to an index signature). */
function facetPatch(facet: FacetKey, value: string | undefined): Partial<HubQuery> {
  const patch: Partial<HubQuery> = {};
  (patch as Record<string, string | undefined>)[facet] = value;
  return patch;
}

function withFacet(query: HubQuery, facet: FacetKey, value: string): HubQuery {
  return { ...query, ...facetPatch(facet, value) };
}

function FacetChip({ query, active, label, count, onSelect }: { query: HubQuery; active: boolean; label: string; count?: number; onSelect: () => void }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onSelect();
  };
  return (
    <Link href={hrefFor(query)} aria-current={active ? "true" : undefined} className={chipClass(active)} onClick={handle}>
      {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
      <span>{label}</span>
      {count !== undefined ? <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-ink-3")}>{count}</span> : null}
    </Link>
  );
}

function FacetGroup({ facet, options }: { facet: FacetKey; options: FacetOption[] }) {
  const { copy, query, update } = useHub();
  const id = useId();
  const current = query[facet];
  const base = withoutFacet(query, facet);
  return (
    <div role="group" aria-labelledby={id}>
      <h4 id={id} className="text-micro font-semibold tracking-wide text-ink-3 uppercase">
        {copy.directory.facets[facet]}
      </h4>
      <div className="mt-2 flex flex-wrap gap-2">
        <FacetChip query={base} active={current === undefined} label={copy.directory.all} onSelect={() => update(facetPatch(facet, undefined))} />
        {options.map((option) => {
          const active = current === option.value;
          if (!active && option.count === 0) {
            return (
              <span key={option.value} aria-disabled="true" className={cn(chipClass(false), "cursor-default opacity-50 hover:border-line-2 hover:text-ink-2")}>
                <span>{option.label}</span>
                <span className="text-xs text-ink-3 tabular-nums">0</span>
              </span>
            );
          }
          return <FacetChip key={option.value} query={withFacet(base, facet, option.value)} active={active} label={option.label} count={option.count} onSelect={() => update(facetPatch(facet, active ? undefined : option.value))} />;
        })}
      </div>
    </div>
  );
}

function ResultRow({ item }: { item: DirectoryItem }) {
  const { copy } = useHub();
  return (
    <li className="relative grid grid-cols-[88px_1fr] gap-4 py-5 transition-colors duration-[var(--motion-fast)] ease-out has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-primary sm:grid-cols-[160px_1fr] sm:gap-6">
      <Cover topic={item.topic} groupId={item.groupId} size="card" className="self-start overflow-hidden rounded-[var(--radius-control)] border border-line" />
      <article className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-ink-3">
          <Badge tone="primary">{copy.labels.topics[item.topic]}</Badge>
          <span>{copy.labels.types[item.contentType]}</span>
          <span aria-hidden="true">·</span>
          <span>{copy.labels.levels[item.level]}</span>
        </div>
        <h4 className="mt-2 text-base font-semibold text-ink sm:text-lg">
          <Link href={`${KNOWLEDGE_PATH}/${item.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {item.title}
          </Link>
        </h4>
        <p className="mt-1.5 hidden text-small text-ink-2 sm:block">{item.excerpt}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-micro text-ink-3">
          <span>{fill(copy.card.minutes, { n: item.readingMinutes })}</span>
          <span aria-hidden="true">·</span>
          <span>
            {item.date.updated ? copy.card.updated : copy.card.published} <time dateTime={item.date.iso}>{item.date.label}</time>
          </span>
        </p>
      </article>
    </li>
  );
}

export function HubDirectory() {
  const hub = useHub();
  const { copy, query, response, pending, active, reset } = hub;
  const filtersId = useId();
  const resultsId = useId();
  const resetChip = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    reset();
  };
  return (
    <div className="grid gap-10 lg:grid-cols-[280px_1fr] lg:gap-14">
      <div aria-labelledby={filtersId} role="region" className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id={filtersId} className="text-base font-semibold text-ink">
            {copy.directory.filtersTitle}
          </h3>
          {active ? (
            <Link href={KNOWLEDGE_PATH} onClick={resetChip} className="inline-flex min-h-9 items-center text-small font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
              {copy.directory.reset}
            </Link>
          ) : null}
        </div>
        <div className="mt-4 flex flex-col gap-5">
          {FACET_KEYS.map((facet) => {
            const options = response.facets[facet];
            if (options.length === 0 && query[facet] === undefined) return null;
            return <FacetGroup key={facet} facet={facet} options={options} />;
          })}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
          <h3 id={resultsId} className="min-w-0 text-base font-semibold break-words text-ink tabular-nums">
            {resultsText(hub)}
          </h3>
          {pending ? <span className="text-micro text-ink-3">{copy.directory.searching}</span> : null}
        </div>
        {response.items.length === 0 ? (
          <EmptyState
            className="mt-6"
            title={copy.directory.emptyTitle}
            description={copy.directory.emptyText}
            action={
              <Link href={KNOWLEDGE_PATH} onClick={resetChip} className={buttonVariants({ variant: "secondary" })}>
                {copy.directory.emptyAction}
              </Link>
            }
          />
        ) : (
          <ol aria-labelledby={resultsId} aria-busy={pending || undefined} className={cn("divide-y divide-line transition-opacity duration-[var(--motion-base)] ease-in-out", pending && "opacity-70")}>
            {response.items.map((item) => (
              <ResultRow key={item.groupId} item={item} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
