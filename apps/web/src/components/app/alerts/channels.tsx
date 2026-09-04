"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Status,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  type Tone,
} from "@track-site/ui";
import {
  deleteChannelAction,
  setChannelEnabledAction,
  testChannelAction,
  type AlertActionError,
} from "@/server/actions/alerts";
import type { AlertChannelView } from "@/server/alerts";
import { ChannelForm } from "./channel-form";
import { formatRelative } from "./format";
import { errorLabel } from "./labels";

export interface ChannelsProps {
  channels: AlertChannelView[];
  canManage: boolean;
  locale: string;
  /** page generation time (ISO) so relative times match between server and client */
  now: string;
}

type Dialogs =
  | { mode: "create" }
  | { mode: "edit"; channel: AlertChannelView }
  | { mode: "delete"; channel: AlertChannelView }
  | null;

interface Feedback {
  tone: Tone;
  text: string;
}

/** Notification channels: dense table (stacked on mobile), create/edit dialog, test, enable/disable and confirmed delete. */
export function Channels({ channels, canManage, locale, now }: ChannelsProps) {
  const t = useTranslations("alerts");
  const router = useRouter();
  const nowMs = Date.parse(now);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const run = (
    key: string,
    call: () => Promise<{ ok: boolean; error: AlertActionError | null }>,
    onOk: (r: { ok: boolean; error: AlertActionError | null }) => Feedback,
    onFail?: (r: { ok: boolean; error: AlertActionError | null }) => Feedback,
  ) => {
    setBusy(key);
    setFeedback(null);
    startTransition(async () => {
      let result: { ok: boolean; error: AlertActionError | null };
      try {
        result = await call();
      } catch {
        result = { ok: false, error: "generic" };
      }
      setFeedback(
        result.ok
          ? onOk(result)
          : (onFail?.(result) ?? { tone: "bad", text: errorLabel(t, result.error) }),
      );
      setBusy(null);
      setDialog(null);
      router.refresh();
    });
  };

  /** Test notification: the outcome names the transport or the reason, never the target. */
  const runTest = (c: AlertChannelView) => {
    setBusy(`test:${c.id}`);
    setFeedback(null);
    startTransition(async () => {
      let next: Awaited<ReturnType<typeof testChannelAction>>;
      try {
        next = await testChannelAction({ channelId: c.id });
      } catch {
        next = { ok: false, error: "generic", result: null };
      }
      if (next.ok)
        setFeedback({
          tone: "ok",
          text: t("channels.testSent", { transport: next.result?.transport ?? "" }),
        });
      else if (next.result)
        setFeedback({
          tone: "bad",
          text: t("channels.testFailed", {
            reason: [t(`channels.testReason.${next.result.error ?? "generic"}`), next.result.detail]
              .filter(Boolean)
              .join(" — "),
          }),
        });
      else setFeedback({ tone: "bad", text: errorLabel(t, next.error) });
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="alert-channels-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="alert-channels-title" className="text-lg font-semibold text-ink">
            {t("channels.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("channels.intro")}</p>
        </div>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => setDialog({ mode: "create" })}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
            data-testid="channel-add"
          >
            {t("channels.add")}
          </Button>
        ) : null}
      </div>
      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {pending ? (
          <Status tone="info" indicator="icon">
            {t("common.working")}
          </Status>
        ) : feedback ? (
          <Status tone={feedback.tone} indicator="icon">
            {feedback.text}
          </Status>
        ) : null}
      </div>
      {channels.length === 0 ? (
        <EmptyState
          title={t("channels.empty")}
          description={t("channels.emptyText")}
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
                {t("channels.add")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("channels.caption")}>
            <THead>
              <Tr>
                <Th>{t("channels.columns.name")}</Th>
                <Th>{t("channels.columns.kind")}</Th>
                <Th>{t("channels.columns.target")}</Th>
                <Th>{t("channels.columns.status")}</Th>
                <Th>{t("channels.columns.lastTest")}</Th>
                {canManage ? <Th>{t("channels.columns.actions")}</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {channels.map((c) => (
                <Tr key={c.id} data-testid="channel-row">
                  <Td label={t("channels.columns.name")}>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-ink-3">
                      {t("channels.usedBy", { count: c.usedBy })}
                    </p>
                  </Td>
                  <Td label={t("channels.columns.kind")}>
                    <Badge tone="neutral">{t(`channelKinds.${c.kind}`)}</Badge>
                  </Td>
                  <Td label={t("channels.columns.target")}>
                    {c.kind === "email" ? (
                      <span className="break-all text-ink-2">{c.target}</span>
                    ) : (
                      <>
                        <span className="font-mono text-xs text-ink-2">{c.targetHint ?? "—"}</span>
                        <p className="text-xs text-ink-3">{t("channels.encrypted")}</p>
                      </>
                    )}
                    <p className="text-xs text-ink-3">{c.locale.toUpperCase()}</p>
                  </Td>
                  <Td label={t("channels.columns.status")}>
                    <Status tone={c.enabled ? "ok" : "neutral"}>
                      {c.enabled ? t("common.enabled") : t("common.disabled")}
                    </Status>
                  </Td>
                  <Td label={t("channels.columns.lastTest")}>
                    {c.lastTestAt ? (
                      <>
                        <Status tone={c.lastTestStatus === "sent" ? "ok" : "bad"} indicator="icon">
                          {c.lastTestStatus === "sent"
                            ? t("channels.lastTestOk", {
                                when: formatRelative(c.lastTestAt, locale, nowMs) ?? "",
                              })
                            : t("channels.lastTestFailed", {
                                when: formatRelative(c.lastTestAt, locale, nowMs) ?? "",
                              })}
                        </Status>
                        {c.lastTestError ? (
                          <p className="text-xs break-words text-ink-3">{c.lastTestError}</p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-ink-3">{t("channels.neverTested")}</span>
                    )}
                  </Td>
                  {canManage ? (
                    <Td label={t("channels.columns.actions")}>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          loading={pending && busy === `test:${c.id}`}
                          loadingLabel={t("channels.testing")}
                          onClick={() => runTest(c)}
                          data-testid="channel-test"
                        >
                          {t("channels.test")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setDialog({ mode: "edit", channel: c })}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          loading={pending && busy === `toggle:${c.id}`}
                          loadingLabel={t("common.working")}
                          onClick={() =>
                            run(
                              `toggle:${c.id}`,
                              () =>
                                setChannelEnabledAction({ channelId: c.id, enabled: !c.enabled }),
                              () => ({
                                tone: "ok",
                                text: c.enabled
                                  ? t("channels.disabledMsg")
                                  : t("channels.enabledMsg"),
                              }),
                            )
                          }
                        >
                          {c.enabled ? t("common.disable") : t("common.enable")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setDialog({ mode: "delete", channel: c })}
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <ChannelForm
        key={dialog?.mode === "edit" ? dialog.channel.id : (dialog?.mode ?? "closed")}
        open={dialog?.mode === "create" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        channel={dialog?.mode === "edit" ? dialog.channel : null}
        defaultLocale={locale}
        onSaved={(mode) => {
          setFeedback({
            tone: "ok",
            text: mode === "create" ? t("channels.created") : t("channels.updated"),
          });
          setDialog(null);
        }}
      />

      <Dialog
        open={dialog?.mode === "delete"}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={t("channels.deleteTitle", {
          name: dialog?.mode === "delete" ? dialog.channel.name : "",
        })}
        description={t("channels.deleteText")}
        closeLabel={t("common.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={pending && busy?.startsWith("delete:")}
              loadingLabel={t("common.working")}
              onClick={() =>
                dialog?.mode === "delete" &&
                run(
                  `delete:${dialog.channel.id}`,
                  () => deleteChannelAction({ channelId: dialog.channel.id, confirmed: true }),
                  () => ({ tone: "ok", text: t("channels.deleted") }),
                )
              }
            >
              {t("channels.deleteConfirm")}
            </Button>
          </>
        }
      />
    </section>
  );
}
