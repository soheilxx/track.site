"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Label, Select } from "@track-site/ui";
import { useAssistant } from "./assistant-store";
import { ApprovalCard, SecureCredentialCard } from "./inputs";
import type { CredentialRequestView, PendingApprovalView } from "./types";

type ToolResult<T = Record<string, unknown>> = { ok: boolean; code: string; message: string; data: T | null };

async function callTool<T = Record<string, unknown>>(siteId: string, tool: string, args: Record<string, unknown> = {}): Promise<ToolResult<T>> {
  const res = await fetch("/api/ai/wizard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, tool, args }) });
  return (await res.json()) as ToolResult<T>;
}

interface SetupStateView {
  current_step: string;
  progress_percent: number;
  completed_steps: string[];
  missing_fields: string[];
  context: { businessType: string | null; platform: string | null; cmp: string | null; domain: string | null };
}

const CONNECTORS = ["meta", "google_ads", "ga4", "tiktok", "microsoft", "linkedin", "reddit", "pinterest", "snapchat", "x", "taboola", "outbrain", "amazon", "spotify", "quora", "yahoo", "tradedesk", "gmp", "adroll", "criteo", "affiliate", "webhook"];

/**
 * Rule-based wizard: the same typed tools, driven by forms instead of the model. It is the
 * fallback when the AI provider is unavailable and the transparent expert path.
 */
export function WizardPanel({ siteId, aiEnabled, refreshToken = 0 }: { siteId: string; locale: string; aiEnabled: boolean; /** bump to re-read the setup state (e.g. after an assistant activity completed) */ refreshToken?: number }) {
  const t = useTranslations("chat.wizard");
  const { applyEvents } = useAssistant();
  const [state, setState] = useState<SetupStateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad" | "info" | "warn"; text: string } | null>(null);
  const [approval, setApproval] = useState<PendingApprovalView | null>(null);
  const [credential, setCredential] = useState<CredentialRequestView | null>(null);
  const [lastIntegration, setLastIntegration] = useState<{ id: string; type: string; ids: Array<{ key: string; label: string; example: string; pattern: string }> } | null>(null);

  const refresh = useCallback(async () => {
    const r = await callTool<SetupStateView>(siteId, "get_setup_state");
    if (r.ok && r.data) setState(r.data);
  }, [siteId]);

  useEffect(() => {
    void callTool<SetupStateView>(siteId, "get_setup_state").then((r) => {
      if (r.ok && r.data) setState(r.data);
    });
  }, [siteId, refreshToken]);

  const run = async (tool: string, args: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMessage(null);
    const r = await callTool(siteId, tool, args);
    setBusy(false);
    setMessage(r.ok ? { tone: "ok", text: okText } : { tone: "bad", text: r.message });
    await refresh();
    return r;
  };

  if (!state) return <p className="p-4 text-sm text-ink-3">{t("loading")}</p>;
  const step = state.current_step;
  return (
    <div className="space-y-4 p-4">
      {!aiEnabled ? <Alert tone="info">{t("aiUnavailable")}</Alert> : null}
      <ol className="flex flex-wrap gap-1 text-xs" aria-label={t("steps")}>
        {["business_type", "platform", "installation", "consent", "destinations", "event_plan", "test", "review", "publish"].map((s) => (
          <li key={s} className={`rounded-full px-2 py-0.5 ${state.completed_steps.includes(s) ? "bg-ok-soft text-ok" : s === step ? "bg-primary-soft text-primary" : "bg-surface-2 text-ink-3"}`}>
            {s}
          </li>
        ))}
      </ol>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {step === "business_type" ? (
        <StepCard title={t("businessTitle")} text={t("businessText")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["ecommerce", "lead_generation", "saas", "content", "other"] as const).map((b) => (
              <Button key={b} variant="secondary" disabled={busy} onClick={() => run("set_business_profile_draft", { business_type: b, platform: null, markets: null, currency: null, confidence: 1, evidence: "wizard" }, t("saved"))}>
                {t(`business.${b}`)}
              </Button>
            ))}
          </div>
        </StepCard>
      ) : null}

      {step === "platform" ? (
        <StepCard title={t("platformTitle")} text={t("platformText")} focusTarget="setup-site">
          <Button variant="secondary" size="sm" disabled={busy} onClick={async () => {
            const r = await callTool<{ platform: string; platform_confidence: number; cmp_detected: string }>(siteId, "detect_site_stack");
            setMessage(r.ok && r.data ? { tone: "info", text: t("detected", { platform: r.data.platform, confidence: Math.round(r.data.platform_confidence * 100), cmp: r.data.cmp_detected }) } : { tone: "bad", text: r.message });
          }}>
            {t("detect")}
          </Button>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(["shopify", "woocommerce", "shopware", "wordpress", "headless", "custom"] as const).map((p) => (
              <Button key={p} variant="secondary" disabled={busy} onClick={() => run("set_business_profile_draft", { business_type: null, platform: p, markets: null, currency: null, confidence: 1, evidence: "wizard" }, t("saved"))}>
                {p}
              </Button>
            ))}
          </div>
        </StepCard>
      ) : null}

      {step === "installation" ? (
        <StepCard title={t("installTitle")} text={t("installText")} focusTarget="setup-site">
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run("verify_snippet_installation", {}, t("checked"))}>
              {t("checkInstall")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => run("verify_domain", { method: "dns_txt" }, t("checked"))}>
              {t("verifyDns")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => run("skip_setup_step", { step: "installation", reason: "wizard skip" }, t("skipped"))}>
              {t("skip")}
            </Button>
          </div>
        </StepCard>
      ) : null}

      {step === "consent" ? (
        <StepCard title={t("consentTitle")} text={t("consentText")}>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void run("set_consent_policy_draft", { cmp_provider: String(fd.get("cmp")), consent_mode: "basic", legal_review_note: null, markets: null }, t("saved"));
            }}
          >
            <div className="flex-1">
              <Label htmlFor="cmp">{t("cmp")}</Label>
              <Select id="cmp" name="cmp" className="mt-1" defaultValue="api">
                {["api", "usercentrics", "cookiebot", "onetrust", "tcf", "gpp", "none"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" loading={busy}>
              {t("save")}
            </Button>
          </form>
        </StepCard>
      ) : null}

      {step === "destinations" ? (
        <StepCard title={t("destTitle")} text={t("destText")} focusTarget="setup-destinations">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const r = await callTool<{ integration_id: string; connector_type: string; required_public_ids: Array<{ key: string; label: string; example: string; pattern: string }>; required_credentials: Array<{ kind: string; label: string; oauth: string | null }> }>(siteId, "create_integration_draft", { connector_type: String(fd.get("type")), name: null, mode: null });
              if (r.ok && r.data) {
                setLastIntegration({ id: r.data.integration_id, type: r.data.connector_type, ids: r.data.required_public_ids });
                const cred = r.data.required_credentials[0];
                if (cred) setCredential({ component: cred.oauth ? "oauth" : "secure_credential", integration_id: r.data.integration_id, connector_type: r.data.connector_type, credential_kind: cred.kind, label: cred.label, help: "", oauth_provider: cred.oauth });
                setMessage({ tone: "ok", text: t("destCreated") });
              } else setMessage({ tone: "bad", text: r.message });
              await refresh();
            }}
          >
            <div className="flex-1">
              <Label htmlFor="type">{t("connector")}</Label>
              <Select id="type" name="type" className="mt-1" defaultValue="ga4">
                {CONNECTORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" loading={busy}>
              {t("addDestination")}
            </Button>
          </form>
          {lastIntegration?.ids.map((idReq) => (
            <form
              key={idReq.key}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void run("save_public_pixel_id_draft", { integration_id: lastIntegration.id, key: idReq.key, value: String(fd.get("value")) }, t("saved"));
              }}
            >
              <div className="flex-1">
                <Label htmlFor={`pid-${idReq.key}`}>{idReq.label}</Label>
                <Input id={`pid-${idReq.key}`} name="value" placeholder={idReq.example} className="mt-1" required />
              </div>
              <Button type="submit" size="sm" loading={busy}>
                {t("save")}
              </Button>
            </form>
          ))}
          {credential ? <div className="mt-3"><SecureCredentialCard request={credential} siteId={siteId} onStored={() => { setCredential(null); setMessage({ tone: "ok", text: t("credentialStored") }); void refresh(); }} /></div> : null}
          {lastIntegration ? (
            <Button className="mt-3" variant="secondary" size="sm" disabled={busy} onClick={() => run("upsert_event_mapping_draft", { integration_id: lastIntegration.id, event: "page_view", vendor_event: "page_view", enabled: true, enable_destination: true }, t("saved"))}>
              {t("enableDefaultMapping")}
            </Button>
          ) : null}
          <Button className="mt-3 ml-2" variant="ghost" size="sm" disabled={busy} onClick={() => run("set_setup_step", { step: "event_plan" }, t("saved"))}>
            {t("next")}
          </Button>
        </StepCard>
      ) : null}

      {step === "event_plan" ? (
        <StepCard title={t("planTitle")} text={t("planText")}>
          <Button disabled={busy} onClick={() => run("propose_event_plan", { business_type: state.context.businessType ?? "other", include_events: null, authoritative_purchase_source: null }, t("saved"))}>
            {t("proposePlan")}
          </Button>
        </StepCard>
      ) : null}

      {step === "test" ? (
        <StepCard title={t("testTitle")} text={t("testText")}>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run("run_test_event", { event_name: "page_view", with_consent: true }, t("tested"))}>
              {t("runTest")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => run("run_diagnostics", {}, t("checked"))}>
              {t("diagnostics")}
            </Button>
          </div>
        </StepCard>
      ) : null}

      {step === "review" || step === "publish" ? (
        <StepCard title={t("publishTitle")} text={t("publishText")} focusTarget="setup-review">
          {approval ? (
            <ApprovalCard approval={approval} siteId={siteId} onEvents={applyEvents} onDone={(msg, ok, outcome) => { setApproval(null); setMessage({ tone: outcome.kind === "cancelled" ? "info" : !ok ? "bad" : outcome.verified === false ? "warn" : "ok", text: msg }); void refresh(); }} />
          ) : (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await callTool<{ lint_ok: boolean; lint_errors: Array<{ message: string }>; approval: { id: string; expires_at: string } | null; changes: unknown; recipients: unknown }>(siteId, "prepare_publish");
                setBusy(false);
                if (!r.ok || !r.data) return setMessage({ tone: "bad", text: r.message });
                if (!r.data.lint_ok || !r.data.approval) return setMessage({ tone: "bad", text: `${t("lintFailed")}: ${r.data.lint_errors.map((e) => e.message).join("; ")}` });
                setApproval({ approvalId: r.data.approval.id, action: "publish_config_version", summary: { changes: r.data.changes, recipients: r.data.recipients }, expiresAt: r.data.approval.expires_at });
              }}
            >
              {t("preparePublish")}
            </Button>
          )}
        </StepCard>
      ) : null}

      {step === "health" ? (
        <StepCard title={t("healthTitle")} text={t("healthText")}>
          <Button variant="secondary" disabled={busy} onClick={() => run("run_diagnostics", {}, t("checked"))}>
            {t("diagnostics")}
          </Button>
        </StepCard>
      ) : null}
    </div>
  );
}

/** `focusTarget` makes the step reachable by the workspace moves (`data-focus-target`, focusable, ring while revealed). */
function StepCard({ title, text, focusTarget, children }: { title: string; text: string; focusTarget?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 outline-none data-[revealed]:ring-2 data-[revealed]:ring-primary data-[revealed]:ring-offset-2 data-[revealed]:ring-offset-surface" data-focus-target={focusTarget} tabIndex={focusTarget ? -1 : undefined}>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-3">{text}</p>
      <div className="mt-3">{children}</div>
    </Card>
  );
}
