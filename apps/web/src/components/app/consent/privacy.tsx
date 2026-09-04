"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, Badge, Button, Input, Label, Select, Textarea } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import type { ActionState } from "@/server/actions/organization";
import { createDsarAction, processDsarAction, saveRetentionAction } from "@/server/actions/privacy";
import type { DsarView } from "@/server/consent";

/** Retention windows and data subject requests (behaviour unchanged; strings live in the `consent` namespace). */
const initial: ActionState = { ok: false, error: null };

export function RetentionForm({ kinds, values }: { kinds: Array<{ kind: string; defaultDays: number }>; values: Record<string, number> }) {
  const t = useTranslations("consent.retention");
  const te = useTranslations("consent.errors");
  const [state, action, pending] = useActionState(saveRetentionAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.ok ? <Alert tone="ok">{t("saved")}</Alert> : null}
      {state.error ? <Alert tone="bad">{te("generic")}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {kinds.map((k) => (
          <div key={k.kind}>
            <Label htmlFor={`ret-${k.kind}`}>
              <span className="font-mono text-xs">{k.kind}</span>
            </Label>
            <Input id={`ret-${k.kind}`} name={`days_${k.kind}`} type="number" inputMode="numeric" min={1} max={3650} defaultValue={values[k.kind] ?? k.defaultDays} className="mt-1" aria-describedby={`ret-${k.kind}-hint`} />
            <p id={`ret-${k.kind}-hint`} className="mt-1 text-xs text-ink-3">
              {t("days")}
            </p>
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
  const t = useTranslations("consent.dsar");
  const te = useTranslations("consent.errors");
  const [state, action, pending] = useActionState(createDsarAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.ok ? <Alert tone="ok">{t("created")}</Alert> : null}
      {state.fieldErrors?.email ? <Alert tone="bad">{te("email")}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
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
          <Input id="dsar-email" name="email" type="email" autoComplete="off" required className="mt-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="dsar-note">{t("note")}</Label>
        <Textarea id="dsar-note" name="note" rows={2} maxLength={500} className="mt-1 min-h-20" />
      </div>
      <Button type="submit" loading={pending}>
        {t("create")}
      </Button>
    </form>
  );
}

export function DsarRow({ request }: { request: DsarView }) {
  const t = useTranslations("consent.dsar");
  const te = useTranslations("consent.errors");
  const locale = useLocale();
  const [state, action, pending] = useActionState(processDsarAction, initial);
  const tone = request.status === "completed" ? "ok" : request.status === "in_progress" ? "warn" : "neutral";
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          <span className="font-medium">{request.kind}</span> <Badge tone={tone}>{t(`status_${request.status}`)}</Badge>
        </p>
        <p className="text-xs text-ink-3">
          {formatDate(request.requestedAt, locale, "short")} · {t("due", { date: formatDate(request.dueAt, locale, "short") })}
          {request.note ? ` · ${request.note}` : ""}
        </p>
        {state.error ? (
          <p className="text-xs text-bad" role="alert">
            {te("generic")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
          <a href={`/api/privacy/dsar/${request.id}`} className="inline-flex min-h-9 items-center text-sm font-medium text-primary hover:underline pointer-coarse:min-h-11">
            {t("download")}
          </a>
        ) : null}
      </div>
    </li>
  );
}
