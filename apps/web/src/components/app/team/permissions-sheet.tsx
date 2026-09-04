"use client";

import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Sheet, cn } from "@track-site/ui";
import type { PermissionGroup } from "@/server/team";
import { areaLabel, permissionLabel, roleLabel } from "./labels";

/** Per-member permission view: every permission grouped by area, granted or not, from the role the server enforces. */
export function PermissionsSheet({ name, role, groups }: { name: string; role: string; groups: PermissionGroup[] }) {
  const t = useTranslations("team");
  const [open, setOpen] = useState(false);
  const total = groups.reduce((n, g) => n + g.permissions.length, 0);
  const granted = groups.reduce((n, g) => n + g.granted, 0);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t("members.permissions")}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("permissionsSheet.title", { name })} description={t("permissionsSheet.description", { role: roleLabel(t, role) })} closeLabel={t("common.close")}>
        <p className="text-sm text-ink-2">{t("permissionsSheet.granted", { granted, total })}</p>
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <section key={group.area} aria-labelledby={`perm-${group.area}`}>
              <h3 id={`perm-${group.area}`} className="flex items-baseline justify-between text-sm font-semibold text-ink">
                <span>{areaLabel(t, group.area)}</span>
                <span className="text-xs font-normal text-ink-3 tabular-nums">
                  {group.granted}/{group.permissions.length}
                </span>
              </h3>
              <ul className="mt-1.5 divide-y divide-line rounded-[var(--radius-control)] border border-line">
                {group.permissions.map((p) => (
                  <li key={p.permission} className={cn("flex items-center gap-3 px-3 py-2 text-sm", p.granted ? "text-ink" : "text-ink-3")}>
                    {p.granted ? <Check className="size-4 shrink-0 text-ok" aria-hidden="true" /> : <Minus className="size-4 shrink-0 text-ink-3" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">{permissionLabel(t, p.permission)}</span>
                    <span className="sr-only">{p.granted ? t("permissionsSheet.yes") : t("permissionsSheet.no")}</span>
                    <code className="hidden text-xs text-ink-3 sm:inline">{p.permission}</code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
