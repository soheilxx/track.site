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
  deleteRuleAction,
  setRuleEnabledAction,
  type AlertActionError,
} from "@/server/actions/alerts";
import type { AlertChannelView, AlertRuleView } from "@/server/alerts";
import { formatRelative } from "./format";
import { errorLabel } from "./labels";
import { RuleForm } from "./rule-form";
import { previewValues } from "./threshold";

export interface RulesProps {
  rules: AlertRuleView[];
  channels: AlertChannelView[];
  sites: Array<{ id: string; name: string }>;
  canManage: boolean;
  locale: string;
  now: string;
}

type Dialogs =
  | { mode: "create" }
  | { mode: "edit"; rule: AlertRuleView }
  | { mode: "delete"; rule: AlertRuleView }
  | null;

/** Alert rules: dense table with the plain-language condition, create/edit dialog with per-kind thresholds, enable/disable and confirmed delete. */
export function Rules({ rules, channels, sites, canManage, locale, now }: RulesProps) {
  const t = useTranslations("alerts");
  const router = useRouter();
  const nowMs = Date.parse(now);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: Tone; text: string } | null>(null);

  const run = (
    key: string,
    call: () => Promise<{ ok: boolean; error: AlertActionError | null }>,
    okText: string,
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
          ? { tone: "ok", text: okText }
          : { tone: "bad", text: errorLabel(t, result.error) },
      );
      setBusy(null);
      setDialog(null);
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="alert-rules-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="alert-rules-title" className="text-lg font-semibold text-ink">
            {t("rules.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("rules.intro")}</p>
        </div>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => setDialog({ mode: "create" })}
            leadingIcon={<Plus className="size-4" aria-hidden="true" />}
            data-testid="rule-add"
          >
            {t("rules.add")}
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
      {rules.length === 0 ? (
        <EmptyState
          title={t("rules.empty")}
          description={t("rules.emptyText")}
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
                {t("rules.add")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("rules.caption")}>
            <THead>
              <Tr>
                <Th>{t("rules.columns.name")}</Th>
                <Th>{t("rules.columns.scope")}</Th>
                <Th>{t("rules.columns.threshold")}</Th>
                <Th>{t("rules.columns.channels")}</Th>
                <Th>{t("rules.columns.status")}</Th>
                {canManage ? <Th>{t("rules.columns.actions")}</Th> : null}
              </Tr>
            </THead>
            <TBody>
              {rules.map((r) => (
                <Tr key={r.id} data-testid="rule-row">
                  <Td label={t("rules.columns.name")}>
                    <p className="font-medium text-ink">{r.name}</p>
                    <Badge tone="neutral">{t(`kinds.${r.kind}.label`)}</Badge>
                  </Td>
                  <Td label={t("rules.columns.scope")}>{r.siteName ?? t("common.allSites")}</Td>
                  <Td label={t("rules.columns.threshold")}>
                    <p className="max-w-md text-sm text-ink-2">
                      {t(`rules.preview.${r.kind}`, previewValues(r.kind, r.threshold))}
                    </p>
                    <p className="text-xs text-ink-3">
                      {t("rules.cooldown", { minutes: r.cooldownMinutes })}
                    </p>
                  </Td>
                  <Td label={t("rules.columns.channels")}>
                    {r.channelNames.length ? (
                      r.channelNames.join(", ")
                    ) : (
                      <span className="text-ink-3">{t("rules.historyOnly")}</span>
                    )}
                  </Td>
                  <Td label={t("rules.columns.status")}>
                    <Status tone={r.enabled ? "ok" : "neutral"}>
                      {r.enabled ? t("common.enabled") : t("common.disabled")}
                    </Status>
                    <p className="text-xs text-ink-3">
                      {r.lastEvaluatedAt
                        ? t("rules.evaluated", {
                            when: formatRelative(r.lastEvaluatedAt, locale, nowMs) ?? "",
                          })
                        : t("rules.neverEvaluated")}
                    </p>
                  </Td>
                  {canManage ? (
                    <Td label={t("rules.columns.actions")}>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setDialog({ mode: "edit", rule: r })}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          loading={pending && busy === `toggle:${r.id}`}
                          loadingLabel={t("common.working")}
                          onClick={() =>
                            run(
                              `toggle:${r.id}`,
                              () => setRuleEnabledAction({ ruleId: r.id, enabled: !r.enabled }),
                              r.enabled ? t("rules.disabledMsg") : t("rules.enabledMsg"),
                            )
                          }
                        >
                          {r.enabled ? t("common.disable") : t("common.enable")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setDialog({ mode: "delete", rule: r })}
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

      <RuleForm
        key={dialog?.mode === "edit" ? dialog.rule.id : (dialog?.mode ?? "closed")}
        open={dialog?.mode === "create" || dialog?.mode === "edit"}
        onClose={() => setDialog(null)}
        rule={dialog?.mode === "edit" ? dialog.rule : null}
        channels={channels}
        sites={sites}
        onSaved={(mode) => {
          setFeedback({
            tone: "ok",
            text: mode === "create" ? t("rules.created") : t("rules.updated"),
          });
          setDialog(null);
        }}
      />

      <Dialog
        open={dialog?.mode === "delete"}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={t("rules.deleteTitle", { name: dialog?.mode === "delete" ? dialog.rule.name : "" })}
        description={t("rules.deleteText")}
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
                  `delete:${dialog.rule.id}`,
                  () => deleteRuleAction({ ruleId: dialog.rule.id, confirmed: true }),
                  t("rules.deleted"),
                )
              }
            >
              {t("rules.deleteConfirm")}
            </Button>
          </>
        }
      />
    </section>
  );
}
