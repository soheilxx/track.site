"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Status,
  buttonVariants,
  type Tone,
} from "@track-site/ui";
import {
  pauseDestinationIncidentAction,
  resumeDestinationIncidentAction,
  setEnvironmentKillSwitchAction,
  type AlertActionError,
} from "@/server/actions/alerts";
import type { IncidentDestination, IncidentEnvironment, IncidentTargets } from "@/server/alerts";
import { formatRelative } from "./format";
import { errorLabel } from "./labels";

export interface IncidentModeProps {
  targets: IncidentTargets;
  site: { id: string; name: string } | null;
  canManageDestinations: boolean;
  canKillSwitch: boolean;
  locale: string;
  now: string;
}

type Dialogs =
  | { kind: "destination"; action: "pause" | "resume"; target: IncidentDestination }
  | { kind: "environment"; action: "pause" | "resume"; target: IncidentEnvironment }
  | null;

const STATUS_TONE: Record<string, Tone> = {
  connected: "ok",
  paused: "warn",
  error: "bad",
  not_connected: "neutral",
  draft: "neutral",
};

/**
 * Incident Mode (supplement §8 module 13): pause one destination (reusing the Destination Health
 * Center's pause/resume) or the browser tracking of one environment (signed configuration with the
 * kill switch on) while every other flow continues. Every action is confirmed in a dialog, re-checked
 * on the server and audited; the outcome is announced in a live region.
 */
