"use client";

import { useTranslations } from "next-intl";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea } from "@track-site/ui";
import { ApprovalCard, SecureCredentialCard } from "@/components/chat/inputs";
import type { PendingApprovalView } from "@/components/chat/types";
import { toggleDestinationAction } from "@/server/actions/destinations";
import type { ActionState } from "@/server/actions/organization";

type ToolResult<T = Record<string, unknown>> = { ok: boolean; code: string; message: string; data: T | null };

async function callTool<T = Record<string, unknown>>(siteId: string, tool: string, args: Record<string, unknown> = {}): Promise<ToolResult<T>> {
  const res = await fetch("/api/ai/wizard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, tool, args }) });
  return (await res.json()) as ToolResult<T>;
}

export interface WizardProps {
  siteId: string;
  integration: { id: string; type: string; name: string; status: string; health: { status: string; detail: string | null; checkedAt: string | null }; testMode: boolean; publicConfig: Record<string, unknown>; settings: Record<string, unknown> };
  connector: {
    displayName: string;
    apiVersion: string;
    verifiedAt: string;
    docsUrl: string;
    supportsBrowser: boolean;
    supportsServer: boolean;
    dedupField: string | null;
    accessNote: string | null;
    requiredPublicIds: Array<{ key: string; label: string; pattern: string; example: string; help: string }>;
    requiredCredentials: Array<{ kind: string; label: string; help: string; oauth: string | null }>;
    transfer: { recipient: string; region: string; basis: string };
  };
  purpose: string;
  clickIds: string[];
  offline: boolean;
  testHint: string;
  settingKeys: string[];
  credentials: Array<{ id: string; kind: string; label: string; last4: string | null; status: string }>;
  draft: { mode: "browser" | "server" | "hybrid"; enabled: boolean; test_mode: boolean; mappings: Array<{ event: string; vendor_event: string; enabled: boolean }> } | null;
  standardEvents: string[];
  oauthNotice: string | null;
}

const STEP_IDS = ["destination", "prerequisites", "mode", "ids", "settings", "credentials", "validate", "consent", "clickIds", "mappings", "dedup", "snippet", "test", "vendorCheck", "offline", "quality", "review", "publish", "monitor"] as const;
type StepId = (typeof STEP_IDS)[number];
const RECORD_SETTINGS = ["conversion_rules", "conversion_actions", "floodlight_activities", "event_ids"];

function recordToLines(v: unknown): string {
  return v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}=${String(x)}`).join("\n") : "";
}

function linesToRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const [k, ...rest] = line.split("=");
    if (k?.trim() && rest.length) out[k.trim()] = rest.join("=").trim();
  }
  return out;
}

export function DestinationWizard(props: WizardProps) {
  const t = useTranslations("destinations.wizard");
  const td = useTranslations("destinations");
  const { siteId, integration, connector } = props;
  const [step, setStep] = useState<StepId>(() => {
    if (integration.status === "connected" && props.draft?.enabled) return "monitor";
    if (connector.requiredPublicIds.some((p) => !/\?\$$/.test(p.pattern) && !integration.publicConfig[p.key])) return "ids";
    if (connector.requiredCredentials.length && !props.credentials.some((c) => c.status === "active")) return "credentials";
    return "destination";
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [publicConfig, setPublicConfig] = useState(integration.publicConfig);
  const [credentials, setCredentials] = useState(props.credentials);
  const [mode, setMode] = useState(props.draft?.mode ?? (connector.supportsBrowser && connector.supportsServer ? "hybrid" : connector.supportsBrowser ? "browser" : "server"));
  const [testMode, setTestMode] = useState(props.draft?.test_mode ?? integration.testMode);
  const [mappings, setMappings] = useState<Record<string, { enabled: boolean; vendor: string }>>(() => Object.fromEntries(props.standardEvents.map((e) => [e, { enabled: props.draft?.mappings.find((m) => m.event === e)?.enabled ?? ["purchase", "generate_lead", "sign_up", "add_to_cart", "begin_checkout", "page_view", "view_item"].includes(e), vendor: props.draft?.mappings.find((m) => m.event === e)?.vendor_event ?? "" }])));
  const [settings, setSettings] = useState<Record<string, string>>(() => Object.fromEntries(props.settingKeys.map((k) => [k, RECORD_SETTINGS.includes(k) ? recordToLines(integration.settings[k]) : String(integration.settings[k] ?? integration.publicConfig[k] ?? "")])));
  const [validation, setValidation] = useState<{ ok: boolean; status: string; detail: string } | null>(null);
  const [testResult, setTestResult] = useState<{ passed: boolean; note: string; delivery: { status: string; errorClass: string; message: string | null; preview: Record<string, unknown> | null } | null } | null>(null);
  const [lint, setLint] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [review, setReview] = useState<{ changes: Array<{ summary: string; op: string }>; recipients: unknown; approval: { id: string; expires_at: string } | null; version_to: number } | null>(null);
  const [published, setPublished] = useState<number | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [toggleState, toggleAction, toggling] = useActionState(toggleDestinationAction, { ok: false, error: null } as ActionState);
  const index = STEP_IDS.indexOf(step);

  const run = useCallback(
    async <T,>(tool: string, args: Record<string, unknown>, okText?: string): Promise<ToolResult<T>> => {
      setBusy(true);
      setMsg(null);
      const r = await callTool<T>(siteId, tool, args);
      setBusy(false);
      if (!r.ok) setMsg({ tone: "bad", text: r.message });
      else if (okText) setMsg({ tone: "ok", text: okText });
      return r;
    },
    [siteId],
  );

  const refreshStatus = useCallback(async () => {
    const r = await callTool<Record<string, unknown>>(siteId, "get_destination_status", { integration_id: integration.id });
    if (r.ok && r.data) setStatus(r.data);
  }, [siteId, integration.id]);

  useEffect(() => {
    if (step === "monitor") void refreshStatus();
  }, [step, refreshStatus, toggleState]);

  const missingIds = useMemo(() => connector.requiredPublicIds.filter((p) => !/\?\$$/.test(p.pattern) && !publicConfig[p.key]).map((p) => p.key), [connector.requiredPublicIds, publicConfig]);

  const go = (delta: number) => {
    const next = STEP_IDS[Math.min(STEP_IDS.length - 1, Math.max(0, index + delta))]!;
    setMsg(null);
    setStep(next);
  };

  const saveIds = async (form: FormData) => {
    for (const p of connector.requiredPublicIds) {
      const value = String(form.get(p.key) ?? "").trim();
      if (!value || value === publicConfig[p.key]) continue;
      const r = await run("save_public_pixel_id_draft", { integration_id: integration.id, key: p.key, value });
      if (!r.ok) return;
      setPublicConfig((c) => ({ ...c, [p.key]: value }));
    }
    setMsg({ tone: "ok", text: t("saved") });
  };

  const saveSettings = async () => {
    const payload: Record<string, unknown> = {};
    for (const k of props.settingKeys) payload[k] = RECORD_SETTINGS.includes(k) ? linesToRecord(settings[k] ?? "") : (settings[k] ?? "");
    for (const k of Object.keys(payload)) if (payload[k] === "" || (typeof payload[k] === "object" && !Object.keys(payload[k] as object).length)) delete payload[k];
    const r = await run("set_destination_settings_draft", { integration_id: integration.id, mode: null, test_mode: null, enabled: null, name: null, settings: Object.keys(payload).length ? payload : null }, t("saved"));
    return r.ok;
  };

  const saveMode = async () => {
    const r = await run("set_destination_settings_draft", { integration_id: integration.id, mode, test_mode: testMode, enabled: null, name: null, settings: null }, t("saved"));
    return r.ok;
  };

  const saveMappings = async () => {
    setBusy(true);
    for (const [event, m] of Object.entries(mappings)) {
      const before = props.draft?.mappings.find((x) => x.event === event);
      if (before && before.enabled === m.enabled && before.vendor_event === m.vendor) continue;
      if (!before && !m.enabled) continue;
      const r = await callTool(siteId, "upsert_event_mapping_draft", { integration_id: integration.id, event, vendor_event: m.vendor, enabled: m.enabled, enable_destination: true });
      if (!r.ok) {
        setBusy(false);
        setMsg({ tone: "bad", text: r.message });
        return false;
      }
    }
    setBusy(false);
    setMsg({ tone: "ok", text: t("saved") });
    return true;
  };

  const stepTitle = (s: StepId) => t(`steps.${s}`);
  const oauthCred = connector.requiredCredentials.find((c) => c.oauth);
  const health = (status?.integration as { health?: { status: string; detail: string | null } } | undefined)?.health ?? integration.health;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <ol className="flex flex-row flex-wrap gap-1 lg:flex-col" aria-label={t("title")}>
        {STEP_IDS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setStep(s)} aria-current={s === step ? "step" : undefined} className={`w-full rounded-lg px-2 py-1 text-left text-xs ${s === step ? "bg-primary-soft text-primary" : i < index ? "text-ok" : "text-ink-3 hover:bg-surface-2"}`}>
              {i + 1}. {stepTitle(s)}
            </button>
          </li>
        ))}
      </ol>
      <Card className="p-5">
        <p className="text-xs text-ink-3">{t("stepOf", { n: index + 1, total: STEP_IDS.length })}</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">{stepTitle(step)}</h2>
        {props.oauthNotice && step === "credentials" ? <Alert tone="info" className="mt-3">{props.oauthNotice}</Alert> : null}
        {msg ? <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert> : null}
        <div className="mt-4 space-y-4 text-sm text-ink-2">
          {step === "destination" ? (
            <>
              <p>{t("destinationText", { name: connector.displayName, version: connector.apiVersion, verified: connector.verifiedAt.slice(0, 10) })}</p>
              <p>{t("transfer", connector.transfer)}</p>
              <a className="text-primary underline-offset-2 hover:underline" href={connector.docsUrl} target="_blank" rel="noreferrer">
                {t("docs")}
              </a>
              <div className="flex gap-2">
                {connector.supportsBrowser ? <Badge tone="neutral">{td("browser")}</Badge> : null}
                {connector.supportsServer ? <Badge tone="neutral">{td("server")}</Badge> : null}
                {props.offline ? <Badge tone="neutral">{td("offline")}</Badge> : null}
              </div>
            </>
          ) : null}
          {step === "prerequisites" ? (
            <>
              <p>{t("prerequisitesText")}</p>
              <Alert tone={connector.accessNote ? "warn" : "info"}>{connector.accessNote ?? t("prerequisitesNone")}</Alert>
              <ul className="list-disc space-y-1 pl-5">
                {connector.requiredPublicIds.map((p) => (
                  <li key={p.key}>
                    <span className="font-medium text-ink">{p.label}</span> — {p.help}
                  </li>
                ))}
                {connector.requiredCredentials.map((c) => (
                  <li key={c.kind}>
                    <span className="font-medium text-ink">{c.label}</span> — {c.help}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {step === "mode" ? (
            <>
              <p>{t("modeText")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["hybrid", "browser", "server"] as const).map((m) => {
                  const allowed = m === "hybrid" ? connector.supportsBrowser && connector.supportsServer : m === "browser" ? connector.supportsBrowser : connector.supportsServer;
                  return (
                    <Button key={m} variant={mode === m ? "primary" : "secondary"} disabled={!allowed} onClick={() => setMode(m)}>
                      {t(m === "hybrid" ? "modeHybrid" : m === "browser" ? "modeBrowser" : "modeServer")}
                    </Button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} /> {t("testMode")}
              </label>
              <Button loading={busy} onClick={saveMode}>
                {t("save")}
              </Button>
            </>
          ) : null}
          {step === "ids" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveIds(new FormData(e.currentTarget));
              }}
            >
              <p>{t("idsText")}</p>
              {connector.requiredPublicIds.map((p) => (
                <div key={p.key}>
                  <Label htmlFor={`id-${p.key}`}>{p.label}</Label>
                  <Input id={`id-${p.key}`} name={p.key} defaultValue={String(publicConfig[p.key] ?? "")} placeholder={p.example} pattern={p.pattern} className="mt-1 font-mono" />
                  <p className="mt-1 text-xs text-ink-3">{p.help}</p>
                </div>
              ))}
              {missingIds.length ? <p className="text-xs text-warn">{t("idsMissing", { keys: missingIds.join(", ") })}</p> : null}
              <Button type="submit" loading={busy}>
                {t("save")}
              </Button>
            </form>
          ) : null}
          {step === "settings" ? (
            <>
              <p>{props.settingKeys.length ? t("settingsText") : t("settingsNone")}</p>
              {props.settingKeys.map((k) => (
                <div key={k}>
                  <Label htmlFor={`set-${k}`}>{k}</Label>
                  {RECORD_SETTINGS.includes(k) ? (
                    <>
                      <Textarea id={`set-${k}`} rows={4} value={settings[k] ?? ""} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} className="mt-1 font-mono" placeholder={"purchase=123456\ngenerate_lead=234567"} />
                      <p className="mt-1 text-xs text-ink-3">{t("settingsJsonHelp")}</p>
                    </>
                  ) : (
                    <Input id={`set-${k}`} value={settings[k] ?? ""} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} className="mt-1 font-mono" />
                  )}
                </div>
              ))}
              {props.settingKeys.length ? (
                <Button loading={busy} onClick={saveSettings}>
                  {t("save")}
                </Button>
              ) : null}
            </>
          ) : null}
          {step === "credentials" ? (
            <>
              <p>{connector.requiredCredentials.length ? t("credentialsText") : t("credentialsNone")}</p>
              {credentials.filter((c) => c.status === "active").length ? (
                <ul className="flex flex-wrap gap-2">
                  {credentials
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <li key={c.id}>
                        <Badge tone="ok">
                          {c.kind}: {t("stored", { last4: c.last4 ?? "····" })}
                        </Badge>
                      </li>
                    ))}
                </ul>
              ) : null}
              {oauthCred ? (
                <a href={`/app/oauth/${encodeURIComponent(oauthCred.oauth!)}/start?integration=${integration.id}&site=${siteId}`} className="inline-block">
                  <Button>{t("connect", { provider: oauthCred.oauth! })}</Button>
                </a>
              ) : null}
              {connector.requiredCredentials
                .filter((c) => !c.oauth || c.kind === "oauth_token_secret")
                .filter((c) => c.kind !== "oauth_token_secret")
                .map((c) => (
                  <SecureCredentialCard
                    key={c.kind}
                    siteId={siteId}
                    request={{ component: "secure_credential", integration_id: integration.id, connector_type: integration.type, credential_kind: c.kind, label: c.label, help: c.help, oauth_provider: null }}
                    onStored={(m) => {
                      setMsg({ tone: "ok", text: m });
                      setCredentials((list) => [...list.filter((x) => x.kind !== c.kind), { id: `new-${c.kind}`, kind: c.kind, label: c.label, last4: "····", status: "active" }]);
                    }}
                  />
                ))}
            </>
          ) : null}
          {step === "validate" ? (
            <>
              <p>{t("validateText")}</p>
              <Button
                loading={busy}
                onClick={async () => {
                  const r = await run<{ validation: { ok: boolean; status: string; detail: string }; health: { status: string } }>("validate_integration_credentials", { integration_id: integration.id });
                  if (r.ok && r.data) setValidation(r.data.validation);
                }}
              >
                {t("validate")}
              </Button>
              {validation ? <Alert tone={validation.ok ? "ok" : "bad"}>{validation.status}: {validation.detail}</Alert> : null}
            </>
          ) : null}
          {step === "consent" ? <Alert tone="info">{t("consentText", { purpose: props.purpose })}</Alert> : null}
          {step === "clickIds" ? <p>{props.clickIds.length ? t("clickIdsText", { params: props.clickIds.join(", ") }) : t("clickIdsNone")}</p> : null}
          {step === "mappings" ? (
            <>
              <p>{t("mappingsText")}</p>
              <div className="max-h-96 overflow-y-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-ink-3">
                    <tr>
                      <th className="px-3 py-2">{t("enabled")}</th>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">{t("vendorEvent")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.standardEvents.map((e) => (
                      <tr key={e} className="border-t border-line">
                        <td className="px-3 py-1.5">
                          <input type="checkbox" aria-label={`${e} ${t("enabled")}`} checked={mappings[e]?.enabled ?? false} onChange={(ev) => setMappings((m) => ({ ...m, [e]: { enabled: ev.target.checked, vendor: m[e]?.vendor ?? "" } }))} />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{e}</td>
                        <td className="px-3 py-1.5">
                          <Input aria-label={`${e} ${t("vendorEvent")}`} value={mappings[e]?.vendor ?? ""} placeholder={t("vendorDefault")} onChange={(ev) => setMappings((m) => ({ ...m, [e]: { enabled: m[e]?.enabled ?? false, vendor: ev.target.value } }))} className="h-8 font-mono text-xs" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button loading={busy} onClick={saveMappings}>
                {t("save")}
              </Button>
            </>
          ) : null}
          {step === "dedup" ? <p>{t("dedupText", { field: connector.dedupField ?? "event_id" })}</p> : null}
          {step === "snippet" ? (
            <>
              <p>{t("snippetText")}</p>
              <Button loading={busy} onClick={() => run("verify_snippet_installation", {}, t("done"))}>
                {t("checkSnippet")}
              </Button>
            </>
          ) : null}
          {step === "test" ? (
            <>
              <p>{t("testText")}</p>
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = String(new FormData(e.currentTarget).get("event") ?? "purchase");
                  const r = await run<{ passed: boolean; note: string; delivery: { status: string; errorClass: string; message: string | null; preview: Record<string, unknown> | null } | null }>("send_destination_test_event", { integration_id: integration.id, event_name: name });
                  if (r.ok && r.data) setTestResult(r.data);
                }}
              >
                <div className="flex-1">
                  <Label htmlFor="test-event">{t("testEvent")}</Label>
                  <Select id="test-event" name="event" className="mt-1" defaultValue="purchase">
                    {props.standardEvents.filter((e) => mappings[e]?.enabled).map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" loading={busy}>
                  {t("sendTest")}
                </Button>
              </form>
              {testResult ? (
                <div className="space-y-2">
                  <Alert tone={testResult.passed ? "ok" : "warn"}>
                    {testResult.passed ? t("testPassed") : t("testFailed")}: {testResult.note}
                  </Alert>
                  {testResult.delivery?.preview ? <pre className="max-h-64 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(testResult.delivery.preview, null, 2)}</pre> : null}
                </div>
              ) : null}
            </>
          ) : null}
          {step === "vendorCheck" ? <p>{t("vendorCheckText", { hint: props.testHint })}</p> : null}
          {step === "offline" ? (
            <>
              <p>{props.offline ? t("offlineText") : t("offlineUnsupported")}</p>
              {props.offline ? (
                <pre className="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{`curl -X POST https://api.track.site/v1/s \\
  -H "Authorization: Bearer tsk_..." -H "Content-Type: application/json" \\
  -d '{"events":[{"name":"purchase","ts":${Date.now()},"props":{"offline":true},"commerce":{"order_id":"CRM-1001","currency":"EUR","value":249.0},"user":{"email":"customer@example.com"},"consent":{"granted":["necessary","marketing"],"source":"crm"}}]}'`}</pre>
              ) : null}
            </>
          ) : null}
          {step === "quality" ? (
            <>
              <p>{t("qualityText")}</p>
              <Button
                loading={busy}
                onClick={async () => {
                  const r = await run<Record<string, unknown>>("validate_draft", {});
                  if (r.ok && r.data) {
                    const errors = ((r.data.errors ?? r.data.lint_errors ?? []) as Array<{ message?: string } | string>).map((x) => (typeof x === "string" ? x : (x.message ?? JSON.stringify(x))));
                    const warnings = ((r.data.warnings ?? r.data.lint_warnings ?? []) as Array<{ message?: string } | string>).map((x) => (typeof x === "string" ? x : (x.message ?? JSON.stringify(x))));
                    setLint({ errors, warnings });
                  }
                }}
              >
                {t("runLint")}
              </Button>
              {lint ? (
                <div className="space-y-1">
                  {lint.errors.length ? lint.errors.map((e, i) => <Alert key={i} tone="bad">{e}</Alert>) : <Alert tone="ok">{t("lintOk")}</Alert>}
                  {lint.warnings.map((w, i) => (
                    <Alert key={`w${i}`} tone="warn">
                      {w}
                    </Alert>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {step === "review" ? (
            <>
              <p>{t("reviewText")}</p>
              <Button
                loading={busy}
                onClick={async () => {
                  const r = await run<{ changes: Array<{ summary: string; op: string }>; recipients: unknown; approval: { id: string; expires_at: string } | null; version_to: number; lint_errors: Array<{ message: string }> }>("prepare_publish", {});
                  if (r.ok && r.data) {
                    setReview(r.data);
                    if (!r.data.approval) setMsg({ tone: "bad", text: r.data.lint_errors.map((e) => e.message).join("; ") });
                  }
                }}
              >
                {t("prepare")}
              </Button>
              {review ? (
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-3 text-xs">
                  {review.changes.map((c, i) => (
                    <li key={i}>
                      <span className="font-mono text-ink-3">{c.op}</span> {c.summary}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
          {step === "publish" ? (
            <>
              <p>{t("publishText")}</p>
              {published ? <Alert tone="ok">{t("published", { version: published })}</Alert> : null}
              {review?.approval && !published ? (
                <ApprovalCard
                  approval={{ approvalId: review.approval.id, action: "publish_config_version", summary: { changes: review.changes, recipients: review.recipients }, expiresAt: review.approval.expires_at } satisfies PendingApprovalView}
                  siteId={siteId}
                  onDone={(m, ok) => {
                    setMsg({ tone: ok ? "ok" : "bad", text: m });
                    if (ok) {
                      const v = /version (\d+)/.exec(m)?.[1];
                      setPublished(v ? Number(v) : review.version_to);
                      setReview(null);
                    }
                  }}
                />
              ) : !published ? (
                <Button variant="secondary" onClick={() => setStep("review")}>
                  {t("prepare")}
                </Button>
              ) : null}
            </>
          ) : null}
          {step === "monitor" ? (
            <>
              <p>{t("monitorText")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={health.status === "healthy" ? "ok" : health.status === "not_connected" ? "neutral" : "bad"}>{td(`health_${["healthy", "degraded", "unhealthy", "not_connected"].includes(health.status) ? health.status : "unknown"}`)}</Badge>
                <span className="text-xs text-ink-3">{health.detail}</span>
              </div>
              <form action={toggleAction} className="flex gap-2">
                <input type="hidden" name="siteId" value={siteId} />
                <input type="hidden" name="integrationId" value={integration.id} />
                <input type="hidden" name="action" value={(status?.integration as { status?: string } | undefined)?.status === "paused" || integration.status === "paused" ? "resume" : "pause"} />
                <Button type="submit" variant="secondary" loading={toggling}>
                  {(status?.integration as { status?: string } | undefined)?.status === "paused" || integration.status === "paused" ? t("resume") : t("pause")}
                </Button>
                <Button variant="ghost" onClick={() => void refreshStatus()}>
                  {t("run")}
                </Button>
              </form>
              {status ? (
                <>
                  <p className="text-xs text-ink-3">
                    {t("deliveries7d")}: {Object.entries((status.deliveries_7d as Record<string, number>) ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "0"} · {td("lastSuccess")}: {(status.last_success_at as string | null) ?? td("never")}
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-2 text-left text-ink-3">
                        <tr>
                          <th className="px-3 py-2">Event</th>
                          <th className="px-3 py-2">{td("status")}</th>
                          <th className="px-3 py-2">Error</th>
                          <th className="px-3 py-2">HTTP</th>
                          <th className="px-3 py-2">At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((status.recent_attempts as Array<{ id: string; event: string; status: string; errorClass: string; code: string | null; message: string | null; http: number | null; at: string }>) ?? []).map((a) => (
                          <tr key={a.id} className="border-t border-line">
                            <td className="px-3 py-1.5 font-mono">{a.event}</td>
                            <td className="px-3 py-1.5">
                              <Badge tone={a.status === "success" ? "ok" : a.status === "skipped" ? "neutral" : "bad"}>{a.status}</Badge>
                            </td>
                            <td className="px-3 py-1.5">{a.status === "success" ? "" : `${a.errorClass} ${a.code ?? ""} ${a.message ?? ""}`}</td>
                            <td className="px-3 py-1.5">{a.http ?? ""}</td>
                            <td className="px-3 py-1.5">{new Date(a.at).toLocaleString()}</td>
                          </tr>
                        ))}
                        {!((status.recent_attempts as unknown[]) ?? []).length ? (
                          <tr>
                            <td className="px-3 py-3 text-ink-3" colSpan={5}>
                              {t("noAttempts")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="mt-6 flex justify-between border-t border-line pt-4">
          <Button variant="ghost" disabled={index === 0} onClick={() => go(-1)}>
            {t("back")}
          </Button>
          <Button variant={index === STEP_IDS.length - 1 ? "secondary" : "primary"} disabled={index === STEP_IDS.length - 1} onClick={() => go(1)}>
            {t("next")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
