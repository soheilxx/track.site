"use client";

import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@track-site/ui";
import { createDestinationAction } from "@/server/actions/destinations";
import type { ActionState } from "@/server/actions/organization";

export interface CatalogEntry {
  type: string;
  displayName: string;
  browser: boolean;
  server: boolean;
  offline: boolean;
  verifiedAt: string;
  docsUrl: string;
  accessNote: string | null;
  group: "ads" | "analytics" | "affiliate" | "other";
}

export interface AffiliatePresetOption {
  id: string;
  name: string;
}

const initial: ActionState = { ok: false, error: null };

export function DestinationCatalog({ siteId, entries, presets }: { siteId: string; entries: CatalogEntry[]; presets: AffiliatePresetOption[] }) {
  const t = useTranslations("destinations");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [state, action, pending] = useActionState(createDestinationAction, initial);
  const filtered = useMemo(() => entries.filter((e) => !query || e.displayName.toLowerCase().includes(query.toLowerCase()) || e.type.includes(query.toLowerCase())), [entries, query]);
  const groups: Array<{ key: CatalogEntry["group"]; label: string }> = [
    { key: "ads", label: t("groupAds") },
    { key: "analytics", label: t("groupAnalytics") },
    { key: "affiliate", label: t("groupAffiliate") },
    { key: "other", label: t("groupOther") },
  ];
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="catalog-search">{t("search")}</Label>
        <Input id="catalog-search" value={query} onChange={(e) => setQuery(e.target.value)} className="mt-1 max-w-md" placeholder="Meta, Google Ads, Awin…" />
      </div>
      {state.error ? <Alert tone="bad">{t("status_error")}</Alert> : null}
      {groups.map((g) => {
        const items = filtered.filter((e) => e.group === g.key);
        if (!items.length) return null;
        return (
          <section key={g.key} aria-labelledby={`grp-${g.key}`}>
            <h2 id={`grp-${g.key}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">
              {g.label}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((e) => (
                <Card key={e.type} className={`flex flex-col p-4 ${selected?.type === e.type ? "border-primary" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{e.displayName}</p>
                    <span className="flex gap-1">
                      {e.browser ? <Badge tone="neutral">{t("browser")}</Badge> : null}
                      {e.server ? <Badge tone="neutral">{t("server")}</Badge> : null}
                      {e.offline ? <Badge tone="neutral">{t("offline")}</Badge> : null}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-3">{t("verified", { date: e.verifiedAt.slice(0, 10) })}</p>
                  {e.accessNote ? (
                    <p className="mt-2 text-xs text-warn">
                      <span className="font-medium">{t("accessRequired")}:</span> {e.accessNote}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <a href={e.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
                      Docs
                    </a>
                    <Button size="sm" variant={selected?.type === e.type ? "primary" : "secondary"} onClick={() => setSelected(e)}>
                      {t("create")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
      {selected ? (
        <Card className="border-primary p-4">
          <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="connectorType" value={selected.type} />
            <div>
              <Label htmlFor="dest-name">{t("customName")}</Label>
              <Input id="dest-name" name="name" maxLength={80} className="mt-1" placeholder={selected.displayName} />
            </div>
            {selected.type === "affiliate" ? (
              <div>
                <Label htmlFor="dest-preset">{t("affiliateNetwork")}</Label>
                <Select id="dest-preset" name="preset" className="mt-1" defaultValue="awin">
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div />
            )}
            <Button type="submit" loading={pending}>
              {t("create")} · {selected.displayName}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
