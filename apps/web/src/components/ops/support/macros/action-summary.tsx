import { useTranslations } from "next-intl";
import type { SupportMacroActions } from "@track-site/db";
import { cn } from "@track-site/ui";
import { macroActionEntries } from "./constants";

/**
 * The actions of a macro as a compact list ("Set status to Pending", "Add tags billing", "Assign to me").
 * Works in server and client components (next-intl's `useTranslations` does both); the vocabulary of statuses
 * and priorities comes from the shared `support` namespace.
 */
export function ActionSummary({ actions, className, compact = false }: { actions: SupportMacroActions | null | undefined; className?: string; compact?: boolean }) {
  const t = useTranslations("supportMacros.actions");
  const ts = useTranslations("support");
  const entries = macroActionEntries(actions);
  if (!entries.length) return <span className={cn("text-ink-3", className)}>{t("none")}</span>;
  return (
    <ul className={cn(compact ? "space-y-0.5 text-xs" : "space-y-1 text-sm", "text-ink-2", className)}>
      {entries.map((entry) => {
        let text: string;
        switch (entry.kind) {
          case "status":
            text = t("status", { value: ts(`status.${entry.value}`) });
            break;
          case "priority":
            text = t("priority", { value: ts(`priority.${entry.value}`) });
            break;
          case "tags_add":
            text = t("tagsAdd", { value: entry.value ?? "" });
            break;
          case "tags_remove":
            text = t("tagsRemove", { value: entry.value ?? "" });
            break;
          default:
            text = t("assignToSelf");
        }
        return <li key={entry.kind}>{text}</li>;
      })}
    </ul>
  );
}
