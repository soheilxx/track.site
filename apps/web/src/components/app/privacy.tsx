"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, Badge, Button, Input, Label, Select, Textarea } from "@track-site/ui";
import type { ActionState } from "@/server/actions/organization";
import { createDsarAction, processDsarAction, saveRetentionAction } from "@/server/actions/privacy";

const initial: ActionState = { ok: false, error: null };

export function RetentionForm({ kinds, values }: { kinds: Array<{ kind: string; defaultDays: number }>; values: Record<string, number> }) {
  const t = useTranslations("app.privacy");
  const [state, action, pending] = useActionState(saveRetentionAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.ok ? <Alert tone="ok">{t("saved")}</Alert> : null}
      {state.error ? <Alert tone="bad">{t("errors.generic")}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {kinds.map((k) => (
          <div key={k.kind}>
            <Label htmlFor={`ret-${k.kind}`}>{k.kind}</Label>
            <Input id={`ret-${k.kind}`} name={`days_${k.kind}`} type="number" min={1} max={3650} defaultValue={values[k.kind] ?? k.defaultDays} className="mt-1" />
          </div>
        ))}
      </div>
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}

export function DsarForm() {
  const t = useTranslations("app.privacy");
  const [state, action, pending] = useActionState(createDsarAction, initial);
  return (
    <form action={action} className="space-y-3">
      {state.ok ? <Alert tone="ok">{t("saved")}</Alert> : null}
      {state.fieldErrors?.email ? <Alert tone="bad">{t("errors.email")}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="dsar-kind">{t("kindLabel")}</Label>
          <Select id="dsar-kind" name="kind" className="mt-1" defaultValue="export">
            {["export", "delete", "restrict", "rectify", "object", "portability"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="dsar-email">{t("email")}</Label>
          <Input id="dsar-email" name="email" type="email" required className="mt-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="dsar-note">{t("note")}</Label>
        <Textarea id="dsar-note" name="note" rows={2} maxLength={500} className="mt-1" />
      </div>
      <Button type="submit" loading={pending}>
        {t("create")}
      </Button>
    </form>
  );
}

export function DsarRow({ request }: { request: { id: string; kind: string; status: string; requestedAt: string; dueAt: string; hasReport: boolean; note: string | null } }) {
  const t = useTranslations("app.privacy");
  const [state, action, pending] = useActionState(processDsarAction, initial);
  const tone = request.status === "completed" ? "ok" : request.status === "rejected" ? "neutral" : request.status === "in_progress" ? "warn" : "neutral";
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-ink">
          <span className="font-medium">{request.kind}</span> <Badge tone={tone}>{t(`status_${request.status}`)}</Badge>
        </p>
        <p className="text-xs text-ink-3">
          {new Date(request.requestedAt).toLocaleDateString()} · {t("due", { date: new Date(request.dueAt).toLocaleDateString() })}
          {request.note ? ` · ${request.note}` : ""}
        </p>
        {state.error ? <p className="text-xs text-bad">{t("errors.generic")}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {request.status === "received" ? (
          <>
            <form action={action}>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="decision" value="process" />
              <Button type="submit" size="sm" loading={pending}>
                {t("process")}
              </Button>
            </form>
            <form action={action}>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="decision" value="reject" />
              <Button type="submit" size="sm" variant="ghost" loading={pending}>
                {t("reject")}
              </Button>
            </form>
          </>
        ) : null}
        {request.hasReport ? (
          <a href={`/api/privacy/dsar/${request.id}`} className="text-sm font-medium text-primary hover:underline">
            {t("download")}
          </a>
        ) : null}
      </div>
    </li>
  );
}
