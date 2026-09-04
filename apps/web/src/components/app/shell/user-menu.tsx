"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrgRole } from "@track-site/core";
import { Menu } from "./menu";
import type { ShellUser } from "./types";

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0]?.slice(0, 2) ?? email.slice(0, 2));
  return letters.toUpperCase();
}

/** Account menu: who is signed in, the role in the active organization and log out (router navigation, no full reload). */
export function UserMenu({ user, role, onLogout }: { user: ShellUser; role: OrgRole | null; onLogout: () => void }) {
  const t = useTranslations("shell");
  return (
    <Menu
      label={t("user.menu")}
      triggerLabel={t("user.menu")}
      align="end"
      triggerClassName="px-1.5"
      header={
        <div className="min-w-0">
          <p className="text-xs text-ink-3">{t("user.signedInAs")}</p>
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-ink-3">{user.email}</p>
          {role ? (
            <p className="mt-1 text-xs text-ink-3">
              {t("user.role")}: <span className="font-medium text-ink-2">{t(`roles.${role}`)}</span>
            </p>
          ) : null}
        </div>
      }
      sections={[{ id: "account", items: [{ id: "logout", label: t("user.logout"), icon: <LogOut className="size-4" aria-hidden="true" />, onSelect: onLogout }] }]}
    >
      <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
        {initials(user.name, user.email)}
      </span>
      <ChevronDown className="size-3.5 text-ink-3" aria-hidden="true" />
    </Menu>
  );
}
