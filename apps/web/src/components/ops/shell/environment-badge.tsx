"use client";

import { useTranslations } from "next-intl";
import type { AppEnv } from "@track-site/core";
import { Status, VisuallyHidden, type Tone } from "@track-site/ui";
import type { OpsEnvironment } from "./types";

/**
 * Environment tone for operators: production is the one that touches live customers (warn), staging is
 * informational, local and test environments are neutral. Text and icon always accompany the colour; the
 * explanation is rendered for screen readers instead of a hover-only tooltip.
 */
export const OPS_ENVIRONMENT_TONE: Record<AppEnv, Tone> = {
  production: "warn",
  staging: "info",
  development: "neutral",
  test: "neutral",
};

export function EnvironmentBadge({ environment }: { environment: OpsEnvironment }) {
  const t = useTranslations("ops.environment");
  return (
    <Status
      tone={OPS_ENVIRONMENT_TONE[environment.appEnv]}
      chip
      indicator="both"
      data-testid="ops-environment"
      className="max-w-[40vw] sm:max-w-none"
    >
      <VisuallyHidden>{t("label")}: </VisuallyHidden>
      {t(environment.appEnv)}
      <span className="hidden font-mono font-normal text-ink-3 sm:inline">
        {" · "}
        <VisuallyHidden>{t("host")}: </VisuallyHidden>
        {environment.host}
      </span>
      <VisuallyHidden>. {t(`help.${environment.appEnv}`)}</VisuallyHidden>
    </Status>
  );
}
