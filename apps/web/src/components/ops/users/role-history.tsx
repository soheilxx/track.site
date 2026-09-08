import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { HISTORY_LIMIT, type RoleHistoryEntry } from "@/server/ops/users";
import { actorKindLabel, historyActionLabel, roleLabel } from "./labels";

const ACTION_TONE: Record<string, "info" | "ok" | "warn" | "neutral"> = { propose: "info", set: "ok", decline: "warn", withdraw: "neutral" };

/** The newest role-change audit entries across all accounts (console requests and decisions, CLI grants). */
export async function RoleHistory({ entries, locale }: { entries: RoleHistoryEntry[]; locale: string }) {
  const t = await getTranslations("opsUsers");
  if (entries.length === 0) return <p className="text-sm text-ink-3">{t("history.empty")}</p>;
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
        <Table caption={t("history.caption")}>
          <THead>
            <Tr>
              <Th>{t("history.when")}</Th>
              <Th>{t("history.actor")}</Th>
              <Th>{t("history.action")}</Th>
              <Th>{t("history.account")}</Th>
              <Th>{t("history.change")}</Th>
            </Tr>
          </THead>
          <TBody>
            {entries.map((e) => {
              const key = e.action.replace(/^platform\.role\./, "");
              const isCli = e.actor.kind === "system";
              return (
                <Tr key={e.id}>
                  <Td label={t("history.when")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={e.createdAt}>{formatDateTime(e.createdAt, locale)}</time>
                  </Td>
                  <Td label={t("history.actor")}>
                    <p className="text-ink">{e.actor.name ?? (isCli ? (e.actor.detail ?? actorKindLabel(t, "system")) : t("common.former"))}</p>
                    <p className="text-xs text-ink-3">{actorKindLabel(t, e.actor.kind)}</p>
                  </Td>
                  <Td label={t("history.action")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={ACTION_TONE[key] ?? "neutral"}>{historyActionLabel(t, e.action)}</Badge>
                      {e.selfApproved ? <Badge tone="warn">{t("history.selfApproved")}</Badge> : null}
                    </div>
                    <code className="text-xs text-ink-3">{e.action}</code>
                  </Td>
                  <Td label={t("history.account")}>
                    {e.target.id ? (
                      <Link href={`/ops/users/${e.target.id}`} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                        {e.target.name ?? t("common.former")}
                      </Link>
                    ) : (
                      <span className="text-ink-3">{t("common.former")}</span>
                    )}
                    {e.target.email ? <p className="text-xs break-all text-ink-3">{e.target.email}</p> : null}
                  </Td>
                  <Td label={t("history.change")}>
                    {e.before || e.after ? <p className="text-ink">{t("requests.changeValue", { from: e.before ? roleLabel(t, e.before) : "?", to: e.after ? roleLabel(t, e.after) : "?" })}</p> : null}
                    <p className="text-xs text-ink-3">
                      {e.reason ? t("history.reason", { reason: e.reason }) : null}
                      {e.ticketRef ? ` · ${t("history.ticket", { ticket: e.ticketRef })}` : null}
                      {e.sessionsRevoked != null ? ` · ${t("history.sessionsRevoked", { count: e.sessionsRevoked })}` : null}
                    </p>
                    {e.requestId ? <p className="font-mono text-xs text-ink-3">{t("history.request", { id: e.requestId })}</p> : null}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-ink-3">{t("history.intro", { count: HISTORY_LIMIT })}</p>
    </div>
  );
}
