"use client";

import { Command } from "cmdk";
import { Globe, LogOut, Plus, Sparkles, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Dialog } from "@track-site/ui";
import { MODULES } from "./modules";
import { NAV, navLabel } from "./nav";
import type { PaletteDestination, WorkspaceSite } from "./types";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: WorkspaceSite[];
  activeSiteId: string | null;
  destinations: PaletteDestination[];
  onSwitchSite: (siteId: string) => void;
  assistantOpen: boolean;
  onToggleAssistant: () => void;
  onLogout: () => void;
}

const ITEM =
  "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-control-sm)] px-2.5 py-2 text-sm text-ink-2 outline-none data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary pointer-coarse:min-h-11";

/**
 * Global command palette (Ctrl/Cmd+K): navigation, site switch, destinations and actions. Built on
 * cmdk inside the design-system Dialog (focus trap, inert background, Escape, focus restore).
 */
export function CommandPalette({
  open,
  onOpenChange,
  sites,
  activeSiteId,
  destinations,
  onSwitchSite,
  assistantOpen,
  onToggleAssistant,
  onLogout,
}: CommandPaletteProps) {
  const t = useTranslations("shell");
  const tModule = useTranslations();
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={t("palette.title")}
      description={t("palette.description")}
      closeLabel={t("palette.close")}
      size="md"
      className="sm:max-w-xl"
    >
      <Command label={t("palette.title")} className="text-ink" loop>
        <Command.Input
          autoFocus
          placeholder={t("palette.placeholder")}
          className="mb-2 h-11 w-full rounded-[var(--radius-control)] border border-line-2 bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <Command.List className="max-h-[min(24rem,50dvh)] overflow-y-auto pb-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-3">
          <Command.Empty className="px-2.5 py-6 text-center text-sm text-ink-3">
            {t("palette.empty")}
          </Command.Empty>
          <Command.Group heading={t("palette.groups.navigation")}>
            {NAV.map((item) => {
              const Icon = item.icon;
              const label = navLabel(item, (key) => t(`nav.${key}`), tModule);
              return (
                <Command.Item
                  key={item.href}
                  value={`nav ${label}`}
                  keywords={[item.href]}
                  onSelect={() => run(() => router.push(item.href))}
                  className={ITEM}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {label}
                </Command.Item>
              );
            })}
          </Command.Group>
          <Command.Group heading={t("palette.groups.modules")}>
            {MODULES.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.href}
                  value={`module ${t(`palette.modules.${item.key}`)}`}
                  keywords={[item.href]}
                  onSelect={() => run(() => router.push(item.href))}
                  className={ITEM}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {t(`palette.modules.${item.key}`)}
                </Command.Item>
              );
            })}
          </Command.Group>
          {sites.length ? (
            <Command.Group heading={t("palette.groups.sites")}>
              {sites.map((site) => (
                <Command.Item
                  key={site.id}
                  value={`site ${site.name} ${site.trackingId}`}
                  keywords={[site.primaryDomain ?? ""]}
                  onSelect={() => run(() => onSwitchSite(site.id))}
                  disabled={site.id === activeSiteId}
                  className={ITEM}
                >
                  <Globe className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {site.id === activeSiteId
                      ? site.name
                      : t("palette.switchTo", { site: site.name })}
                  </span>
                  <span className="font-mono text-xs text-ink-3">{site.trackingId}</span>
                  {site.id === activeSiteId ? (
                    <span className="text-xs text-ink-3">{t("workspace.current")}</span>
                  ) : null}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {destinations.length ? (
            <Command.Group heading={t("palette.groups.destinations")}>
              {destinations.map((d) => (
                <Command.Item
                  key={d.id}
                  value={`destination ${d.name} ${d.connectorType} ${d.siteName}`}
                  onSelect={() =>
                    run(() => router.push(`/app/sites/${d.siteId}/destinations/${d.id}`))
                  }
                  className={ITEM}
                >
                  <Waypoints className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="truncate text-xs text-ink-3">
                    {d.connectorType} · {d.siteName}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading={t("palette.groups.actions")}>
            <Command.Item
              value={`action ${t("palette.actions.createSite")}`}
              onSelect={() => run(() => router.push("/app/onboarding"))}
              className={ITEM}
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              {t("palette.actions.createSite")}
            </Command.Item>
            <Command.Item
              value={`action ${t("palette.actions.manageSites")}`}
              onSelect={() => run(() => router.push("/app/sites"))}
              className={ITEM}
            >
              <Globe className="size-4 shrink-0" aria-hidden="true" />
              {t("palette.actions.manageSites")}
            </Command.Item>
            <Command.Item
              value={`action ${assistantOpen ? t("palette.actions.closeAssistant") : t("palette.actions.openAssistant")}`}
              onSelect={() => run(onToggleAssistant)}
              className={ITEM}
            >
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
              {assistantOpen
                ? t("palette.actions.closeAssistant")
                : t("palette.actions.openAssistant")}
            </Command.Item>
            <Command.Item
              value={`action ${t("palette.actions.logout")}`}
              onSelect={() => run(onLogout)}
              className={ITEM}
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              {t("palette.actions.logout")}
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </Dialog>
  );
}
