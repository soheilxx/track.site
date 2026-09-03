"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@track-site/ui";
import { deleteShopConnectionAction, saveShopConnectionAction, setShopSecretAction, toggleShopConnectionAction } from "@/server/actions/shops";
import type { ActionState } from "@/server/actions/organization";

export type ShopPlatform = "shopify" | "woocommerce" | "shopware";

export interface ShopConnectionView {
  id: string;
  platform: ShopPlatform;
  shopDomain: string;
  status: "pending" | "connected" | "paused";
  pathToken: string;
  hasSecret: boolean;
  settings: { default_currency?: string; purchase_on?: string; topics?: string[] };
  lastEventAt: string | null;
  lastError: string | null;
}

const PLATFORMS: ShopPlatform[] = ["shopify", "woocommerce", "shopware"];
const INITIAL: ActionState = { ok: false, error: null };

export function ShopConnections({ siteId, trackingId, ingestUrl, connections }: { siteId: string; trackingId: string; ingestUrl: string; connections: ShopConnectionView[] }) {
  const t = useTranslations("app.shop");
  return (
    <div className="space-y-4">
      <Alert tone="info">{t("pairingNote")}</Alert>
      {PLATFORMS.map((platform) => (
        <PlatformCard key={platform} platform={platform} siteId={siteId} trackingId={trackingId} ingestUrl={ingestUrl} conn={connections.find((c) => c.platform === platform) ?? null} />
      ))}
    </div>
  );
}

function PlatformCard({ platform, siteId, trackingId, ingestUrl, conn }: { platform: ShopPlatform; siteId: string; trackingId: string; ingestUrl: string; conn: ShopConnectionView | null }) {
  const t = useTranslations("app.shop");
  const [saveState, saveAction, saving] = useActionState(saveShopConnectionAction, INITIAL);
  const [secretState, secretAction, storing] = useActionState(setShopSecretAction, INITIAL);
  const [toggleState, toggleAction, toggling] = useActionState(toggleShopConnectionAction, INITIAL);
  const [deleteState, deleteAction, deleting] = useActionState(deleteShopConnectionAction, INITIAL);
  const base = `${ingestUrl.replace(/\/$/, "")}/v1/shop/${platform}/${trackingId}`;
  const webhookUrl = conn ? `${base}/${conn.pathToken}` : null;
  const tone = conn?.status === "connected" ? "ok" : conn?.status === "paused" ? "neutral" : "warn";
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t(`platform.${platform}`)}</CardTitle>
          {conn ? <Badge tone={tone}>{t(`status.${conn.status}`)}</Badge> : <Badge tone="neutral">{t("status.none")}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={saveAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="platform" value={platform} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">{t("domain")}</span>
              <Input name="shopDomain" defaultValue={conn?.shopDomain ?? ""} placeholder={t(`domainHelp.${platform}`)} required aria-invalid={saveState.fieldErrors?.shopDomain ? true : undefined} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">{t("currency")}</span>
              <Input name="defaultCurrency" defaultValue={conn?.settings.default_currency ?? ""} placeholder="EUR" maxLength={3} />
            </label>
            {platform === "shopware" ? (
              <label className="text-sm">
                <span className="mb-1 block text-ink-2">{t("purchaseOn")}</span>
                <Select name="purchaseOn" defaultValue={conn?.settings.purchase_on ?? "paid"}>
                  <option value="paid">{t("purchaseOnPaid")}</option>
                  <option value="placed">{t("purchaseOnPlaced")}</option>
                </Select>
              </label>
            ) : null}
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" loading={saving}>
              {t("save")}
            </Button>
          </div>
        </form>
        {saveState.ok ? <Alert tone="ok">{t("saved")}</Alert> : saveState.error ? <Alert tone="bad">{t("errors.generic")}</Alert> : null}

        {conn && webhookUrl ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-ink-2">{t("webhookUrl")}</p>
              <code className="mt-1 block break-all font-mono text-xs text-ink">{webhookUrl}</code>
              <p className="mt-1 text-xs text-ink-3">{t("webhookHelp")}</p>
              {platform === "shopware" ? (
                <>
                  <p className="mt-3 text-ink-2">{t("registrationUrl")}</p>
                  <code className="mt-1 block break-all font-mono text-xs text-ink">{`${webhookUrl}/register`}</code>
                </>
              ) : null}
            </div>

            <form action={secretAction} className="space-y-2">
              <input type="hidden" name="siteId" value={siteId} />
              <input type="hidden" name="connectionId" value={conn.id} />
              <label className="block text-sm">
                <span className="mb-1 block text-ink-2">{t("secret")}</span>
                <Input name="secret" type="password" autoComplete="off" minLength={8} required aria-invalid={secretState.fieldErrors?.secret ? true : undefined} />
              </label>
              <p className="text-xs text-ink-3">{t(`secretHelp.${platform}`)}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" loading={storing}>
                  {t("storeSecret")}
                </Button>
                <span className="text-xs text-ink-3">{conn.hasSecret ? t("secretSet") : t("secretMissing")}</span>
              </div>
              {secretState.ok ? <Alert tone="ok">{t("secretSaved")}</Alert> : secretState.error === "vault" ? <Alert tone="bad">{t("errors.vault")}</Alert> : secretState.error ? <Alert tone="bad">{t("errors.generic")}</Alert> : null}
            </form>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-3">{t("lastEvent")}</dt>
                <dd className="text-ink">{conn.lastEventAt ? new Date(conn.lastEventAt).toLocaleString() : t("never")}</dd>
              </div>
              {conn.lastError ? (
                <div>
                  <dt className="text-ink-3">{t("lastError")}</dt>
                  <dd className="font-mono text-xs text-bad">{conn.lastError}</dd>
                </div>
              ) : null}
              {conn.settings.topics?.length ? (
                <div className="sm:col-span-2">
                  <dt className="text-ink-3">{t("topics")}</dt>
                  <dd className="font-mono text-xs text-ink">{conn.settings.topics.join(", ")}</dd>
                </div>
              ) : null}
            </dl>

            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>{t(`steps.${platform}.${n}`)}</li>
              ))}
            </ol>

            <div className="flex flex-wrap gap-2">
              <form action={toggleAction}>
                <input type="hidden" name="siteId" value={siteId} />
                <input type="hidden" name="connectionId" value={conn.id} />
                <input type="hidden" name="status" value={conn.status === "paused" ? "pending" : "paused"} />
                <Button type="submit" size="sm" variant="secondary" loading={toggling}>
                  {conn.status === "paused" ? t("resume") : t("pause")}
                </Button>
              </form>
              <form action={deleteAction}>
                <input type="hidden" name="siteId" value={siteId} />
                <input type="hidden" name="connectionId" value={conn.id} />
                <Button type="submit" size="sm" variant="ghost" loading={deleting}>
                  {t("delete")}
                </Button>
              </form>
            </div>
            {toggleState.error || deleteState.error ? <Alert tone="bad">{t("errors.generic")}</Alert> : null}
          </div>
        ) : (
          <p className="text-sm text-ink-3">{t("createFirst")}</p>
        )}
      </CardContent>
    </Card>
  );
}
