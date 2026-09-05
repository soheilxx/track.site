"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { UiEvent, UiInputComponent } from "@track-site/ai";
import { Alert, Button, Card, Input, Label, LinkButton } from "@track-site/ui";
import { approvalChanges, approvalRecipients, type CredentialRequestView, type PendingApprovalView } from "./types";
import { parseUiEvent } from "./ui-events";

type Translate = ReturnType<typeof useTranslations<"assistant">>;

/**
 * Outcome of the approval card, handed to the host together with the localized outcome sentence.
 * `executed` / `failed` describe the server's answer (backend verification included); `cancelled`
 * is the user's own click — nothing was sent and nothing changed. The sentence is a note or alert
 * of the host, never text sent as the user's words.
 */
export interface ApprovalOutcome {
  kind: "executed" | "failed" | "cancelled";
  ok: boolean;
  /** the published version of a publish action, when the server returned one */
  version: number | null;
  /** backend verification of the executed action; `null` = not applicable or not executed */
  verified: boolean | null;
}

/** Outcome of the secure credential card: only the masked vault reference and the integration status, never the value. */
export interface CredentialOutcome {
  masked: string;
  status: string;
}

export function InputComponentView({ component, onSend, siteId, onCredentialStored }: { component: UiInputComponent; onSend: (text: string) => void; siteId: string; onCredentialStored: (message: string, outcome: CredentialOutcome) => void }) {
  const t = useTranslations("assistant");
  switch (component.type) {
    case "none":
    case "confirm":
      return null;
    case "text":
    case "url":
    case "pixel_id":
      return <TextInput component={component} onSend={onSend} />;
    case "yes_no":
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSend(`${component.label}: yes`)}>
            {t("input.yes")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onSend(`${component.label}: no`)}>
            {t("input.no")}
          </Button>
        </div>
      );
    case "secure_credential":
      return <SecureCredentialCard request={{ component: "secure_credential", integration_id: component.integration_id, connector_type: "", credential_kind: component.credential_kind, label: component.label, help: "", oauth_provider: null }} siteId={siteId} onStored={onCredentialStored} />;
    case "oauth":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{component.label}</p>
          {/* button-styled link: interactive elements are never nested */}
          <LinkButton size="sm" href={`/app/oauth/${encodeURIComponent(component.provider)}/start?integration=${encodeURIComponent(component.integration_id)}&site=${encodeURIComponent(siteId)}`} className="mt-3">
            {t("input.connectWith", { provider: component.provider })}
          </LinkButton>
        </Card>
      );
    default:
      return null;
  }
}

