"use client";

import { Building2, ChevronsUpDown, Globe, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Status, Tooltip, VisuallyHidden } from "@track-site/ui";
import { setActiveOrganizationAction, setActiveSiteAction } from "./actions";
import { Menu } from "./menu";
import type { ShellOrganization, ShellWorkspace } from "./types";

/**
 * Organization + site switcher in the header. Switching goes through the workspace server actions
 * (session-bound tenant, validated ids, audit entry, cookie + stored preference) and then refreshes
 * the server tree; the new context is announced to screen readers and confirmed by the Track AI
 * context line. A pending switch is shown with `aria-busy`; a failure is a visible alert.
 */
export function WorkspaceSwitcher({ organization, organizations, workspace, onSiteSwitched }: { organization: ShellOrganization | null; organizations: ShellOrganization[]; workspace: ShellWorkspace | null; onSiteSwitched?: (siteId: string) => void }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const switchSite = useCallback(
    (siteId: string) => {
      const target = workspace?.sites.find((s) => s.id === siteId);
      if (!target || target.id === workspace?.site?.id) return;
      setError(null);
      setAnnouncement(t("workspace.switching"));
      startTransition(async () => {
        const result = await setActiveSiteAction({ siteId });
        if (!result.ok) {
          setAnnouncement(null);
          setError(t("workspace.switchFailed"));
          return;
        }
        setAnnouncement(t("workspace.contextSwitched", { site: target.name }));
        onSiteSwitched?.(siteId);
        router.refresh();
      });
    },
    [workspace, t, router, onSiteSwitched],
  );

  const switchOrganization = useCallback(
    (organizationId: string) => {
      if (organizationId === organization?.id) return;
      setError(null);
      setAnnouncement(t("workspace.switching"));
      startTransition(async () => {
        const result = await setActiveOrganizationAction({ organizationId });
        if (!result.ok) {
          setAnnouncement(null);
          setError(t("workspace.switchFailed"));
          return;
        }
        setAnnouncement(null);
        router.push("/app");
        router.refresh();
      });
    },
    [organization, t, router],
  );

  const site = workspace?.site ?? null;
  return (
    <div className="flex min-w-0 items-center gap-0.5" aria-busy={pending || undefined} data-testid="workspace-switcher">
      <Menu
        label={t("workspace.switchOrganization")}
        triggerLabel={`${t("workspace.organization")}: ${organization?.name ?? t("workspace.noOrganization")}`}
        triggerClassName="max-w-40 sm:max-w-56"
        disabled={pending}
        sections={[
          {
            id: "organizations",
            label: t("workspace.organization"),
            items: organizations.map((org) => ({ id: org.id, label: org.name, description: t(`roles.${org.role}`), icon: <Building2 className="size-4" aria-hidden="true" />, checked: org.id === organization?.id, onSelect: () => switchOrganization(org.id) })),
          },
        ]}
      >
        <Building2 className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="hidden truncate sm:inline">{organization?.name ?? t("workspace.noOrganization")}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      </Menu>
      <span aria-hidden="true" className="text-ink-3">
        /
      </span>
      <Tooltip content={site ? `${t("workspace.trackingId")} ${site.trackingId}: ${t("workspace.trackingIdHelp")}` : t("workspace.noSite")} side="bottom">
        <Menu
          label={t("workspace.switchSite")}
          triggerLabel={`${t("workspace.site")}: ${site ? `${site.name} ${site.trackingId}` : t("workspace.noSite")}`}
          triggerClassName="max-w-48 sm:max-w-72"
          disabled={pending || !organization}
          sections={[
            {
              id: "sites",
              label: t("workspace.site"),
              items: (workspace?.sites ?? []).map((s) => ({
                id: s.id,
                label: s.name,
                description: `${s.trackingId}${s.primaryDomain ? ` · ${s.primaryDomain}` : ""}${s.status !== "active" ? ` · ${t(`workspace.siteStatus.${s.status}`)}` : ""}`,
                icon: <Globe className="size-4" aria-hidden="true" />,
                checked: s.id === site?.id,
                onSelect: () => switchSite(s.id),
              })),
            },
            {
              id: "manage",
              items: [
                { id: "manage-sites", label: t("workspace.manageSites"), icon: <Globe className="size-4" aria-hidden="true" />, href: "/app/sites" },
                { id: "create-site", label: t("workspace.createSite"), icon: <Plus className="size-4" aria-hidden="true" />, href: "/app/onboarding" },
              ],
            },
          ]}
        >
          <Globe className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="truncate">{site?.name ?? t("workspace.noSite")}</span>
          {site ? (
            <span className="hidden font-mono text-xs font-normal text-ink-3 md:inline" data-testid="active-tracking-id">
              {site.trackingId}
            </span>
          ) : null}
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        </Menu>
      </Tooltip>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {announcement ?? ""}
        </span>
      </VisuallyHidden>
      {error ? (
        <Status tone="bad" role="alert" className="ml-1 hidden md:inline-flex">
          {error}
        </Status>
      ) : null}
    </div>
  );
}