export function IncidentMode({
  targets,
  site,
  canManageDestinations,
  canKillSwitch,
  locale,
  now,
}: IncidentModeProps) {
  const t = useTranslations("alerts.incident");
  const tc = useTranslations("alerts");
  const router = useRouter();
  const nowMs = Date.parse(now);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    tone: Tone;
    text: string;
    detail?: string | null;
  } | null>(null);

  const finish = (
    result: { ok: boolean; error: AlertActionError | null },
    okText: string,
    detail?: string | null,
  ) => {
    setFeedback(
      result.ok
        ? { tone: "ok", text: okText, detail }
        : { tone: "bad", text: errorLabel(tc, result.error), detail },
    );
    setDialog(null);
    router.refresh();
  };

  const confirm = () => {
    if (!dialog) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        if (dialog.kind === "destination" && dialog.action === "pause") {
          const r = await pauseDestinationIncidentAction({
            integrationId: dialog.target.id,
            confirmed: true,
          });
          finish(r, t("destinations.paused"));
        } else if (dialog.kind === "destination") {
          const r = await resumeDestinationIncidentAction({
            integrationId: dialog.target.id,
            confirmed: true,
          });
          if (r.ok) finish(r, t("destinations.resumed"), r.detail);
          else if (r.status) {
            // the credential check ran and failed: say what the status is now, never "resumed"
            setFeedback({
              tone: "bad",
              text: t("destinations.notResumed"),
              detail: [
                t("destinations.statusNow", { status: t(`destinations.status.${r.status}`) }),
                r.detail,
              ]
                .filter(Boolean)
                .join(" · "),
            });
            setDialog(null);
            router.refresh();
          } else finish(r, "");
        } else {
          const r = await setEnvironmentKillSwitchAction({
            environmentId: dialog.target.id,
            on: dialog.action === "pause",
            confirmed: true,
          });
          finish(
            r,
            dialog.action === "pause"
              ? t("environments.paused", { version: r.version ?? 0 })
              : t("environments.resumed", { version: r.version ?? 0 }),
          );
        }
      } catch {
        finish({ ok: false, error: "generic" }, "");
      }
    });
  };

  if (!site) {
    return (
      <section aria-labelledby="incident-title" className="space-y-4">
        <Header />
        <EmptyState
          title={t("noSite")}
          description={t("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants({ size: "sm" })}>
              {t("createSite")}
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="incident-title" className="space-y-4" data-testid="incident-mode">
      <Header />
      <p className="text-sm text-ink-2">
        {t("context", { site: site.name })}{" "}
        <span className="text-ink-3">{t("switchSiteHint")}</span>
      </p>
      {!canManageDestinations && !canKillSwitch ? (
        <p className="text-sm text-ink-3">{t("readOnly")}</p>
      ) : null}
      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {pending ? (
          <Status tone="info" indicator="icon">
            {tc("common.working")}
          </Status>
        ) : feedback ? (
          <div>
            <Status tone={feedback.tone} indicator="icon">
              {feedback.text}
            </Status>
            {feedback.detail ? (
              <p className="text-xs break-words text-ink-3">{feedback.detail}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-ink">{t("destinations.title")}</h3>
            <Link
              href="/app/destinations"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {t("destinations.manage")}
            </Link>
          </div>
          {targets.destinations.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">
              {t("destinations.empty", { site: site.name })} {t("destinations.emptyText")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {targets.destinations.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="incident-destination"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {d.name} <span className="text-xs text-ink-3">{d.connectorType}</span>{" "}
                      {d.testMode ? (
                        <Badge tone="neutral">{t("destinations.testMode")}</Badge>
                      ) : null}
                    </p>
                    <Status tone={STATUS_TONE[d.status] ?? "neutral"} className="text-xs">
                      {t(`destinations.status.${d.status}`)}
                      {d.status === "paused" && d.pausedAt
                        ? ` · ${t("destinations.pausedSince", { when: formatRelative(d.pausedAt, locale, nowMs) ?? "" })}`
                        : ""}
                    </Status>
                  </div>
                  {canManageDestinations ? (
                    d.status === "paused" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          setDialog({ kind: "destination", action: "resume", target: d })
                        }
                      >
                        {t("destinations.resume")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() =>
                          setDialog({ kind: "destination", action: "pause", target: d })
                        }
                        data-testid="incident-pause-destination"
                      >
                        {t("destinations.pause")}
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-ink">{t("environments.title")}</h3>
            <Link href="/app/releases" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("environments.openReleases")}
            </Link>
          </div>
          {!targets.signingAvailable ? (
            <Alert tone="warn" className="mt-3">
              {t("environments.signingMissing")}
            </Alert>
          ) : null}
          {targets.environments.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">{t("environments.empty")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {targets.environments.map((e) => {
                const state =
                  e.activeVersion == null
                    ? "none"
                    : e.killSwitch == null
                      ? "unknown"
                      : e.killSwitch
                        ? "paused"
                        : "active";
                const tone: Tone =
                  state === "active" ? "ok" : state === "paused" ? "warn" : "neutral";
                return (
                  <li
                    key={e.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="incident-environment"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {e.name}{" "}
                        <span className="text-xs text-ink-3">
                          {t(`environments.kind.${e.kind}`)}
                        </span>{" "}
                        {e.testMode ? (
                          <Badge tone="neutral">{t("environments.testMode")}</Badge>
                        ) : null}
                      </p>
                      <Status tone={tone} className="text-xs">
                        {t(`environments.state.${state}`)}
                        {e.activeVersion != null
                          ? ` · ${t("environments.live", { version: e.activeVersion })}`
                          : ` · ${t("environments.noVersion")}`}
                      </Status>
                    </div>
                    {canKillSwitch && targets.signingAvailable && state !== "unknown" ? (
                      state === "paused" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() =>
                            setDialog({ kind: "environment", action: "resume", target: e })
                          }
                        >
                          {t("environments.resume")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={pending}
                          onClick={() =>
                            setDialog({ kind: "environment", action: "pause", target: e })
                          }
                          data-testid="incident-pause-environment"
                        >
                          {t("environments.pause")}
                        </Button>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog
        open={dialog !== null}
        onClose={() => (pending ? undefined : setDialog(null))}
        title={
          dialog
            ? t(
                `${dialog.kind === "destination" ? "destinations" : "environments"}.${dialog.action}Title`,
                { name: dialog.target.name },
              )
            : ""
        }
        description={
          dialog
            ? t(
                `${dialog.kind === "destination" ? "destinations" : "environments"}.${dialog.action}Text`,
              )
            : ""
        }
        closeLabel={tc("common.close")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setDialog(null)}>
              {tc("common.cancel")}
            </Button>
            <Button
              variant={dialog?.action === "pause" ? "danger" : "primary"}
              loading={pending}
              loadingLabel={tc("common.working")}
              onClick={confirm}
              data-testid="incident-confirm"
            >
              {dialog
                ? t(
                    `${dialog.kind === "destination" ? "destinations" : "environments"}.${dialog.action}Confirm`,
                  )
                : ""}
            </Button>
          </>
        }
      />
    </section>
  );
}

function Header() {
  const t = useTranslations("alerts.incident");
  return (
    <div className="min-w-0">
      <h2 id="incident-title" className="text-lg font-semibold text-ink">
        {t("title")}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("intro")}</p>
    </div>
  );
}
