import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge, Container } from "@track-site/ui";
import { JsonLd } from "@/components/marketing/json-ld";
import { pool } from "@/server/db";
import { BRAND_NAME, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seoDescription, seoTitle } from "@/lib/seo-text";

export const dynamic = "force-dynamic";

const COPY = {
  en: { title: "System status", intro: "Live health of the Track components, checked on every page load. Incident history is published here when one occurs.", component: "Component", state: "State", checked: "Checked", ok: "operational", degraded: "degraded", down: "unavailable", db: "Control plane database", queue: "Event queue backlog", worker: "Delivery worker (last delivery attempt)", collector: "Collector (ingest)", none: "no data yet", incidents: "Incidents", noIncidents: "No incidents recorded.", note: "Status is derived from the same database and queue the product uses; there is no separate status service to disagree with." },
  de: { title: "Systemstatus", intro: "Live-Zustand der Track-Komponenten, bei jedem Seitenaufruf geprüft. Vorfälle werden hier veröffentlicht, wenn sie auftreten.", component: "Komponente", state: "Zustand", checked: "Geprüft", ok: "betriebsbereit", degraded: "eingeschränkt", down: "nicht verfügbar", db: "Control-Plane-Datenbank", queue: "Event-Queue-Rückstand", worker: "Zustell-Worker (letzter Zustellversuch)", collector: "Collector (Ingest)", none: "noch keine Daten", incidents: "Vorfälle", noIncidents: "Keine Vorfälle verzeichnet.", note: "Der Status wird aus derselben Datenbank und Queue abgeleitet, die das Produkt nutzt; es gibt keinen separaten Statusdienst, der abweichen könnte." },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = locale === "de" ? COPY.de : COPY.en;
  return pageMetadata({ locale, path: "/status", title: seoTitle(c.title), description: seoDescription(c.intro) });
}

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

export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = locale === "de" ? COPY.de : COPY.en;
  const s = await probe();
  const now = new Date();
  const rows = [
    { name: c.db, state: s.db === "ok" ? "ok" : "down", detail: s.db },
    { name: c.queue, state: s.backlog === null ? "degraded" : s.backlog > 10_000 ? "degraded" : "ok", detail: s.backlog === null ? c.none : `${s.backlog} pending` },
    { name: c.worker, state: s.lastAttempt ? "ok" : "degraded", detail: s.lastAttempt ? s.lastAttempt.toLocaleString() : c.none },
    { name: c.collector, state: s.lastEvent ? "ok" : "degraded", detail: s.lastEvent ? s.lastEvent.toLocaleString() : c.none },
  ] as const;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: BRAND_NAME, path: "/" }, { name: c.title, path: "/status" }], locale)} />
      <Container className="max-w-3xl py-14 md:py-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">{c.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{c.intro}</p>
        <div className="mt-8 overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2">{c.component}</th>
                <th className="px-4 py-2">{c.state}</th>
                <th className="px-4 py-2">{c.checked}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2 text-ink">{r.name}</td>
                  <td className="px-4 py-2">
                    <Badge tone={r.state === "ok" ? "ok" : r.state === "degraded" ? "warn" : "bad"}>{r.state === "ok" ? c.ok : r.state === "degraded" ? c.degraded : c.down}</Badge> <span className="text-xs text-ink-3">{r.detail}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-3">{now.toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mt-10 font-display text-xl font-semibold text-ink">{c.incidents}</h2>
        <p className="mt-2 text-sm text-ink-2">{c.noIncidents}</p>
        <p className="mt-6 text-xs text-ink-3">{c.note}</p>
      </Container>
    </>
  );
}
