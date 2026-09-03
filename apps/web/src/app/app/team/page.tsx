import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { assignableRoles, can } from "@track-site/core";
import { invitation, member, user } from "@track-site/db";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@track-site/ui";
import { InviteForm, MemberRow, PendingInvitation } from "@/components/app/team";
import { db } from "@/server/db";
import { requireOrgContext } from "@/server/session";

export default async function TeamPage() {
  const ctx = await requireOrgContext("members.read");
  const t = await getTranslations("app.team");
  const members = await db()
    .select({ id: member.id, role: member.role, createdAt: member.createdAt, userId: user.id, name: user.name, email: user.email, twoFactor: user.twoFactorEnabled })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.organization.id))
    .orderBy(member.createdAt);
  const invitations = await db()
    .select({ id: invitation.id, email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(and(eq(invitation.organizationId, ctx.organization.id), eq(invitation.status, "pending")));
  const roles = assignableRoles(ctx.role);
  const canInvite = can(ctx.role, "members.invite");
  const canUpdate = can(ctx.role, "members.update");
  const canRemove = can(ctx.role, "members.remove");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">{t("intro")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              {t("members")} <Badge tone="neutral">{members.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <MemberRow key={m.id} member={{ id: m.id, name: m.name, email: m.email, role: m.role, twoFactor: Boolean(m.twoFactor), isSelf: m.userId === ctx.user.id }} roles={roles} canUpdate={canUpdate && m.userId !== ctx.user.id} canRemove={canRemove && m.userId !== ctx.user.id} />
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-4">
          {canInvite ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("invite")}</CardTitle>
                <p className="text-sm text-ink-3">{t("inviteText")}</p>
              </CardHeader>
              <CardContent>
                <InviteForm roles={roles} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t("pending")}</CardTitle>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-sm text-ink-3">{t("noPending")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {invitations.map((i) => (
                    <PendingInvitation key={i.id} invitation={{ id: i.id, email: i.email, role: String(i.role), expiresAt: i.expiresAt.toISOString() }} canCancel={canInvite} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("rolesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-xs text-ink-2">
                {(["OWNER", "ADMIN", "DEVELOPER", "ANALYST", "BILLING", "READ_ONLY"] as const).map((r) => (
                  <div key={r} className="grid grid-cols-[110px_1fr] gap-2">
                    <dt className="font-mono text-ink">{r}</dt>
                    <dd>{t(`roles.${r}`)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
