import { and, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PgEventStore } from "@track-site/analytics";
import { defaultEnvironment, deliveryAttempts, integrations, listSites } from "@track-site/db";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label, Select } from "@track-site/ui";
import { pool } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";

const STATES = ["", "routed", "stored", "dropped", "delivered", "failed", "received"];
const stateTone = (s: string) => (s === "routed" || s === "delivered" || s === "stored" ? "ok" : s === "dropped" || s === "failed" ? "bad" : "neutral");

/**
 * Event debugger: every event with its lineage — source, consent snapshot, processing state and drop reason,
 * captured click ids, config version, and the delivery attempt per destination with the redacted vendor payload.
 */
export default async function DebuggerPage({ searchParams }: { searchParams: Promise<{ site?: string; event?: string; name?: string; state?: string; source?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("app.debugger");
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  const site = sites.find((s) => s.id === q.site) ?? sites[0] ?? null;
  if (!site) return <EmptyState title={t("noSites")} />;
  const envRow = await withOrg(ctx, (tx) => defaultEnvironment(tx, site.id));
  const store = new PgEventStore(pool());
  const events = await store.query({ siteId: site.id, environmentId: envRow?.id, name: q.name || undefined, processingState: q.state || undefined, source: q.source || undefined, limit: 50 });
  const selected = q.event ? await store.getById(site.id, q.event) : null;
  const detail = selected
    ? await withOrg(ctx, async (tx) => {
        const attempts = await tx
          .select({ id: deliveryAttempts.id, integrationId: deliveryAttempts.integrationId, connector: deliveryAttempts.connectorType, attempt: deliveryAttempts.attempt, status: deliveryAttempts.status, errorClass: deliveryAttempts.errorClass, code: deliveryAttempts.errorCode, message: deliveryAttempts.errorMessage, http: deliveryAttempts.httpStatus, preview: deliveryAttempts.payloadPreview, response: deliveryAttempts.responseExcerpt, at: deliveryAttempts.startedAt, durationMs: deliveryAttempts.durationMs })
          .from(deliveryAttempts)
          .where(and(eq(deliveryAttempts.siteId, site.id), eq(deliveryAttempts.eventId, selected.event_id)))
          .orderBy(desc(deliveryAttempts.startedAt));
        const names = await tx.select({ id: integrations.id, name: integrations.name }).from(integrations).where(eq(integrations.siteId, site.id));
        return { attempts, names: new Map(names.map((n) => [n.id, n.name])) };
      })
    : null;
  const base = `/app/debugger?site=${site.id}${q.name ? `&name=${encodeURIComponent(q.name)}` : ""}${q.state ? `&state=${q.state}` : ""}${q.source ? `&source=${q.source}` : ""}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-ink-3">{t("intro")}</p>
        </div>
        <form method="get" className="grid gap-2 sm:grid-cols-[160px_160px_140px_140px_auto] sm:items-end">
          <div>
            <Label htmlFor="dbg-site">{t("site")}</Label>
            <Select id="dbg-site" name="site" defaultValue={site.id} className="mt-1">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dbg-name">{t("event")}</Label>
            <Input id="dbg-name" name="name" defaultValue={q.name ?? ""} placeholder="purchase" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="dbg-state">{t("state")}</Label>
            <Select id="dbg-state" name="state" defaultValue={q.state ?? ""} className="mt-1">
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s || t("any")}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dbg-source">{t("source")}</Label>
            <Select id="dbg-source" name="source" defaultValue={q.source ?? ""} className="mt-1">
              {["", "browser", "server", "webhook", "shopify", "woocommerce", "shopware"].map((s) => (
                <option key={s} value={s}>
                  {s || t("any")}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm">
            {t("filter")}
          </Button>
        </form>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("recent", { n: events.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-ink-3">{t("empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-3">
                    <tr>
                      <th className="py-1 pr-3">{t("time")}</th>
                      <th className="py-1 pr-3">{t("event")}</th>
                      <th className="py-1 pr-3">{t("source")}</th>
                      <th className="py-1 pr-3">{t("state")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      return (
                        <tr key={e.event_id} className={`border-t border-line ${selected?.event_id === e.event_id ? "bg-primary-soft/40" : ""}`}>
                          <td className="py-1.5 pr-3 text-xs text-ink-3">{new Date(e.server_ts).toLocaleTimeString()}</td>
                          <td className="py-1.5 pr-3">
                            <Link href={`${base}&event=${e.event_id}`} className="font-mono text-xs text-primary hover:underline">
                              {e.name}
                            </Link>
                            {e.props && (e.props as Record<string, unknown>).test ? <Badge tone="warn" className="ml-2">test</Badge> : null}
                          </td>
                          <td className="py-1.5 pr-3 text-xs">{e.source}</td>
                          <td className="py-1.5 pr-3">
                            <Badge tone={stateTone(e.processing_state)}>{e.processing_state}</Badge>
                            {e.drop_reason ? <span className="ml-1 text-xs text-ink-3">{e.drop_reason}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("lineage")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selected ? (
              <p className="text-ink-3">{t("selectEvent")}</p>
            ) : (
              <>
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-3">event_id</dt>
                  <dd className="font-mono break-all">{selected.event_id}</dd>
                  <dt className="text-ink-3">source</dt>
                  <dd>
                    {selected.source} {selected.source_verified ? <Badge tone="ok">verified</Badge> : null} · sdk {selected.sdk_version} · config v{selected.config_version ?? "—"}
                  </dd>
                  <dt className="text-ink-3">state</dt>
                  <dd>
                    <Badge tone={stateTone(selected.processing_state)}>{selected.processing_state}</Badge> {selected.drop_reason ?? ""}
                  </dd>
                  <dt className="text-ink-3">consent</dt>
                  <dd>
                    {selected.consent.granted.join(", ") || "none"} · {selected.consent.source} · {selected.consent.region ?? "—"} {selected.consent.gpc ? "· GPC" : ""}
                  </dd>
                  <dt className="text-ink-3">click ids</dt>
                  <dd className="font-mono break-all">{Object.keys(selected.click_ids ?? {}).join(", ") || "—"}</dd>
                  <dt className="text-ink-3">page</dt>
                  <dd className="break-all">{selected.url ?? "—"}</dd>
                  <dt className="text-ink-3">commerce</dt>
                  <dd className="font-mono break-all">{selected.commerce ? `${selected.commerce.order_id ?? ""} ${selected.commerce.value ?? ""} ${selected.commerce.currency ?? ""}` : "—"}</dd>
                  <dt className="text-ink-3">user data</dt>
                  <dd>{selected.user_data ? Object.entries(selected.user_data).filter(([, v]) => v).map(([k]) => `${k} (hashed)`).join(", ") : "—"}</dd>
                  <dt className="text-ink-3">billable</dt>
                  <dd>{selected.is_billable ? "yes" : "no"} {selected.is_bot ? "· bot" : ""}</dd>
                </dl>
                <h3 className="text-sm font-semibold text-ink">{t("attempts")}</h3>
                {detail?.attempts.length ? (
                  <ul className="space-y-2">
                    {detail.attempts.map((a) => (
                      <li key={a.id} className="rounded-xl border border-line p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{detail.names.get(a.integrationId) ?? a.connector}</span>
                          <Badge tone={a.status === "success" ? "ok" : a.status === "skipped" ? "neutral" : "bad"}>{a.status}</Badge>
                          <span className="text-ink-3">
                            #{a.attempt} · {a.http ?? "—"} · {a.durationMs ?? 0} ms · {new Date(a.at).toLocaleTimeString()}
                          </span>
                        </div>
                        {a.status !== "success" ? (
                          <p className="mt-1 text-bad">
                            {a.errorClass} {a.code ?? ""} {a.message ?? ""}
                          </p>
                        ) : null}
                        {a.preview ? <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-2 p-2">{JSON.stringify(a.preview, null, 2)}</pre> : null}
                        {a.response ? <p className="mt-1 text-ink-3">{a.response}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-3">{t("noAttempts")}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
