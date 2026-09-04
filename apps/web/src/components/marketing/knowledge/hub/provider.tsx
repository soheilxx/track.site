"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { hasHubQuery, hubQueryToSearch, parseHubQuery, type HubQuery, type HubTaxonomy } from "@/lib/knowledge-search";
import { searchKnowledgeAction } from "./actions";
import type { HubIslandCopy, HubSearchResponse } from "./types";

/**
 * State of the hub's search + directory island. The server page renders the initial result set from
 * the URL; this provider keeps the query, the results and the URL in sync:
 *
 *   typing / a filter chip → state → (debounced) `history.replaceState` + server action → results
 *   back/forward or a navigation with other params → `useSearchParams` → state → server action
 *
 * The editorial sections and the directory are separate children of the provider (server
 * components stay server components), so the search field in the hero and the results further down
 * share one state through context.
 */
interface HubContextValue {
  locale: string;
  copy: HubIslandCopy;
  query: HubQuery;
  response: HubSearchResponse;
  /** A search is in flight; the previous results stay visible (aria-busy on the list). */
  pending: boolean;
  /** Text or any filter set. */
  active: boolean;
  setQuery: (next: HubQuery) => void;
  update: (patch: Partial<HubQuery>) => void;
  reset: () => void;
  /** Run the pending query immediately (form submit). */
  submit: () => void;
}

const HubContext = createContext<HubContextValue | null>(null);

export function useHub(): HubContextValue {
  const value = useContext(HubContext);
  if (!value) throw new Error("useHub must be used inside <HubProvider>");
  return value;
}

const DEBOUNCE_MS = 180;

export function HubProvider({ locale, copy, taxonomy, initial, children }: { locale: string; copy: HubIslandCopy; taxonomy: HubTaxonomy; initial: HubSearchResponse; children: ReactNode }) {
  const searchParams = useSearchParams();
  const [query, setQueryState] = useState<HubQuery>(initial.query);
  const [response, setResponse] = useState<HubSearchResponse>(initial);
  const [pending, startTransition] = useTransition();
  // Last search string this island wrote to the URL; anything else arriving via `useSearchParams` is an external change.
  const [written, setWritten] = useState(initial.search);
  const [seenUrl, setSeenUrl] = useState(initial.search);
  const sequence = useRef(0);
  /** Search string of the last request sent (or the initial render) — a query that is already requested is not sent twice; `null` after a failure so a retry can run. */
  const requested = useRef<string | null>(initial.search);
  const timer = useRef<number | null>(null);

  const urlQuery = parseHubQuery(searchParams, taxonomy);
  const urlSearch = hubQueryToSearch(urlQuery);

  // Server → state: a navigation to this route with other params (topic world, guide link, back/forward)
  // re-renders the page with a new initial result set, adopted as is when it belongs to the current URL
  // (no second request); a cached payload for another URL is ignored and the URL branch below takes over.
  const [seenInitial, setSeenInitial] = useState(initial.search);
  if (initial.search !== seenInitial) {
    setSeenInitial(initial.search);
    if (initial.search === urlSearch) {
      setResponse(initial);
      setQueryState(initial.query);
      setWritten(initial.search);
      setSeenUrl(initial.search);
    }
  }
  useEffect(() => {
    // a fresh server result set supersedes any request still in flight
    sequence.current += 1;
    requested.current = initial.search;
  }, [initial]);

  // URL → state (back/forward through our own replaceState entries): adopted while rendering so a stale
  // filter set never flashes; our own writes are recognised by `written` and ignored.
  if (urlSearch !== seenUrl) {
    setSeenUrl(urlSearch);
    if (urlSearch !== written) {
      setWritten(urlSearch);
      setQueryState(urlQuery);
    }
  }

  const run = useCallback(
    (next: HubQuery) => {
      const search = hubQueryToSearch(next);
      if (search !== written) {
        setWritten(search);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
      }
      if (search === requested.current) return;
      requested.current = search;
      sequence.current += 1;
      const mine = sequence.current;
      startTransition(async () => {
        try {
          const result = await searchKnowledgeAction(locale, next);
          if (mine !== sequence.current) return;
          setResponse(result);
        } catch (error) {
          if (mine === sequence.current) requested.current = null;
          console.warn("Tracking Knowledge search failed; keeping the previous results.", error);
        }
      });
    },
    [locale, written],
  );

  // State → URL + results, debounced so typing neither spams history nor the server.
  useEffect(() => {
    const search = hubQueryToSearch(query);
    if (search === written && search === requested.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      run(query);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [query, written, run]);

  const submit = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    run(query);
  }, [query, run]);

  const value = useMemo<HubContextValue>(
    () => ({
      locale,
      copy,
      query,
      response,
      pending,
      active: hasHubQuery(query),
      setQuery: setQueryState,
      update: (patch) => setQueryState((current) => cleanQuery({ ...current, ...patch })),
      reset: () => setQueryState({ q: "" }),
      submit,
    }),
    [locale, copy, query, response, pending, submit],
  );

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

/** Drops `undefined` facet values so serialisation and equality stay canonical. */
function cleanQuery(query: HubQuery): HubQuery {
  const next: HubQuery = { q: query.q };
  for (const [key, value] of Object.entries(query)) if (key !== "q" && value !== undefined) Object.assign(next, { [key]: value });
  return next;
}
