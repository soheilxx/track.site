"use client";

import { RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Label, Select, Status, Switch, TBody, Table, Td, Th, THead, Tr, cn } from "@track-site/ui";
import type { ExplorerDetail, ExplorerList, RedactedAttempt } from "@/server/events";
import { EXPLORER_SOURCES, EXPLORER_STATUSES, EXPLORER_WINDOWS, type ExplorerFilters } from "./filters";
import { formatDateTime, formatTime } from "./format";
import { LineageTimeline, useReasonLabel } from "./timeline";
import { STATE_TONE, STEP_TONE } from "./tones";

const POLL_MS = 10_000;

export interface ExplorerProps {
  siteId: string;
  environmentId: string;
  filters: ExplorerFilters;
  initialList: ExplorerList;
  initialDetail: ExplorerDetail | null;
  initialEventId: string | null;
}

function queryOf(filters: ExplorerFilters, eventId: string | null, before: string | null): string {
  const p = new URLSearchParams();
  if (filters.name) p.set("name", filters.name);
  if (filters.source !== "all") p.set("source", filters.source);
  if (filters.status !== "all") p.set("status", filters.status);
  p.set("window", filters.window);
  if (before) p.set("before", before);
  if (eventId) p.set("event", eventId);
  return p.toString();
}

function AttemptView({ attempt, name }: { attempt: RedactedAttempt; name: string }) {
  const t = useTranslations("events.explorer.detail");
  const locale = useLocale();
  const reason = useReasonLabel();
  const tone = attempt.status === "success" ? "ok" : attempt.status === "skipped" ? "neutral" : attempt.status === "retry" ? "warn" : "bad";
  return (
    <li className="rounded-[var(--radius-control)] border border-line p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-ink">{name}</span>
        <span className="font-mono text-ink-3">{attempt.connectorType}</span>
        <Status tone={tone} chip indicator="both">
          {t(`attemptStatus.${attempt.status}`)}
        </Status>
        <span className="ml-auto tabular-nums text-ink-3">
          {t("attempt", { n: attempt.attempt + 1 })} · {attempt.httpStatus ? t("http", { status: attempt.httpStatus }) : "—"} · {t("duration", { ms: attempt.durationMs ?? 0 })} · {formatTime(attempt.startedAt, locale)}
        </span>
      </div>
      {attempt.status !== "success" ? (
        <p className={cn("mt-1", tone === "bad" ? "text-bad" : "text-ink-2")}>
          {reason(attempt.errorClass !== "none" ? attempt.errorClass : null)}
          {attempt.errorCode ? ` · ${reason(attempt.errorCode)}` : ""}
          {attempt.errorMessage ? ` · ${attempt.errorMessage}` : ""}
        </p>
      ) : null}
      {attempt.nextRetryAt ? <p className="mt-1 text-ink-3">{t("nextRetry", { time: formatDateTime(attempt.nextRetryAt, locale) })}</p> : null}
      {attempt.vendorEventId ? (
        <p className="mt-1 text-ink-3">
          {t("vendorEventId")}: <span className="font-mono">{attempt.vendorEventId}</span>
        </p>
      ) : null}
      {attempt.payloadPreview ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-2">{t("payload")}</summary>
          <pre className="mt-1 max-h-56 overflow-auto rounded-[var(--radius-control-sm)] bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(attempt.payloadPreview, null, 2)}</pre>
        </details>
      ) : null}
      {attempt.responseExcerpt ? (
        <p className="mt-2 break-words text-ink-3">
          {t("response")}: <span className="font-mono">{attempt.responseExcerpt}</span>
        </p>
      ) : null}
    </li>
  );
}

function Fact({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn("min-w-0 break-words text-ink", mono && "font-mono")}>{children}</dd>
    </>
  );
}