/** A missing or malformed pattern means "no format check here"; the server validates the id anyway. */
function safeRegExp(pattern: string | null): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function TextInput({ component, onSend }: { component: Extract<UiInputComponent, { type: "text" | "url" | "pixel_id" }>; onSend: (text: string) => void }) {
  const t = useTranslations("assistant");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const regex = safeRegExp(component.type === "pixel_id" || component.type === "text" ? component.pattern : null);
  const example = component.type === "pixel_id" ? component.example : null;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        if (regex && !regex.test(v)) {
          setError(example ? t("input.expectedFormat", { example }) : t("input.invalidFormat"));
          return;
        }
        // secrets never travel as chat text; the server refuses them too, this only saves the round trip
        if (/\b(EAA[A-Za-z0-9]{40,}|sk_(live|test)_|whsec_|AKIA|sk-proj-|xox[abpr]-|ghp_)/.test(v)) {
          setError(t("input.secretDetected"));
          return;
        }
        setError(null);
        onSend(`${component.label}: ${v}`);
        setValue("");
      }}
    >
      <div className="flex-1">
        <Label htmlFor={`inp-${component.field}`}>{component.label}</Label>
        <Input id={`inp-${component.field}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={"placeholder" in component ? (component.placeholder ?? undefined) : (example ?? undefined)} inputMode={component.type === "url" ? "url" : "text"} className="mt-1" aria-invalid={Boolean(error)} aria-describedby={error ? `err-${component.field}` : undefined} />
        {"help" in component && component.help ? <p className="mt-1 text-xs text-ink-3">{component.help}</p> : null}
        {error ? (
          <p id={`err-${component.field}`} role="alert" className="mt-1 text-xs text-bad">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="sm">
        {t("input.send")}
      </Button>
    </form>
  );
}

export function SecureCredentialCard({ request, siteId, onStored }: { request: CredentialRequestView; siteId: string; /** localized "stored" sentence + masked reference/status; the host shows it as a note or alert, it is never sent as a user message */ onStored: (message: string, outcome: CredentialOutcome) => void }) {
  const t = useTranslations("assistant");
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    // focusable entry point (`credential-card`): the activity feed, the composer chip and the workspace moves reveal it
    <Card className="border-primary/40 p-4 outline-none data-[revealed]:ring-2 data-[revealed]:ring-primary data-[revealed]:ring-offset-2 data-[revealed]:ring-offset-surface" data-focus-target="credential-card" data-testid="credential-card" tabIndex={-1}>
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Lock className="h-4 w-4 text-primary" aria-hidden="true" /> {request.label}
      </p>
      <p className="mt-1 text-xs text-ink-3">{request.help || t("credential.help")}</p>
      {result ? (
        <Alert tone={result.ok ? "ok" : "bad"} className="mt-3">
          {result.message}
        </Alert>
      ) : null}
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (value.length < 8) return;
          setPending(true);
          const res = await fetch("/api/ai/credential", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, integrationId: request.integration_id, kind: request.credential_kind, value }) });
          const body = (await res.json()) as { ok: boolean; message?: string; credential?: { masked: string }; validation?: { status: string; detail: string } | null; status?: string };
          setPending(false);
          setValue("");
          if (body.ok) {
            const validation = body.validation ? `${body.validation.status}${body.validation.detail ? ` – ${body.validation.detail}` : ""}` : t("credential.notChecked");
            const masked = body.credential?.masked ?? "";
            const status = body.status ?? "";
            const message = t("credential.stored", { masked, validation, status });
            setResult({ ok: true, message });
            onStored(message, { masked, status });
          } else setResult({ ok: false, message: body.message ?? t("credential.storeFailed") });
        }}
      >
        <div className="flex-1">
          <Label htmlFor="secure-credential">{request.credential_kind.replace(/_/g, " ")}</Label>
          <div className="mt-1 flex gap-2">
            <Input id="secure-credential" type={show ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />
            <Button type="button" variant="ghost" size="icon" aria-label={show ? t("credential.hide") : t("credential.show")} onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={value.length < 8}>
          {t("credential.store")}
        </Button>
      </form>
    </Card>
  );
}

/** The localized outcome sentence (`assistant.approval.result.*`); a failure names the server's reason code, the redacted text is only the fallback. */
function outcomeText(t: Translate, action: string, outcome: ApprovalOutcome, reason: string | null): string {
  switch (outcome.kind) {
    case "cancelled":
      return t("approval.result.cancelled");
    case "failed":
      return t("approval.result.failed", { action, reason: reason ?? t("reason.UNKNOWN") });
    case "executed":
      if (outcome.version !== null && outcome.verified !== null) return t(outcome.verified ? "approval.result.published" : "approval.result.publishedUnverified", { version: outcome.version });
      return t("approval.result.executed", { action });
  }
}

/**
 * The exact diff card with the action-bound confirmation button. Only this click (the approval id
 * references a server-side token) executes the action; the chat text never does. After execution
 * the server verifies the backend state and returns it together with the activity events; the
 * host receives the localized outcome sentence and the structured outcome — nothing is ever sent
 * back to the assistant as the user's words.
 */
export function ApprovalCard({ approval, siteId, onDone, onEvents }: { approval: PendingApprovalView; siteId: string; onDone: (message: string, ok: boolean, outcome: ApprovalOutcome) => void; onEvents?: (events: UiEvent[]) => void }) {
  const t = useTranslations("assistant");
  const [pending, setPending] = useState(false);
  const changes = approvalChanges(approval.summary.changes);
  const recipients = approvalRecipients(approval.summary.recipients);
  const actionLabel = t.has(`approval.action.${approval.action}`) ? t(`approval.action.${approval.action}`) : approval.action.replace(/_/g, " ");
  const done = (outcome: ApprovalOutcome, reason: string | null = null) => onDone(outcomeText(t, actionLabel, outcome, reason), outcome.ok, outcome);
  return (
    // focusable (`approval-card`): the exact diff is revealed and focused when the approval arrives or a next action points here
    <Card className="border-primary p-4 outline-none data-[revealed]:ring-2 data-[revealed]:ring-primary data-[revealed]:ring-offset-2 data-[revealed]:ring-offset-surface" data-testid="approval-card" data-focus-target="approval-card" data-action={approval.action} tabIndex={-1}>
      <p className="text-sm font-semibold text-ink">{t("approval.title", { action: actionLabel })}</p>
      {changes.length ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-ink-2">
          {changes.slice(0, 30).map((c, i) => (
            <li key={i}>
              <span className="font-mono text-xs text-ink-3">{c.op}</span> {c.summary}
            </li>
          ))}
        </ul>
      ) : null}
      {recipients.length ? <p className="mt-2 text-xs text-ink-3">{t("approval.recipients", { list: recipients.map((r) => (r.purpose ? `${r.name} (${r.purpose})` : r.name)).join(", ") })}</p> : null}
      <p className="mt-2 text-xs text-ink-3">{t("approval.validUntil", { time: new Date(approval.expiresAt).toLocaleTimeString() })}</p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const res = await fetch("/api/ai/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, approvalId: approval.approvalId }) });
            const body = (await res.json()) as { ok: boolean; code?: string; message?: string; data?: { version?: number }; verified?: boolean | null; events?: unknown[] };
            setPending(false);
            onEvents?.((body.events ?? []).map(parseUiEvent).filter((e): e is UiEvent => e !== null));
            if (body.ok) done({ kind: "executed", ok: true, version: typeof body.data?.version === "number" ? body.data.version : null, verified: body.verified ?? null });
            else done({ kind: "failed", ok: false, version: null, verified: null }, body.code && t.has(`reason.${body.code}`) ? t(`reason.${body.code}`) : body.message || null);
          }}
        >
          {approval.action === "publish_config_version" ? t("approval.confirm") : t("approval.confirmGeneric")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => done({ kind: "cancelled", ok: false, version: null, verified: null })}>
          {t("approval.cancel")}
        </Button>
      </div>
    </Card>
  );
}
