"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import type { UiInputComponent } from "@track-site/ai";
import { Alert, Button, Card, Input, Label } from "@track-site/ui";
import type { CredentialRequestView, PendingApprovalView } from "./types";

export function InputComponentView({ component, onSend, siteId, onCredentialStored }: { component: UiInputComponent; onSend: (text: string) => void; siteId: string; onCredentialStored: (msg: string) => void }) {
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
            Yes
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onSend(`${component.label}: no`)}>
            No
          </Button>
        </div>
      );
    case "secure_credential":
      return <SecureCredentialCard request={{ component: "secure_credential", integration_id: component.integration_id, connector_type: "", credential_kind: component.credential_kind, label: component.label, help: "", oauth_provider: null }} siteId={siteId} onStored={onCredentialStored} />;
    case "oauth":
      return (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">{component.label}</p>
          <a href={`/app/oauth/${encodeURIComponent(component.provider)}/start?integration=${encodeURIComponent(component.integration_id)}&site=${encodeURIComponent(siteId)}`} className="mt-3 inline-block">
            <Button size="sm">Connect with {component.provider}</Button>
          </a>
        </Card>
      );
    default:
      return null;
  }
}

function TextInput({ component, onSend }: { component: Extract<UiInputComponent, { type: "text" | "url" | "pixel_id" }>; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pattern = component.type === "pixel_id" ? component.pattern : component.type === "text" ? component.pattern : null;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        if (pattern && !new RegExp(pattern).test(v)) {
          setError(component.type === "pixel_id" ? `Expected format like ${component.example}` : "Invalid format");
          return;
        }
        if (/\b(EAA[A-Za-z0-9]{40,}|sk_(live|test)_|whsec_|AKIA)/.test(v)) {
          setError("This looks like a secret. Secrets are only accepted through the secure credential card.");
          return;
        }
        setError(null);
        onSend(`${component.label}: ${v}`);
        setValue("");
      }}
    >
      <div className="flex-1">
        <Label htmlFor={`inp-${component.field}`}>{component.label}</Label>
        <Input id={`inp-${component.field}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={"placeholder" in component ? (component.placeholder ?? undefined) : undefined} inputMode={component.type === "url" ? "url" : "text"} className="mt-1" aria-invalid={Boolean(error)} aria-describedby={error ? `err-${component.field}` : undefined} />
        {"help" in component && component.help ? <p className="mt-1 text-xs text-ink-3">{component.help}</p> : null}
        {error ? (
          <p id={`err-${component.field}`} role="alert" className="mt-1 text-xs text-bad">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="sm">
        Send
      </Button>
    </form>
  );
}

export function SecureCredentialCard({ request, siteId, onStored }: { request: CredentialRequestView; siteId: string; onStored: (message: string) => void }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <Card className="border-primary/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Lock className="h-4 w-4 text-primary" aria-hidden="true" /> {request.label}
      </p>
      <p className="mt-1 text-xs text-ink-3">{request.help || "Stored encrypted in the vault. Never shared with the assistant, never shown again."}</p>
      {result ? <Alert tone={result.ok ? "ok" : "bad"} className="mt-3">{result.message}</Alert> : null}
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
            const msg = `Credential stored (${body.credential?.masked}). Validation: ${body.validation?.status ?? "not checked"}${body.validation?.detail ? ` – ${body.validation.detail}` : ""}. Status: ${body.status}.`;
            setResult({ ok: true, message: msg });
            onStored(`[credential stored securely for integration ${request.integration_id}; status ${body.status}]`);
          } else setResult({ ok: false, message: body.message ?? "Could not store the credential." });
        }}
      >
        <div className="flex-1">
          <Label htmlFor="secure-credential">{request.credential_kind.replace(/_/g, " ")}</Label>
          <div className="mt-1 flex gap-2">
            <Input id="secure-credential" type={show ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />
            <Button type="button" variant="ghost" size="icon" aria-label={show ? "Hide" : "Show"} onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={value.length < 8}>
          Store securely
        </Button>
      </form>
    </Card>
  );
}

export function ApprovalCard({ approval, siteId, onDone }: { approval: PendingApprovalView; siteId: string; onDone: (message: string, ok: boolean) => void }) {
  const [pending, setPending] = useState(false);
  const changes = Array.isArray(approval.summary.changes) ? (approval.summary.changes as Array<{ summary: string; op: string }>) : [];
  const recipients = Array.isArray(approval.summary.recipients) ? (approval.summary.recipients as Array<{ name: string; type: string; purpose: string; events: string[] }>) : [];
  return (
    <Card className="border-primary p-4">
      <p className="text-sm font-semibold text-ink">Confirm: {approval.action.replace(/_/g, " ")}</p>
      {changes.length ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-ink-2">
          {changes.slice(0, 30).map((c, i) => (
            <li key={i}>
              <span className="font-mono text-xs text-ink-3">{c.op}</span> {c.summary}
            </li>
          ))}
        </ul>
      ) : null}
      {recipients.length ? (
        <p className="mt-2 text-xs text-ink-3">
          Recipients: {recipients.map((r) => `${r.name} (${r.purpose})`).join(", ")}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-ink-3">Valid until {new Date(approval.expiresAt).toLocaleTimeString()}. Nothing is published before you click.</p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const res = await fetch("/api/ai/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId, approvalId: approval.approvalId }) });
            const body = (await res.json()) as { ok: boolean; message?: string; data?: { version?: number } };
            setPending(false);
            onDone(body.ok ? `[confirmed ${approval.action}: version ${body.data?.version ?? "?"} published]` : `[${approval.action} failed: ${body.message ?? "error"}]`, body.ok);
          }}
        >
          Confirm and publish
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onDone("[publish cancelled by user]", false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
