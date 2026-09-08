import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Status, TBody, THead, Table, Td, Th, Tr } from "@track-site/ui";
import { formatDate } from "@/lib/format";
import type { MembershipView } from "@/server/ops/users";

/** Organisations the account belongs to (name links to the organisation's console page), role and join date. */
export async function UserMemberships({ memberships, locale }: { memberships: MembershipView[]; locale: string }) {
  const t = await getTranslations("opsUsers.detail.memberships");
  if (memberships.length === 0) return <p className="text-sm text-ink-3">{t("empty")}</p>;
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface px-2 py-2 sm:px-3">
      <Table caption={t("caption")}>
        <THead>
          <Tr>
            <Th>{t("organisation")}</Th>
            <Th>{t("role")}</Th>
            <Th>{t("joined")}</Th>
          </Tr>
        </THead>
        <TBody>
          {memberships.map((m) => (
            <Tr key={m.id}>
              <Td label={t("organisation")}>
                <Link href={`/ops/organisations/${m.organization.id}`} aria-label={t("open", { name: m.organization.name })} className="inline-flex min-h-9 items-center rounded-[var(--radius-control-sm)] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11">
                  {m.organization.name}
                </Link>
                <p className="font-mono text-xs text-ink-3">{m.organization.slug}</p>
                {m.organization.suspendedAt ? (
                  <Status tone="bad" indicator="icon" chip className="mt-1">
                    {t("suspended")}
                  </Status>
                ) : null}
              </Td>
              <Td label={t("role")}>
                <Badge tone={m.role === "OWNER" ? "primary" : "neutral"}>{m.rawRole}</Badge>
              </Td>
              <Td label={t("joined")} className="whitespace-nowrap text-ink-2">
                <time dateTime={m.joinedAt}>{formatDate(m.joinedAt, locale, "short")}</time>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
