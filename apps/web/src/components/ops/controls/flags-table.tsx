"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, EmptyState, Field, Input, Status, TBody, THead, Table, Td, Textarea, Th, Tr, buttonVariants } from "@track-site/ui";
import { formatNumber } from "@/lib/format";
import { createFeatureFlagAction, registerFeatureFlagAction, type ControlsActionState } from "@/server/ops/actions/controls";
import type { FeatureFlagListItem } from "@/server/ops/controls";
import { ActionFeedback } from "./feedback";
import { formatDateTime } from "./format";
import { fieldErrorLabel } from "./labels";

const initial: ControlsActionState = { ok: false, error: null, notice: null };

export const flagHref = (key: string) => `/ops/controls/flags/${encodeURIComponent(key)}`;

/** Dense list of flags (stacked on mobile): default, override count, whether the app reads the key, and "store" for code-registered keys without a row. */
export function FlagsTable({ flags, locale }: { flags: FeatureFlagListItem[]; locale: string }) {
  const t = useTranslations("opsControls.flags");
  const tc = useTranslations("opsControls");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ControlsActionState | null>(null);

  const register = (flag: FeatureFlagListItem) => {
    setBusy(flag.key);
    setResult(null);
    startTransition(async () => {
      let r: ControlsActionState;
      try {
        r = await registerFeatureFlagAction({ key: flag.key, description: flag.description, defaultEnabled: flag.codeDefault ?? flag.defaultEnabled });
      } catch {
        r = { ok: false, error: "generic" };
      }
      setResult(r);
      setBusy(null);
      if (r.ok) router.refresh();
    });
  };

  if (flags.length === 0) return <EmptyState title={t("empty")} description={t("emptyText")} />;
  return (
    <div className="space-y-3">
      <ActionFeedback state={result} />
      <Card variant="flat">
        <CardContent className="px-2 py-2 sm:px-3">
          <Table caption={t("table.caption")}>
            <THead>
              <Tr>
                <Th>{t("table.key")}</Th>
                <Th>{t("table.default")}</Th>
                <Th>{t("table.overrides")}</Th>
                <Th>{t("table.source")}</Th>
                <Th>{t("table.updated")}</Th>
                <Th>{t("table.actions")}</Th>
              </Tr>
            </THead>
            <TBody>
              {flags.map((flag) => (
                <Tr key={flag.key} data-testid="ops-flag-row">
                  <Td label={t("table.key")}>
                    <p className="font-mono text-sm font-medium text-ink">{flag.key}</p>
                    {flag.description ? <p className="mt-0.5 max-w-md text-xs break-words text-ink-3">{flag.description}</p> : null}
                  </Td>
                  <Td label={t("table.default")}>
                    <Status tone={flag.defaultEnabled ? "ok" : "neutral"}>{flag.defaultEnabled ? tc("common.on") : tc("common.off")}</Status>
                    {flag.inCode && flag.codeDefault !== null && flag.registered && flag.codeDefault !== flag.defaultEnabled ? <p className="mt-0.5 text-xs text-ink-3">{t("codeDefault", { value: flag.codeDefault ? tc("common.on") : tc("common.off") })}</p> : null}
                  </Td>
                  <Td label={t("table.overrides")} numeric>
                    {formatNumber(flag.overrideCount, locale)}
                  </Td>
                  <Td label={t("table.source")}>
                    <span className="flex flex-wrap gap-1">
                      {flag.inCode ? <Badge tone="info">{t("source.code")}</Badge> : <Badge tone="neutral">{t("source.manual")}</Badge>}
                      {!flag.registered ? <Badge tone="warn">{t("source.unregistered")}</Badge> : null}
                    </span>
                  </Td>
                  <Td label={t("table.updated")}>{formatDateTime(flag.updatedAt, locale) ?? "—"}</Td>
                  <Td label={t("table.actions")}>
                    <span className="flex flex-wrap gap-2">
                      {flag.registered ? (
                        <Link href={flagHref(flag.key)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                          {t("open")}
                        </Link>
                      ) : (
                        <Button size="sm" variant="secondary" loading={pending && busy === flag.key} loadingLabel={tc("common.working")} disabled={pending} onClick={() => register(flag)} data-testid="ops-flag-register">
                          {t("register")}
                        </Button>
                      )}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Creates a flag with its global default; reserved `platform.*` keys and duplicates are refused by the server. */
export function FlagCreateForm() {
  const t = useTranslations("opsControls.flags.create");
  const tc = useTranslations("opsControls");
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: ControlsActionState, formData: FormData) => {
      const r = await createFeatureFlagAction(prev, formData);
      if (r.ok) router.refresh();
      return r;
    },
    initial,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("text")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3" data-testid="ops-flag-create">
          <ActionFeedback state={state.ok || state.error ? state : null} />
          <Field label={t("key")} hint={t("keyHint")} required error={fieldErrorLabel(tc, state.fieldErrors?.key)}>
            {(control) => <Input {...control} name="key" pattern="[a-z][a-z0-9_.\-]{1,63}" maxLength={64} autoComplete="off" spellCheck={false} className="font-mono" />}
          </Field>
          <Field label={t("description")} hint={t("descriptionHint")} error={fieldErrorLabel(tc, state.fieldErrors?.description)}>
            {(control) => <Textarea {...control} name="description" maxLength={500} rows={2} />}
          </Field>
          <Checkbox name="defaultEnabled" label={t("default")} />
          <Button type="submit" loading={pending} loadingLabel={tc("common.working")} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
