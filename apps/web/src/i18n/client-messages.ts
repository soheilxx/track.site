/**
 * Subset of the message catalog for a client-side `NextIntlClientProvider`.
 *
 * Whatever is passed as `messages` to the client provider is serialised into every page's RSC
 * payload. The public `[locale]` tree renders its copy on the server (typed copy modules,
 * `getTranslations`); its few client islands read at most one namespace (the auth forms read `auth`),
 * so the provider gets exactly those namespaces instead of the whole catalog (200 KB of JSON per
 * page before 2026-09-05, see docs/qa/2026-09-05/followup/perf/summary.md). The dashboard root layout
 * keeps the full catalog: its modules translate on the client.
 */
export function pickMessages(messages: Record<string, unknown>, namespaces: readonly string[]): Record<string, unknown> {
  const subset: Record<string, unknown> = {};
  for (const ns of namespaces) if (ns in messages) subset[ns] = messages[ns];
  return subset;
}
