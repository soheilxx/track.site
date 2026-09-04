import { ScrollText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { assignableRoles, can } from "@track-site/core";
import { APPROVAL_CHANGE_TYPES } from "@track-site/db";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, TBody, THead, Table, Th, Tr, buttonVariants } from "@track-site/ui";
import { ApprovalPolicyForm } from "@/components/app/team/approval-policy-form";
import { ApprovalRequests } from "@/components/app/team/approval-requests";
import { InviteForm, MemberRow, PendingInvitationRow } from "@/components/app/team/members";
import { TeamPageHeader } from "@/components/app/team/page-header";
import { RolesMatrix } from "@/components/app/team/roles-matrix";
import { formatNumber } from "@/lib/format";
import { requireOrgContext } from "@/server/session";
import { APPROVER_ROLE_OPTIONS, loadApprovalPolicy, loadApprovalRequests, loadTeam, loadTeamEntitlements, permissionGroups, roleMatrix } from "@/server/team";

/**
 * Team & Access (supplement §8 module "Team & Access", §5 Pro entitlements): members with roles and
 * two-factor state, invitations against the plan's seats, the per-member permission view, the six
 * roles with the enforced permission matrix, four-eyes requests and the approval requirements
 * (gated by the plan with an honest note). The audit log lives at `/app/team/audit`.
 */
export default async function TeamPage() {
  const ctx = await requireOrgContext("members.read");
  const [t, locale, entitlements, policyState] = await Promise.all([getTranslations("team"), getLocale(), loadTeamEntitlements(ctx), loadApprovalPolicy(ctx)]);
  const team = await loadTeam(ctx, entitlements);
  const requests = await loadApprovalRequests(ctx, policyState.policy, entitlements, team.members);
  const roles = assignableRoles(ctx.role);
  const canInvite = can(ctx.role, "members.invite");
  const canUpdate = can(ctx.role, "members.update");
  const canRemove = can(ctx.role, "members.remove");
  const canEditPolicy = can(ctx.role, "org.update");
  const fourEyesTypes = APPROVAL_CHANGE_TYPES.filter((c) => policyState.policy.fourEyes[c] === true);
  const fourEyesActive = entitlements.fourEyes && fourEyesTypes.length > 0;
  const roleChangesNeedApproval = entitlements.fourEyes && policyState.policy.fourEyes.member_role_change === true;
  const twoFactorCount = team.members.filter((m) => m.twoFactor).length;
  const names = new Map(team.members.map((m) => [m.userId, m.name]));
  const updatedByName = policyState.policy.updatedBy ? (names.get(policyState.policy.updatedBy) ?? null) : null;
  const serializeRequest = (r: (typeof requests.pending)[number]) => ({ ...r, decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null, expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString() });

  return (
    <div className="space-y-8">
      <TeamPageHeader
        title={t("overview.title")}
        intro={t("overview.intro")}
        actions={
          <Link href="/app/team/audit" className={buttonVariants({ variant: "secondary" })}>
            <ScrollText className="size-4" aria-hidden="true" /> {t("overview.openAudit")}
          </Link>
        }
      />

      <dl className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("summary.plan")}</dt>
          <dd className="mt-1 font-medium text-ink">{entitlements.planName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("summary.seats")}</dt>
          <dd className="mt-1 font-medium text-ink tabular-nums">
            {team.seats.cap != null ? t("summary.seatsUsed", { used: formatNumber(team.seats.members, locale), cap: formatNumber(team.seats.cap, locale) }) : t("summary.seatsNoCap", { used: formatNumber(team.seats.members, locale) })}
            {team.seats.pending ? <span className="ml-2 text-xs font-normal text-ink-3">{t("summary.seatsPending", { count: formatNumber(team.seats.pending, locale) })}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("summary.twoFactor")}</dt>
          <dd className="mt-1 font-medium text-ink tabular-nums">{t("summary.twoFactorShare", { enabled: formatNumber(twoFactorCount, locale), total: formatNumber(team.members.length, locale) })}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">{t("summary.fourEyes")}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium text-ink">
            {!entitlements.fourEyes ? t("summary.fourEyesNotInPlan") : fourEyesTypes.length ? t("summary.fourEyesActive", { count: fourEyesTypes.length }) : t("summary.fourEyesNone")}
            {requests.pending.length ? <Badge tone="info">{t("summary.openRequests", { count: requests.pending.length })}</Badge> : null}
          </dd>
        </div>
      </dl>

      {fourEyesActive || requests.pending.length ? <ApprovalRequests pending={requests.pending.map(serializeRequest)} recent={requests.recent.map(serializeRequest)} locale={locale} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="team-members-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="team-members-title" className="text-lg font-semibold text-ink">
              {t("members.title")} <Badge tone="neutral">{team.members.length}</Badge>
            </h2>
          </div>
          {roleChangesNeedApproval && canUpdate ? <p className="text-sm text-ink-3">{t("members.fourEyesHint")}</p> : null}
          <Card variant="flat">
            <CardContent className="px-2 py-2 sm:px-3">
              <Table caption={t("members.caption")}>
                <THead>
                  <Tr>
                    <Th>{t("members.member")}</Th>
                    <Th>{t("members.role")}</Th>
                    <Th>{t("members.twoFactor")}</Th>
                    <Th>{t("members.joined")}</Th>
                    <Th>{t("members.actions")}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {team.members.map((m) => (
                    <MemberRow key={m.id} member={{ id: m.id, userId: m.userId, name: m.name, email: m.email, role: m.role, twoFactor: m.twoFactor, joinedAt: m.joinedAt.toISOString(), isSelf: m.isSelf }} roles={roles} groups={permissionGroups(m.role)} canUpdate={canUpdate && !m.isSelf} canRemove={canRemove && !m.isSelf} locale={locale} />
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <div className="space-y-6">
          {canInvite ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("invite.title")}</CardTitle>
                <CardDescription>{t("invite.text")}</CardDescription>
              </CardHeader>
              <CardContent>
                <InviteForm roles={roles} seats={team.seats} planName={entitlements.planName} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>
                {t("pending.title")} <Badge tone="neutral">{team.invitations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {team.invitations.length === 0 ? (
                <p className="text-sm text-ink-3">{t("pending.empty")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {team.invitations.map((i) => (
                    <PendingInvitationRow key={i.id} invitation={{ id: i.id, email: i.email, role: i.role, inviterName: i.inviterName, expiresAt: i.expiresAt.toISOString(), expired: i.expired }} canManage={canInvite} locale={locale} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RolesMatrix rows={roleMatrix()} />

      <section aria-labelledby="team-approvals-title" className="space-y-4">
        <div>
          <h2 id="team-approvals-title" className="text-lg font-semibold text-ink">
            {t("approvals.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{t("approvals.intro")}</p>
        </div>
        <ApprovalPolicyForm policy={policyState.policy} changeTypes={APPROVAL_CHANGE_TYPES} approverOptions={APPROVER_ROLE_OPTIONS} enabled={entitlements.approvals && entitlements.fourEyes} persisted={policyState.persisted} canEdit={canEditPolicy} planName={entitlements.planName} updatedByName={updatedByName} locale={locale} />
      </section>
    </div>
  );
}
