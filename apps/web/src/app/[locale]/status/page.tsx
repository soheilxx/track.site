import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { EmptyState, ProductStage, Status, TBody, Table, Td, Th, THead, Tr, type Tone } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { StatusFlowDiagram } from "@/components/marketing/secondary/diagrams";
import { PageIntro, PageSection, SectionHeading } from "@/components/marketing/secondary/shell";
import { pool } from "@/server/db";
import { SECONDARY_COPY, pick } from "@/lib/marketing-copy";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const s = pick(locale, SECONDARY_COPY).status;
  return pageMetadata({ locale, path: "/status", title: seoTitle(s.title), description: seoDescription(s.intro) });
}

type Level = "ok" | "degraded" | "down";
const TONE: Record<Level, Tone> = { ok: "ok", degraded: "warn", down: "bad" };

/** Live probe of the same database and queue the product uses; every failure degrades honestly to "no data". */
async function probe(): Promise<{ db: "ok" | "down"; backlog: number | null; lastAttempt: Date | null; lastEvent: Date | null }> {
  try {
    const p = pool();
    const [backlog, attempt, event] = await Promise.all([
      p.query<{ n: string }>(`SELECT count(*)::text AS n FROM queue_messages WHERE available_at <= now() AND (locked_until IS NULL OR locked_until < now())`).catch(() => ({ rows: [{ n: null }] })),
      p.query<{ at: Date | null }>(`SELECT max(started_at) AS at FROM delivery_attempts`).catch(() => ({ rows: [{ at: null }] })),
      p.query<{ at: Date | null }>(`SELECT max(enqueued_at) AS at FROM queue_messages`).catch(() => ({ rows: [{ at: null }] })),
    ]);
    return { db: "ok", backlog: backlog.rows[0]?.n != null ? Number(backlog.rows[0].n) : null, lastAttempt: attempt.rows[0]?.at ?? null, lastEvent: event.rows[0]?.at ?? null };
  } catch {
    return { db: "down", backlog: null, lastAttempt: null, lastEvent: null };
  }
}

/** Status: component table with dot + icon + text states, the event path toned by the same states, incidents. */
export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale, SECONDARY_COPY);
  const s = c.status;
  const p = await probe();
  const now = new Date();
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const stamp = (d: Date) => `${fmt.format(d)} ${c.common.utc}`;
  const label: Record<Level, string> = { ok: s.ok, degraded: s.degraded, down: s.down };
  const rows = [
    { key: "db", name: s.db, level: p.db === "ok" ? "ok" : "down", detail: p.db === "ok" ? s.ok : s.down },
    { key: "queue", name: s.queue, level: p.backlog === null ? "degraded" : p.backlog > 10_000 ? "degraded" : "ok", detail: p.backlog === null ? s.none : s.pending.replace("{n}", new Intl.NumberFormat(locale).format(p.backlog)) },
    { key: "worker", name: s.worker, level: p.lastAttempt ? "ok" : "degraded", detail: p.lastAttempt ? stamp(p.lastAttempt) : s.none },
    { key: "collector", name: s.collector, level: p.lastEvent ? "ok" : "degraded", detail: p.lastEvent ? stamp(p.lastEvent) : s.none },
  ] as const satisfies ReadonlyArray<{ key: "db" | "queue" | "worker" | "collector"; name: string; level: Level; detail: string }>;
  const nodeState = (key: (typeof rows)[number]["key"]) => {
    const row = rows.find((r) => r.key === key)!;
    return { tone: TONE[row.level], text: label[row.level] };
  };
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: s.title, path: "/status" }], locale)} />
      <PageIntro eyebrow={s.eyebrow} title={s.title} text={s.intro} meta={`${s.checkedAt}: ${stamp(now)}`} />

      <PageSection id="components" labelledBy="components-title">
        <SectionHeading id="components-title" title={s.componentsTitle} />
        <Table className="mt-6" caption={s.componentsTitle}>
          <THead>
            <tr>
              <Th>{s.component}</Th>
              <Th>{s.state}</Th>
              <Th>{s.detail}</Th>
              <Th>{s.checked}</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.key}>
                <Td label={s.component} className="font-medium text-ink">
                  {r.name}
                </Td>
                <Td label={s.state}>
                  <Status tone={TONE[r.level]} indicator="both">
                    {label[r.level]}
                  </Status>
                </Td>
                <Td label={s.detail} className="text-ink-2">
                  {r.detail}
                </Td>
                <Td label={s.checked} className="text-ink-3">
                  {stamp(now)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </PageSection>

      <PageSection id="flow" labelledBy="flow-title" tone="surface">
        <SectionHeading id="flow-title" title={s.flow.title} />
        <ProductStage as="div" tone="light" className="mt-8">
          <StatusFlowDiagram title={s.flow.title} caption={s.flow.caption} labels={{ collector: s.flow.collector, queue: s.flow.queue, worker: s.flow.worker, database: s.flow.database, destinations: s.flow.destinations }} states={{ collector: nodeState("collector"), queue: nodeState("queue"), worker: nodeState("worker"), db: nodeState("db") }} />
        </ProductStage>
      </PageSection>

      <PageSection id="incidents" labelledBy="incidents-title">
        <SectionHeading id="incidents-title" title={s.incidents} />
        <EmptyState className="mt-6" title={s.noIncidents} description={s.incidentsText} />
        <p className="mt-6 max-w-text text-small text-ink-3">{s.note}</p>
      </PageSection>
    </>
  );
}
