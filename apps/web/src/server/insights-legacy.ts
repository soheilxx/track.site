/**
 * Legacy route mapping for the Insights module. `/app/audiences` moved to `/app/insights/audiences`;
 * the old path is answered by the permanent redirect in `DASHBOARD_LEGACY_PATHS` (next.config.ts, query
 * string preserved). `legacyAudiencesTarget` is the pure mapping the retired page-level shim used and
 * documents which of the old parameters the new page understands.
 */

export const INSIGHTS_AUDIENCES_PATH = "/app/insights/audiences";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Destination of the permanent `/app/audiences` redirect. The old page accepted only `?site=<uuid>`;
 * a well-formed site id is carried over so the intent of an old bookmark survives, everything else
 * (malformed ids, unknown parameters) is dropped rather than forwarded verbatim.
 */
export function legacyAudiencesTarget(searchParams: SearchParams): string {
  const site = first(searchParams.site);
  if (!UUID.test(site)) return INSIGHTS_AUDIENCES_PATH;
  const query = new URLSearchParams({ site: site.toLowerCase() }).toString();
  return `${INSIGHTS_AUDIENCES_PATH}?${query}`;
}
