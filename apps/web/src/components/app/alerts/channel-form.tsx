"use client";

import { ACTIVE_LOCALES, LOCALE_NAMES } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ALERT_CHANNEL_KINDS, type AlertChannelKind } from "@track-site/db/schema";
import { Alert, Button, Dialog, Field, Input, Select } from "@track-site/ui";
import { saveChannelAction, type AlertFormState } from "@/server/actions/alerts";
import type { AlertChannelView } from "@/server/alerts";
import { errorLabel, fieldErrorLabel } from "./labels";

const initial: AlertFormState = { ok: false, error: null };

export interface ChannelFormProps {
  open: boolean;
  onClose: () => void;
  /** null = create */
  channel: AlertChannelView | null;
  defaultLocale: string;
  onSaved: (mode: "create" | "edit") => void;
}

/**
 * Create / edit dialog of a notification channel. The kind is fixed once created; URLs and secrets are
 * write-only (an empty field keeps what is stored). Server-side validation errors are shown per field.
 */
export function ChannelForm({ open, onClose, channel, defaultLocale, onSaved }: ChannelFormProps) {
  const t = useTranslations("alerts");
  const router = useRouter();
  const [state, action, pending] = useActionState(saveChannelAction, initial);
  const [kind, setKind] = useState<AlertChannelKind>(channel?.kind ?? "email");
  const [handled, setHandled] = useState<AlertFormState | null>(null);
  const editing = Boolean(channel);
  const effectiveKind = channel?.kind ?? kind;

  // close once per successful result (state adjusted during render, no effect needed)
  if (state.ok && handled !== state) {
    setHandled(state);
    onSaved(editing ? "edit" : "create");
  }
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const targetLabel =
    effectiveKind === "email"
      ? t("channels.form.targetEmail")
      : effectiveKind === "slack"
        ? t("channels.form.targetSlack")
        : t("channels.form.targetWebhook");
  const fieldError = (name: string) =>
    fieldErrorLabel(t, state.ok ? undefined : state.fieldErrors?.[name]);

  return (
    <Dialog
      open={open}
      onClose={() => (pending ? undefined : onClose())}
      title={
        channel
          ? t("channels.form.editTitle", { name: channel.name })
          : t("channels.form.createTitle")
      }
      closeLabel={t("common.close")}
      size="md"
    >
      <form action={action} className="space-y-4 py-2" data-testid="channel-form">
        {channel ? <input type="hidden" name="channelId" value={channel.id} /> : null}
        {!state.ok && state.error && state.error !== "invalid" ? (
          <Alert tone="bad">{errorLabel(t, state.error)}</Alert>
        ) : null}
        {!state.ok && state.error === "invalid" && !state.fieldErrors ? (
          <Alert tone="bad">{errorLabel(t, "invalid")}</Alert>
        ) : null}
        <Field
          label={t("channels.form.kind")}
          hint={t(`channels.form.kindHint.${effectiveKind}`)}
          error={fieldError("kind")}
        >
          {(control) =>
            channel ? (
              <>
                <input type="hidden" name="kind" value={channel.kind} />
                <Input {...control} value={t(`channelKinds.${channel.kind}`)} readOnly />
              </>
            ) : (
              <Select
                {...control}
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as AlertChannelKind)}
              >
                {ALERT_CHANNEL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`channelKinds.${k}`)}
                  </option>
                ))}
              </Select>
            )
          }
        </Field>
        <Field label={t("channels.form.name")} error={fieldError("name")} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              defaultValue={channel?.name ?? ""}
              maxLength={80}
              placeholder={t("channels.form.namePlaceholder")}
            />
          )}
        </Field>
        <Field
          label={targetLabel}
          hint={editing && effectiveKind !== "email" ? t("channels.form.targetKeep") : undefined}
          error={fieldError("target")}
          required={!editing}
        >
          {(control) => (
            <Input
              {...control}
              name="target"
              type={effectiveKind === "email" ? "email" : "url"}
              inputMode={effectiveKind === "email" ? "email" : "url"}
              defaultValue={effectiveKind === "email" ? (channel?.target ?? "") : ""}
              placeholder={
                effectiveKind === "email"
                  ? "alerts@example.com"
                  : effectiveKind === "slack"
                    ? "https://hooks.slack.com/services/…"
                    : "https://example.com/track-alerts"
              }
              maxLength={2048}
              autoComplete="off"
            />
          )}
        </Field>
        {effectiveKind === "webhook" ? (
          <Field
            label={t("channels.form.secret")}
            hint={editing ? t("channels.form.secretKeep") : t("channels.form.secretHint")}
            error={fieldError("secret")}
          >
            {(control) => (
              <Input
                {...control}
                name="secret"
                type="password"
                autoComplete="new-password"
                maxLength={256}
              />
            )}
          </Field>
        ) : null}
        <Field label={t("channels.form.locale")} error={fieldError("locale")}>
          {(control) => (
            <Select {...control} name="locale" defaultValue={channel?.locale ?? defaultLocale}>
              {ACTIVE_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={t("common.saving")}
            data-testid="channel-form-submit"
          >
            {channel ? t("channels.form.submitEdit") : t("channels.form.submitCreate")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
