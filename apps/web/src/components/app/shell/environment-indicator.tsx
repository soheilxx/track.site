"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Status, Tooltip, VisuallyHidden, type Tone } from "@track-site/ui";
import { setActiveEnvironmentAction } from "./actions";
import { Menu } from "./menu";
import type { WorkspaceEnvironment } from "./types";

/** Environment tone: production is the live data path (ok), staging/test flag events as test (warn/info). Text and dot always accompany the colour. */
export const ENVIRONMENT_TONE: Record<WorkspaceEnvironment["kind"], Tone> = { production: "ok", staging: "warn", development: "info" };

/**
 * Visible environment indicator (Test / Staging / Production) of the active site with a short
 * explanation as tooltip and a menu to switch the environment; the choice is stored per user and
 * organization through the workspace action.
 */
export function EnvironmentIndicator({ siteId, environments, environment }: { siteId: string | null; environments: WorkspaceEnvironment[]; environment: WorkspaceEnvironment | null }) {
  const t = useTranslations("shell.environment");
  const tWorkspace = useTranslations("shell.workspace");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!siteId || !environment) {
    return (
      <Status tone="neutral" chip data-testid="environment-indicator">
        {t("none")}
      </Status>
    );
  }

  const kindLabel = (env: WorkspaceEnvironment) => t(`kind.${env.kind}`);
  const chip = (
    <Status tone={ENVIRONMENT_TONE[environment.kind]} chip indicator="both" data-testid="environment-indicator" aria-busy={pending || undefined}>
      {kindLabel(environment)}
      {environment.testMode ? <span className="hidden sm:inline"> · {t("testMode")}</span> : null}
    </Status>
  );

  return (
    <div className="inline-flex items-center gap-1">
      <Tooltip content={t(`help.${environment.kind}`)} side="bottom">
        <Menu
          label={t("switch")}
          triggerLabel={`${t("label")}: ${kindLabel(environment)}`}
          triggerClassName="px-1"
          disabled={pending}
          sections={[
            {
              id: "environments",
              label: t("label"),
              items: environments.map((env) => ({
                id: env.id,
                label: kindLabel(env),
                description: `${env.name} · ${env.testMode ? t("testMode") : t("live")}`,
                checked: env.id === environment.id,
                onSelect: () => {
                  if (env.id === environment.id) return;
                  setError(null);
                  startTransition(async () => {
                    const result = await setActiveEnvironmentAction({ siteId, environmentId: env.id });
                    if (!result.ok) setError(tWorkspace("switchFailed"));
                    else router.refresh();
                  });
                },
              })),
            },
          ]}
        >
          {chip}
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden="true" />
        </Menu>
      </Tooltip>
      {error ? (
        <Status tone="bad" role="alert">
          <VisuallyHidden>{t("label")}: </VisuallyHidden>
          {error}
        </Status>
      ) : null}
    </div>
  );
}
