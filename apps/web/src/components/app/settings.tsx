"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, Badge, Button, Input, Label, Select } from "@track-site/ui";
import type { ActionState } from "@/server/actions/organization";
import { createSourceKeyAction, revokeSourceKeyAction, updateOrgSettingsAction, updateOrganizationAction, updateSiteAction, type KeyState } from "@/server/actions/settings";

const initial: ActionState = { ok: false, error: null };

export function OrganizationForm({ name }: { name: string }) {
  const t = useTranslations("app.settings");
  const [state, action, pending] = useActionState(updateOrganizationAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.ok ? <Alert tone="ok">{t("saved")}</Alert> : null}
      {state.error ? <Alert tone="bad">{t("error")}</Alert> : null}
      <div>
        <Label htmlFor="org-name">{t("orgName")}</Label>
        <Input id="org-name" name="name" defaultValue={name} required minLength={2} maxLength={80} className="mt-1" />
      </div>
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}

export function OrgSettingsForm({ settings }: { settings: { locale: string; dataRegion: string; aiEnabled: boolean; benchmarkOptIn: boolean; killSwitch: boolean } }) {
  const t = useTranslations("app.settings");
  const [state, action, pending] = useActionState(updateOrgSettingsAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.ok ? <Alert tone="ok">{t("saved")}</Alert> : null}
      {state.error ? <Alert tone="bad">{t("error")}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="set-locale">{t("locale")}</Label>
          <Select id="set-locale" name="locale" defaultValue={settings.locale} className="mt-1">
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="set-region">{t("dataRegion")}</Label>
          <Select id="set-region" name="dataRegion" defaultValue={settings.dataRegion} className="mt-1">
            <option value="eu">EU (Frankfurt)</option>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="aiEnabled" defaultChecked={settings.aiEnabled} /> {t("aiEnabled")}
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="benchmarkOptIn" defaultChecked={settings.benchmarkOptIn} /> {t("benchmark")}
      </label>
      <label className="flex items-center gap-2 text-sm text-bad">
        <input type="checkbox" name="killSwitch" defaultChecked={settings.killSwitch} /> {t("killSwitch")}
      </label>
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}

export function SiteSettingsForm({ site }: { site: { id: string; name: string; trackingId: string; killSwitch: boolean } }) {
  const t = useTranslations("app.settings");
  const [state, action, pending] = useActionState(updateSiteAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="siteId" value={site.id} />
      <div className="flex-1">
        <Label htmlFor={`site-${site.id}`}>
          {t("siteName")} <span className="font-mono text-xs text-ink-3">{site.trackingId}</span>
        </Label>
        <Input id={`site-${site.id}`} name="name" defaultValue={site.name} required className="mt-1" />
      </div>
      <label className="flex items-center gap-2 text-sm text-bad">
        <input type="checkbox" name="killSwitch" defaultChecked={site.killSwitch} /> {t("siteKill")}
      </label>
      <Button type="submit" size="sm" loading={pending}>
        {t("save")}
      </Button>
      {state.ok ? <span className="text-xs text-ok">{t("saved")}</span> : null}
    </form>
  );
}

export function SourceKeys({ sites, keys }: { sites: Array<{ id: string; name: string }>; keys: Array<{ id: string; siteId: string; name: string; prefix: string; last4: string; status: string; lastUsedAt: string | null }> }) {
  const t = useTranslations("app.settings");
  const [state, action, pending] = useActionState(createSourceKeyAction, initial as KeyState);
  const [, revoke, revoking] = useActionState(revokeSourceKeyAction, initial);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-3">{t("keysText")}</p>
      {state.secret ? (
        <Alert tone="ok" title={t("keyCreated")}>
          <code className="block break-all rounded bg-surface-2 p-2 font-mono text-xs">{state.secret}</code>
          <p className="mt-1 text-xs">{t("keyOnce")}</p>
        </Alert>
      ) : null}
      {state.error ? <Alert tone="bad">{t("error")}</Alert> : null}
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="key-site">{t("site")}</Label>
          <Select id="key-site" name="siteId" className="mt-1">
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="key-name">{t("keyName")}</Label>
          <Input id="key-name" name="name" required maxLength={60} placeholder="CRM sync" className="mt-1" />
        </div>
        <Button type="submit" loading={pending}>
          {t("createKey")}
        </Button>
      </form>
      <ul className="divide-y divide-line">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              <span className="text-ink">{k.name}</span> <span className="font-mono text-xs text-ink-3">{k.prefix}…{k.last4}</span> <Badge tone={k.status === "active" ? "ok" : "neutral"}>{k.status}</Badge>
              <span className="ml-2 text-xs text-ink-3">{sites.find((s) => s.id === k.siteId)?.name}</span>
              {k.lastUsedAt ? <span className="ml-2 text-xs text-ink-3">{t("lastUsed", { date: new Date(k.lastUsedAt).toLocaleString() })}</span> : null}
            </span>
            {k.status === "active" ? (
              <form action={revoke}>
                <input type="hidden" name="keyId" value={k.id} />
                <Button type="submit" size="sm" variant="ghost" loading={revoking}>
                  {t("revoke")}
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
