import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PgEventStore } from "@track-site/analytics";
import { listSites } from "@track-site/db";
import type { CanonicalEvent } from "@track-site/events";
import { Alert, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard } from "@track-site/ui";
import { pool } from "@/server/db";
import { requireOrgContext, withOrg } from "@/server/session";

/**
 * Consent-aware audiences derived from first-party events (last 30 days, marketing consent only).
 * Segments are computed on read; nothing is exported to vendors from here — advertising platforms
 * receive only the per-event server conversions with matching data, never raw audience lists.
 */
function marketing(e: CanonicalEvent): boolean {
  return e.consent.granted.includes("marketing");
}

function uniq(events: CanonicalEvent[]): Set<string> {
  return new Set(events.map((e) => e.user_id ?? e.anonymous_id ?? "").filter(Boolean));
}

export default async function AudiencesPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const q = await searchParams;
  const ctx = await requireOrgContext("events.read");
  const t = await getTranslations("app.audiences");
  const sites = await withOrg(ctx, (tx) => listSites(tx, ctx.organization.id));
  const site = sites.find((s) => s.id === q.site) ?? sites[0] ?? null;
  if (!site) return <EmptyState title={t("noSites")} />;
  const store = new PgEventStore(pool());
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const [purchases, leads, carts, checkouts, signups] = await Promise.all([
    store.query({ siteId: site.id, name: "purchase", from, limit: 1000 }),
    store.query({ siteId: site.id, name: "generate_lead", from, limit: 1000 }),
    store.query({ siteId: site.id, name: "add_to_cart", from, limit: 1000 }),
    store.query({ siteId: site.id, name: "begin_checkout", from, limit: 1000 }),
    store.query({ siteId: site.id, name: "sign_up", from, limit: 1000 }),
  ]);
  const buyers = uniq(purchases.filter(marketing));
  const cartUsers = uniq(carts.filter(marketing));
  const checkoutUsers = uniq(checkouts.filter(marketing));
  const abandoners = new Set([...cartUsers, ...checkoutUsers].filter((id) => !buyers.has(id)));
  const highValue = uniq(purchases.filter((e) => marketing(e) && Number(e.commerce?.value ?? 0) >= 100));
  const withoutConsent = purchases.length + leads.length + carts.length + checkouts.length + signups.length - [purchases, leads, carts, checkouts, signups].reduce((a, l) => a + l.filter(marketing).length, 0);
  const segments = [
    { key: "buyers", size: buyers.size, events: "purchase" },
    { key: "highValue", size: highValue.size, events: "purchase ≥ 100" },
    { key: "abandoners", size: abandoners.size, events: "add_to_cart / begin_checkout without purchase" },
    { key: "leads", size: uniq(leads.filter(marketing)).size, events: "generate_lead" },
    { key: "signups", size: uniq(signups.filter(marketing)).size, events: "sign_up" },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {sites.map((s) => (
            <Link key={s.id} href={`/app/audiences?site=${s.id}`} className={`rounded-full px-3 py-1 ${s.id === site.id ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-3"}`}>
              {s.name}
            </Link>
          ))}
        </div>
      </div>
      <Alert tone="info">{t("consentNote", { n: withoutConsent })}</Alert>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {segments.map((s) => (
          <StatCard key={s.key} label={t(`segments.${s.key}`)} value={s.size} hint={s.events} />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("howTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-2">
          <p>{t("how1")}</p>
          <p>{t("how2")}</p>
          <p>{t("how3")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