function DetailView({ detail, onSelect }: { detail: ExplorerDetail; onSelect: (eventId: string) => void }) {
  const t = useTranslations("events");
  const td = useTranslations("events.explorer.detail");
  const locale = useLocale();
  const reason = useReasonLabel();
  const e = detail.event;
  const sourceLabel = (source: string) => (t.has(`sources.${source}`) ? t(`sources.${source}`) : source);
  const yes = t("common.yes");
  const no = t("common.no");
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-base font-semibold text-ink">{e.name}</h2>
        <Status tone={STEP_TONE[detail.summary.tone]} chip indicator="both" live>
          {t(`stages.${detail.summary.stage}`)} · {t(`outcomes.${detail.summary.outcome}`)}
        </Status>
        {e.test ? <Badge tone="warn">{t("common.testEvent")}</Badge> : null}
        {e.sourceVerified ? <Badge tone="ok">{t("common.verified")}</Badge> : null}
      </div>
      {detail.summary.reason ? <p className="text-ink-2">{reason(detail.summary.reason)}</p> : null}
      <section aria-labelledby="ev-timeline">
        <h3 id="ev-timeline" className="mb-2 text-sm font-semibold text-ink">
          {td("timeline")}
        </h3>
        {!detail.lineageRecorded ? <p className="mb-2 text-xs text-ink-3">{td("derivedOnly")}</p> : null}
        <LineageTimeline steps={detail.timeline} integrations={detail.integrations} />
      </section>
      <section aria-labelledby="ev-facts">
        <h3 id="ev-facts" className="mb-2 text-sm font-semibold text-ink">
          {td("summary")}
        </h3>
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
          <Fact label={td("fields.eventId")} mono>
            {e.eventId}
          </Fact>
          <Fact label={td("fields.sourceEventId")} mono>
            {e.sourceEventId}
          </Fact>
          <Fact label={td("fields.captured")}>{formatDateTime(e.serverTs, locale, "long")}</Fact>
          <Fact label={td("fields.clientTime")}>{e.clientTs ? formatDateTime(e.clientTs, locale, "long") : "—"}</Fact>
          <Fact label={td("fields.source")}>
            {sourceLabel(e.source)} · {e.sdkVersion} · {e.configVersion !== null ? td("fields.configVersion", { version: e.configVersion }) : td("fields.noConfig")} · {e.schemaVersion}
          </Fact>
          <Fact label={td("fields.state")}>
            {t(`states.${e.state}`)}
            {e.dropReason ? ` · ${reason(e.dropReason)}` : ""}
          </Fact>
          <Fact label={td("fields.consent")}>
            {e.consent.granted.length ? e.consent.granted.join(", ") : td("fields.noPurposes")} · {td("fields.consentSource")}: {e.consent.source} · {td("fields.region")}: {e.consent.region ?? "—"} · {t("detailKeys.gpc")}: {e.consent.gpc ? yes : no}
            {e.consent.policyVersion ? ` · ${td("fields.policyVersion")}: ${e.consent.policyVersion}` : ""}
          </Fact>
          <Fact label={td("fields.clickIds")} mono>
            {e.clickIds.length ? e.clickIds.map((c) => `${c.key}=${c.value}`).join(", ") : "—"}
          </Fact>
          <Fact label={td("fields.vendorIds")} mono>
            {e.vendorIdKeys.length ? e.vendorIdKeys.join(", ") : "—"}
          </Fact>
          <Fact label={td("fields.page")}>{e.page.url ?? "—"}</Fact>
          <Fact label={td("fields.title")}>{e.page.title ?? "—"}</Fact>
          <Fact label={td("fields.referrer")}>{e.page.referrer ?? "—"}</Fact>
          <Fact label={td("fields.utm")} mono>
            {e.utm ? Object.entries(e.utm).map(([k, v]) => `${k}=${v}`).join(", ") : "—"}
          </Fact>
          <Fact label={td("fields.commerce")}>{e.commerce ? td("fields.commerceValue", { orderId: e.commerce.orderId ?? "—", value: e.commerce.value ?? "—", currency: e.commerce.currency ?? "—", items: e.commerce.items }) : "—"}</Fact>
          <Fact label={td("fields.userData")}>{e.userDataFields.length ? td("hashed", { n: e.userDataFields.length, fields: e.userDataFields.join(", ") }) : td("noUserData")}</Fact>
          <Fact label={td("fields.identity")} mono>
            {[e.identity.anonymousId && `${td("identityKind.anonymous")} ${e.identity.anonymousId}`, e.identity.sessionId && `${td("identityKind.session")} ${e.identity.sessionId}`, e.identity.userId && `${td("identityKind.user")} ${e.identity.userId}`].filter(Boolean).join(" · ") || "—"}
          </Fact>
          <Fact label={td("fields.device")}>{[e.ipTruncated, e.uaFamily, e.locale].filter(Boolean).join(" · ") || "—"}</Fact>
          <Fact label={td("fields.billable")}>
            {e.isBillable ? yes : no}
            {e.isBot ? ` · ${td("fields.bot")}` : ""}
          </Fact>
          <Fact label={td("fields.provenance")} mono>
            {Object.entries(e.provenance)
              .map(([k, v]) => `${k}: ${v.dataClass.toLowerCase()} (${v.source})`)
              .join(", ") || "—"}
          </Fact>
        </dl>
        {e.props && Object.keys(e.props).length ? (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-ink-2">{td("fields.props")}</summary>
            <pre className="mt-1 max-h-56 overflow-auto rounded-[var(--radius-control-sm)] bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-ink-2">{JSON.stringify(e.props, null, 2)}</pre>
          </details>
        ) : null}
        <p className="mt-2 text-xs text-ink-3">{td("redactionNote")}</p>
      </section>
      <section aria-labelledby="ev-attempts">
        <h3 id="ev-attempts" className="mb-2 text-sm font-semibold text-ink">
          {td("attempts")}
        </h3>
        {detail.attempts.length ? (
          <ul className="space-y-2">
            {detail.attempts.map((a) => (
              <AttemptView key={a.id} attempt={a} name={detail.integrations[a.integrationId]?.name ?? a.integrationId} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">{td("noAttempts")}</p>
        )}
      </section>
      <section aria-labelledby="ev-related">
        <h3 id="ev-related" className="mb-2 text-sm font-semibold text-ink">
          {td("related")}
        </h3>
        {detail.related.length ? (
          <ul className="space-y-1 text-xs">
            {detail.related.map((r) => (
              <li key={r.eventId} className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onSelect(r.eventId)} className="inline-flex min-h-8 items-center pointer-coarse:min-h-11 rounded-[var(--radius-control-sm)] px-1 font-mono text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {r.name}
                </button>
                <span className="text-ink-3">
                  {sourceLabel(r.source)} · {formatDateTime(r.serverTs, locale)} · {t(`states.${r.state}`)} · {td(`relatedVia.${r.via}`)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">{td("noRelated")}</p>
        )}
      </section>
    </div>
  );
}

/** Live Event Explorer (supplement §8 module 3): filters, polled list, correlated detail with full lineage. */
export function Explorer({ siteId, environmentId, filters: initialFilters, initialList, initialDetail, initialEventId }: ExplorerProps) {
  const t = useTranslations("events");
  const tx = useTranslations("events.explorer");
  const locale = useLocale();
  const router = useRouter();
  const reason = useReasonLabel();
  const sourceLabel = (source: string) => (t.has(`sources.${source}`) ? t(`sources.${source}`) : source);
  const stateLabel = (state: string) => (t.has(`states.${state}`) ? t(`states.${state}`) : state);
  const [form, setForm] = useState<ExplorerFilters>(initialFilters);
  const [filters, setFilters] = useState<ExplorerFilters>(initialFilters);
  const [list, setList] = useState<ExplorerList>(initialList);
  const [detail, setDetail] = useState<ExplorerDetail | null>(initialDetail);
  const [selected, setSelected] = useState<string | null>(initialEventId);
  const [detailMissing, setDetailMissing] = useState(Boolean(initialEventId && !initialDetail));
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"stale" | "failed" | null>(null);
  const latest = useRef({ filters, selected });
  useEffect(() => {
    latest.current = { filters, selected };
  }, [filters, selected]);

  const load = useCallback(
    async (opts: { before?: string | null; append?: boolean } = {}) => {
      const { filters: f, selected: s } = latest.current;
      setBusy(true);
      try {
        const res = await fetch(`/api/app/events/explorer?site=${siteId}&env=${environmentId}&${queryOf(f, opts.append ? null : s, opts.before ?? null)}`, { cache: "no-store" });
        if (res.status === 409) {
          setError("stale");
          setAuto(false);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { list: ExplorerList; detail: ExplorerDetail | null; detailFound: boolean | null };
        setList((prev) => (opts.append ? { ...data.list, events: [...prev.events, ...data.list.events], rejected: prev.rejected } : data.list));
        if (!opts.append) {
          setDetail(data.detail);
          setDetailMissing(data.detailFound === false);
        }
        setError(null);
      } catch {
        setError("failed");
      } finally {
        setBusy(false);
      }
    },
    [siteId, environmentId],
  );

  useEffect(() => {
    if (!auto) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [auto, load]);

  const apply = (next: ExplorerFilters, eventId: string | null) => {
    setFilters(next);
    setSelected(eventId);
    latest.current = { filters: next, selected: eventId };
    router.replace(`/app/events/explorer?${queryOf(next, eventId, null)}`, { scroll: false });
    void load();
  };

  const select = (eventId: string | null) => apply(filters, eventId);

  const updatedAt = useMemo(() => formatTime(list.updatedAt, locale), [list.updatedAt, locale]);

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"
        aria-label={tx("filters.label")}
        onSubmit={(ev) => {
          ev.preventDefault();
          apply({ ...form, before: null }, selected);
        }}
      >
        <div>
          <Label htmlFor="xp-name">{tx("filters.event")}</Label>
          <Input id="xp-name" name="name" value={form.name ?? ""} placeholder="purchase" pattern="[a-zA-Z][a-zA-Z0-9_]{0,63}" className="mt-1 font-mono" onChange={(ev) => setForm({ ...form, name: ev.target.value.trim() || null })} />
        </div>
        <div>
          <Label htmlFor="xp-source">{tx("filters.source")}</Label>
          <Select id="xp-source" name="source" value={form.source} className="mt-1" onChange={(ev) => setForm({ ...form, source: ev.target.value as ExplorerFilters["source"] })}>
            {EXPLORER_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`sources.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="xp-status">{tx("filters.status")}</Label>
          <Select id="xp-status" name="status" value={form.status} className="mt-1" onChange={(ev) => setForm({ ...form, status: ev.target.value as ExplorerFilters["status"] })}>
            {EXPLORER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tx(`statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="xp-window">{tx("filters.window")}</Label>
          <Select id="xp-window" name="window" value={form.window} className="mt-1" onChange={(ev) => setForm({ ...form, window: ev.target.value as ExplorerFilters["window"] })}>
            {EXPLORER_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {t(`windows.${w}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="md" loading={busy}>
            {tx("filters.apply")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const reset: ExplorerFilters = { name: null, source: "all", status: "all", window: "24h", before: null };
              setForm(reset);
              apply(reset, null);
            }}
          >
            {tx("filters.reset")}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Status tone={error ? "warn" : "ok"} live indicator="dot">
          {t("common.lastUpdated", { time: updatedAt })}
        </Status>
        <Switch checked={auto} onCheckedChange={setAuto} label={tx("polling.auto", { seconds: POLL_MS / 1000 })} />
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()} loading={busy} leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}>
          {t("common.refresh")}
        </Button>
      </div>
      {error === "stale" ? <Alert tone="warn">{tx("stale")}</Alert> : null}
      {error === "failed" ? <Alert tone="bad">{t("common.error")}</Alert> : null}
      {!list.lineageAvailable ? (
        <Alert tone="info" title={tx("lineageOff")}>
          {tx("lineageOffText")}
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <section aria-labelledby="xp-list" className="rounded-[var(--radius-card)] border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 id="xp-list" className="text-sm font-semibold text-ink">
                {tx("list.title")}
              </h2>
              <span className="text-xs text-ink-3" role="status">
                {tx("list.count", { n: list.events.length })}
              </span>
            </div>
            {list.events.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-ink">{tx("list.empty")}</p>
                <p className="mt-1 text-sm text-ink-3">{tx("list.emptyText")}</p>
              </div>
            ) : (
              <Table caption={tx("list.title")}>
                <THead>
                  <tr>
                    <Th>{tx("list.columns.time")}</Th>
                    <Th>{tx("list.columns.event")}</Th>
                    <Th>{tx("list.columns.source")}</Th>
                    <Th>{tx("list.columns.status")}</Th>
                    <Th>{tx("list.columns.deliveries")}</Th>
                  </tr>
                </THead>
                <TBody>
                  {list.events.map((e) => {
                    const active = e.eventId === selected;
                    return (
                      <Tr key={e.eventId} className={cn(active && "bg-primary-soft/40 hover:bg-primary-soft/40")}>
                        <Td label={tx("list.columns.time")} className="whitespace-nowrap text-xs tabular-nums text-ink-3">
                          {formatDateTime(e.serverTs, locale)}
                        </Td>
                        <Td label={tx("list.columns.event")}>
                          <button type="button" aria-pressed={active} onClick={() => select(e.eventId)} className="inline-flex min-h-8 items-center pointer-coarse:min-h-11 gap-2 rounded-[var(--radius-control-sm)] px-1 font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                            {e.name}
                          </button>
                          {e.test ? (
                            <Badge tone="warn" className="ml-1">
                              {t("common.testEvent")}
                            </Badge>
                          ) : null}
                        </Td>
                        <Td label={tx("list.columns.source")} className="text-xs">
                          {sourceLabel(e.source)}
                          {e.sourceVerified ? ` · ${t("common.verified")}` : ""}
                        </Td>
                        <Td label={tx("list.columns.status")}>
                          <Status tone={STATE_TONE[e.state] ?? "neutral"} chip indicator="both">
                            {stateLabel(e.state)}
                          </Status>
                          {e.dropReason ? <p className="mt-0.5 text-xs text-ink-3">{reason(e.dropReason)}</p> : null}
                        </Td>
                        <Td label={tx("list.columns.deliveries")} className="text-xs tabular-nums text-ink-2">
                          {e.deliveries.delivered + e.deliveries.failed + e.deliveries.skipped + e.deliveries.pending === 0 ? "—" : tx("list.deliveries", e.deliveries)}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
            {list.nextBefore ? (
              <div className="border-t border-line px-4 py-3">
                <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => void load({ before: list.nextBefore, append: true })}>
                  {tx("list.loadMore")}
                </Button>
              </div>
            ) : null}
          </section>

          {list.lineageAvailable && (filters.status === "all" || filters.status === "rejected") ? (
            <section aria-labelledby="xp-rejected" className="rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <h2 id="xp-rejected" className="text-sm font-semibold text-ink">
                  {tx("rejected.title")}
                </h2>
                <p className="mt-0.5 text-xs text-ink-3">{tx("rejected.text")}</p>
              </div>
              {list.rejected.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-3">{tx("rejected.empty")}</p>
              ) : (
                <Table caption={tx("rejected.title")}>
                  <THead>
                    <tr>
                      <Th>{tx("list.columns.time")}</Th>
                      <Th>{tx("list.columns.event")}</Th>
                      <Th>{tx("list.columns.source")}</Th>
                      <Th>{tx("rejected.columns.stage")}</Th>
                      <Th>{tx("rejected.columns.reason")}</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {list.rejected.map((r) => (
                      <Tr key={`${r.eventId}-${r.stage}`}>
                        <Td label={tx("list.columns.time")} className="whitespace-nowrap text-xs tabular-nums text-ink-3">
                          {formatDateTime(r.occurredAt, locale)}
                        </Td>
                        <Td label={tx("list.columns.event")} className="font-mono text-xs">
                          {r.name}
                        </Td>
                        <Td label={tx("list.columns.source")} className="text-xs">
                          {sourceLabel(r.source)}
                        </Td>
                        <Td label={tx("rejected.columns.stage")}>
                          <Status tone="bad" chip indicator="both">
                            {t(`stages.${r.stage}`)} · {t(`outcomes.${r.outcome}`)}
                          </Status>
                        </Td>
                        <Td label={tx("rejected.columns.reason")} className="text-xs text-ink-2">
                          {reason(r.reason) ?? "—"}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="xp-detail" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
          <h2 id="xp-detail" className="sr-only">
            {tx("detail.title")}
          </h2>
          {detail ? <DetailView detail={detail} onSelect={select} /> : <p className="text-sm text-ink-3">{detailMissing ? tx("detail.notFound") : tx("detail.select")}</p>}
        </aside>
      </div>
    </div>
  );
}
