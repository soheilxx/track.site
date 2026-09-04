"use client";

import { useId } from "react";
import { Button, SearchField } from "@track-site/ui";
import { FACET_KEYS, type FacetKey } from "@/lib/knowledge-search";
import { useHub } from "./provider";
import { fill } from "./text";

const PARAM_NAMES: Record<FacetKey, string> = { topic: "topic", platform: "platform", shopSystem: "shop", contentType: "type", level: "level", recency: "recency" };

/** Result summary for the live region and the directory header. */
export function resultsText(hub: ReturnType<typeof useHub>): string {
  const { copy, response } = hub;
  if (response.query.q) return fill(copy.search.resultsQuery, { n: response.total, total: response.corpus, q: response.query.q });
  if (response.total === response.corpus) return fill(copy.search.resultsAll, { total: response.corpus });
  return fill(copy.search.resultsSome, { n: response.total, total: response.corpus });
}

/**
 * The hero's search: a GET form (works without JavaScript — the server page reads `?q=` and the
 * active filters travel as hidden fields) enhanced into a live search through the hub context.
 * The polite live region inside <SearchField> announces the real hit count.
 */
export function HubSearch({ action }: { action: string }) {
  const hub = useHub();
  const hintId = useId();
  const { copy, query, update, submit } = hub;
  return (
    <form
      role="search"
      method="get"
      action={action}
      className="max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <SearchField className="min-w-0 flex-1" size="lg" name="q" value={query.q} onValueChange={(q) => update({ q })} label={copy.search.label} placeholder={copy.search.placeholder} clearLabel={copy.search.clear} resultsText={resultsText(hub)} autoComplete="off" spellCheck={false} aria-describedby={hintId} />
        <Button type="submit" size="lg" variant="secondary" className="shrink-0">
          {copy.search.submit}
        </Button>
      </div>
      {FACET_KEYS.map((key) => {
        const value = query[key];
        return value ? <input key={key} type="hidden" name={PARAM_NAMES[key]} value={value} /> : null;
      })}
      <p id={hintId} className="mt-2 text-micro text-ink-3">
        {copy.search.hint}
      </p>
    </form>
  );
}
