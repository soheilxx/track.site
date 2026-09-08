import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Status, buttonVariants, cn } from "@track-site/ui";
import { formatDateTime } from "@/components/app/alerts/format";
import { OpsForbidden, OpsPageHeader } from "@/components/ops/shell";
import { roleLabel, roleTone } from "@/components/ops/users/labels";
import { RevokeSessionsControl } from "@/components/ops/users/revoke-sessions-control";
import { RoleChangeControl } from "@/components/ops/users/role-change-control";
import { RoleRequests } from "@/components/ops/users/role-requests";
import { UserAudit } from "@/components/ops/users/user-audit";
import { UserMemberships } from "@/components/ops/users/user-memberships";
import { UserSessions } from "@/components/ops/users/user-sessions";
import { formatDate } from "@/lib/format";
import { checkPlatform } from "@/server/ops/platform";
import { DIRECTORY_PATH, USERS_PATH, isUuid, loadUserDetail } from "@/server/ops/users";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("ops.pages");
  return { title: `${id.slice(0, 8)} · ${t("users.title")}` };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/**
 * Account detail (Track Operations): profile metadata, organisations and roles, stored sessions, the
 * pending role change and the audit entries targeting the account. Operators get the role-change and
 * sign-out actions; customer accounts are read-only. Never tokens, IP addresses, user agents or end-user data.
 */
export default async function OpsUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const detail = await loadUserDetail(access.ctx, id);
  if (!detail) notFound();
  const [t, locale] = await Promise.all([getTranslations("opsUsers"), getLocale()]);
  const u = detail.user;
  const operator = u.platformRole !== "NONE";
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Link href={USERS_PATH} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("detail.back")}
        </Link>
        <Link href={DIRECTORY_PATH} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("detail.backDirectory")}
        </Link>
      </div>
      <OpsPageHeader
        title={u.name}
        intro={`${u.email} · ${t("detail.id")}: ${u.id}`}
        context={
          <>
            <Badge tone={roleTone(u.platformRole)}>{roleLabel(t, u.platformRole)}</Badge>
            <Status tone={u.twoFactor ? "ok" : "warn"} indicator="icon" chip>
              {t("operators.twoFactor")}: {u.twoFactor ? t("common.on") : t("common.off")}
            </Status>
            <Status tone={u.emailVerified ? "ok" : "warn"} indicator="icon" chip>
              {t("operators.email")}: {u.emailVerified ? t("common.verified") : t("common.unverified")}
            </Status>
            <span className="text-ink-3">{t("detail.created", { date: formatDate(u.createdAt, locale, "short") })}</span>
          </>
        }
        actions={
          operator ? (
            <>
              <RoleChangeControl target={{ id: u.id, name: u.name, platformRole: u.platformRole }} mode={detail.viewer.changeMode ?? "proposal"} refusal={detail.viewer.changeRefusal} />
              {detail.viewer.canRevokeSessions ? <RevokeSessionsControl userId={u.id} name={u.name} isSelf={detail.viewer.isSelf} activeSessions={detail.sessions.active} cacheMinutes={detail.sessionCacheMinutes} /> : null}
            </>
          ) : (
            <RoleChangeControl target={{ id: u.id, name: u.name, platformRole: u.platformRole }} mode={detail.viewer.changeMode ?? "proposal"} refusal={detail.viewer.changeRefusal} />
          )
        }
      />

      <div className="grid gap-8 xl:grid-cols-2">
        <Section id="user-profile" title={t("detail.sections.profile")}>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm">
            <Row label={t("detail.profile.role")}>{roleLabel(t, u.platformRole)}</Row>
            <Row label={t("detail.profile.email")}>
              <span className="break-all">{u.email}</span>
            </Row>
            <Row label={t("detail.profile.verified")}>{u.emailVerified ? t("common.verified") : t("common.unverified")}</Row>
            <Row label={t("detail.profile.twoFactor")}>{u.twoFactor ? t("common.on") : t("common.off")}</Row>
            <Row label={t("detail.profile.twoFactorVerified")}>{u.twoFactorVerified == null ? t("detail.profile.twoFactorNotSetUp") : u.twoFactorVerified ? t("common.verified") : t("common.unverified")}</Row>
            <Row label={t("detail.profile.passkeys")}>{t("detail.profile.passkeys", { count: u.passkeys })}</Row>
            <Row label={t("detail.profile.locale")}>{u.locale}</Row>
            <Row label={t("detail.profile.updated")}>{formatDateTime(u.updatedAt, locale)}</Row>
          </dl>
          {!operator ? <p className="text-xs text-ink-3">{t("detail.profile.customer")}</p> : null}
        </Section>
        <Section id="user-memberships" title={t("detail.sections.memberships")}>
          <UserMemberships memberships={detail.memberships} locale={locale} />
        </Section>
      </div>

      {detail.requests.length ? (
        <Section id="user-requests" title={t("detail.sections.requests")}>
          <RoleRequests requests={detail.requests} locale={locale} />
        </Section>
      ) : null}

      <Section id="user-sessions" title={t("detail.sections.sessions")}>
        <UserSessions sessions={detail.sessions} now={detail.generatedAt} locale={locale} />
      </Section>

      <Section id="user-audit" title={t("detail.sections.audit")}>
        <UserAudit entries={detail.audit} locale={locale} />
      </Section>

      <p className="text-xs text-ink-3">
        {t("detail.generated", { date: formatDateTime(detail.generatedAt, locale) ?? "" })} · {t("common.metadata")}
      </p>
    </div>
  );
}
