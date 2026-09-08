import { getTranslations } from "next-intl/server";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@track-site/ui";
import { formatDateTime } from "@/components/ops/controls/format";
import { formatNumber } from "@/lib/format";
import type { MacroView } from "@/server/support/macros";
import { ActionSummary } from "./action-summary";
import { renderMacroTemplate } from "./constants";

/**
 * Read-only view of a macro the operator may use but not edit (a global macro for a support operator): the
 * text, its actions, usage and a preview with sample values. Nothing here mutates; the macro is applied from
 * a ticket's reply editor.
 */
export async function MacroReadOnly({ macro, agentName, locale }: { macro: MacroView; agentName: string; locale: string }) {
  const [t, ts] = await Promise.all([getTranslations("supportMacros"), getTranslations("support")]);
  const preview = renderMacroTemplate(macro.bodyText, {
    requester_name: t("editor.sample.requesterName"),
    requester_email: "alex@example.com",
    ticket_number: 1000,
    ticket_subject: t("editor.sample.subject"),
    agent_name: agentName,
    organization_name: t("editor.sample.organization"),
  });
  return (
    <div className="space-y-6">
      <Alert tone="info">{t("list.readOnlyHint")}</Alert>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{macro.name}</CardTitle>
            <CardDescription>
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={macro.scope === "global" ? "info" : "neutral"}>{ts(`macroScope.${macro.scope}`)}</Badge>
                {macro.category ? <Badge tone="neutral">{macro.category}</Badge> : null}
                <span>{t("editor.meta", { count: formatNumber(macro.usageCount, locale), date: formatDateTime(macro.updatedAt, locale) ?? t("common.none") })}</span>
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 font-sans text-sm whitespace-pre-wrap text-ink">{macro.bodyText}</pre>
            <div>
              <h3 className="text-sm font-semibold text-ink">{t("editor.actionsTitle")}</h3>
              <ActionSummary actions={macro.actions} className="mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card variant="panel">
          <CardHeader>
            <CardTitle>{t("editor.preview")}</CardTitle>
            <CardDescription>{t("editor.previewHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-[var(--radius-control)] border border-line bg-surface p-3 font-sans text-sm whitespace-pre-wrap text-ink">{preview}</pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
