import { getTranslations } from "next-intl/server";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import type { MemberView } from "@/server/ops/organisations";

/** Members with role, two-factor state and join date — the customer's team (operator-visible metadata), no end-user data. */
export async function MembersTable({ members, pendingInvitations, locale }: { members: MemberView[]; pendingInvitations: number; locale: string }) {
  const t = await getTranslations("opsOrganisations.detail.members");
  const tOps = await getTranslations("ops");
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        {t("count", { count: members.length })} · {t("invitations", { count: pendingInvitations })}
      </p>
      {members.length === 0 ? (
        <p className="text-sm text-ink-3">{t("empty")}</p>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
          <Table caption={t("caption")}>
            <THead>
              <Tr>
                <Th>{t("name")}</Th>
                <Th>{t("email")}</Th>
                <Th>{t("role")}</Th>
                <Th>{t("twoFactor")}</Th>
                <Th>{t("joined")}</Th>
              </Tr>
            </THead>
            <TBody>
              {members.map((m) => (
                <Tr key={m.id}>
                  <Td label={t("name")}>
                    <p className="font-medium text-ink">{m.name}</p>
                    {m.platformRole !== "NONE" ? <p className="text-xs text-ink-3">{t("platformRole", { role: tOps.has(`roles.${m.platformRole}`) ? tOps(`roles.${m.platformRole}`) : m.platformRole })}</p> : null}
                  </Td>
                  <Td label={t("email")} className="break-all text-ink-2">
                    {m.email}
                  </Td>
                  <Td label={t("role")}>
                    <Badge tone={m.role === "OWNER" ? "primary" : "neutral"}>{m.rawRole}</Badge>
                  </Td>
                  <Td label={t("twoFactor")}>
                    <Status tone={m.twoFactor ? "ok" : "warn"} indicator="icon">
                      {m.twoFactor ? t("on") : t("off")}
                    </Status>
                  </Td>
                  <Td label={t("joined")} className="whitespace-nowrap text-ink-2">
                    <time dateTime={m.joinedAt}>{formatDate(m.joinedAt, locale, "short")}</time>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-ink-3">{t("metadata")}</p>
    </div>
  );
}
