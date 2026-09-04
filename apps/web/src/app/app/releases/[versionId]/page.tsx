import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { can } from "@track-site/core";
import { Badge, Breadcrumbs, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Status, buttonVariants } from "@track-site/ui";
import { DiffList } from "@/components/app/releases/diff-list";
import { TestEvidence } from "@/components/app/releases/evidence";
import { formatDateTime, formatRelative, shortDigest } from "@/components/app/releases/format";
import { criticalReasonLabel, DECISION_TONE, ENVIRONMENT_TONE } from "@/components/app/releases/labels";
import { ReleasesPageHeader } from "@/components/app/releases/page-header";
import { RollbackButton } from "@/components/app/releases/version-actions";
import { loadVersionDetail, memberDirectory } from "@/server/releases";
import { requireOrgContext } from "@/server/session";
import { activeSite } from "@/server/workspace";

/**
 * One published configuration version of the active site: readable diff against its predecessor,
 * what the bundle switches on, the approvals it went through, its publication history (publishes and
 * rollbacks), the test evidence gathered while it was a draft and what the pipeline observed with it —
 * plus the one-click rollback (confirmed, audited) when it is not the live version.
 */
export default async function ReleaseVersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  const [{ versionId }, ctx] = await Promise.all([params, requireOrgContext("config.read")]);
  const [t, workspace] = await Promise.all([getTranslations("releases"), activeSite(ctx)]);
  const locale = ctx.user.locale;
  const site = workspace.site;
  const breadcrumbs = <Breadcrumbs label={t("version.breadcrumbLabel")} items={[{ label: t("version.back"), href: "/app/releases" }, { label: t("version.title", { version: "…" }) }]} linkComponent={Link} />;

  if (!site) {
    return (
      <div className="space-y-6">
        <ReleasesPageHeader title={t("title")} intro={t("intro")} breadcrumbs={breadcrumbs} />
        <EmptyState
          title={t("noSite")}
          description={t("noSiteText")}
          action={
            <Link href="/app/onboarding" className={buttonVariants()}>
              {t("createSite")}
            </Link>
          }
        />
      </div>
    );
  }

  const directory = await memberDirectory(ctx);
  const detail = await loadVersionDetail(ctx, site, workspace.environments, versionId, directory.names);
  if (!detail) {
    return (
      <div className="space-y-6">
        <ReleasesPageHeader title={t("version.notFound")} intro={t("version.notFoundText")} breadcrumbs={breadcrumbs} />
        <EmptyState
          title={t("version.notFound")}
          description={t("version.notFoundText")}
          action={
            <Link href="/app/releases" className={buttonVariants()}>
              {t("version.back")}
            </Link>
          }
        />
      </div>
    );
  }

  const envLabel = t(`environment.kind.${detail.environment.kind}`);
  const named = (name: string | null, id: string | null) => name ?? (id ? t("unknownUser") : t("system"));
  const canRollback = can(ctx.role, "config.rollback");
  const facts = detail.facts;

  return (
    <div className="space-y-8">
      <ReleasesPageHeader
        title={t("version.title", { version: detail.version })}
        intro={detail.summary ?? t("history.initial")}
        badge={
          <Status tone={detail.status === "active" ? "ok" : "neutral"} chip indicator="both" data-testid="release-version-status">
            {t(`version.status.${detail.status}`)}
          </Status>
        }
        breadcrumbs={<Breadcrumbs label={t("version.breadcrumbLabel")} items={[{ label: t("version.back"), href: `/app/releases?env=${detail.environment.id}` }, { label: t("version.title", { version: detail.version }) }]} linkComponent={Link} />}
        context={
          <>
            <Status tone={ENVIRONMENT_TONE[detail.environment.kind]} chip indicator="both">
              {envLabel}
            </Status>
            <span>{detail.createdBy === null && detail.scheduledAt ? t("version.createdBySystem", { time: formatDateTime(detail.createdAt, locale, "long") }) : t("version.createdBy", { name: named(detail.createdByName, detail.createdBy), time: formatDateTime(detail.createdAt, locale, "long") })}</span>
            {detail.status !== "active" && detail.activeVersion !== null ? <span className="text-ink-3">{t("version.activeNow", { version: detail.activeVersion })}</span> : null}
            <span className="font-mono text-xs text-ink-3" title={detail.digest}>
              {t("version.signed", { keyId: detail.keyId, digest: shortDigest(detail.digest) })}
            </span>
          </>
        }
        actions={
          <>
            <Link href="/app/events/explorer?window=7d" className={buttonVariants({ variant: "secondary" })}>
              {t("links.explorer")}
            </Link>
            {canRollback && detail.status !== "active" ? <RollbackButton versionId={detail.id} version={detail.version} activeVersion={detail.activeVersion} environmentLabel={envLabel} /> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("draft.changesTitle")}</CardTitle>
            <CardDescription>{detail.previousVersion === null ? t("version.first") : t("version.previous", { version: detail.previousVersion })}</CardDescription>
          </CardHeader>
          <CardContent>
            <DiffList changes={detail.changes} destinationNames={detail.destinationNames} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card variant="flat">
            <CardHeader>
              <CardTitle>{t("version.facts.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-ink-2">
                <li>{t("version.facts.events", { count: facts.eventsEnabled, critical: facts.eventsCritical })}</li>
                <li>{facts.destinationsEnabled.length ? t("version.facts.destinations", { names: facts.destinationsEnabled.join(", ") }) : t("version.facts.noDestinations")}</li>
                <li>{t("version.facts.consent", { mode: t(`impact.consent.regionModes.${facts.consentRegionMode}`), consentMode: t(`impact.consent.consentModes.${facts.consentMode}`), gpc: facts.respectGpc ? t("impact.consent.respected") : t("impact.consent.ignored") })}</li>
                <li>{t("version.facts.clickIds", { days: facts.clickIdTtlDays })}</li>
                <li>{facts.allowedHosts.length ? t("version.facts.hosts", { hosts: facts.allowedHosts.join(", ") }) : t("version.facts.noHosts")}</li>
                {facts.killSwitch ? (
                  <li>
                    <Status tone="bad" indicator="icon">
                      {t("version.facts.killSwitch")}
                    </Status>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card variant="flat">
            <CardHeader>
              <CardTitle>{t("version.signals.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.fourEyesReasons.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-2">
                  {detail.fourEyesReasons.map((r) => (
                    <li key={r}>{criticalReasonLabel(t, r)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">{t("version.signals.none")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("version.publications.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {detail.publications.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={p.kind === "rollback" ? "info" : "neutral"}>{p.kind === "rollback" ? (p.rollbackOfVersion !== null ? t("version.publications.rollback", { from: p.rollbackOfVersion }) : t("version.publications.rollbackUnknown")) : t("version.publications.publish")}</Badge>
                  <time dateTime={p.publishedAt} className="text-ink">
                    {formatDateTime(p.publishedAt, locale, "long")}
                  </time>
                  <span className="text-ink-3">{t("version.publications.by", { name: named(p.publishedByName, p.publishedBy) })}</span>
                  {p.approvalId ? <Badge tone="ok">{t("version.publications.withApproval")}</Badge> : null}
                  {p.isActive ? (
                    <Status tone="ok" indicator="icon">
                      {t("version.publications.active")}
                    </Status>
                  ) : p.supersededAt ? (
                    <span className="text-ink-3">{t("version.publications.superseded", { time: formatRelative(p.supersededAt, locale) })}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card variant="flat">
          <CardHeader>
            <CardTitle>{t("version.approvals.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.approvals.length === 0 ? (
              <p className="text-sm text-ink-3">{t("version.approvals.empty")}</p>
            ) : (
              <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line text-sm">
                {detail.approvals.map((a) => (
                  <li key={a.id} className="space-y-1 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={DECISION_TONE[a.decision]}>{t(`fourEyes.decision.${a.decision}`)}</Badge>
                      <span className="text-ink-2">{t("fourEyes.requestedBy", { name: named(a.requestedByName, a.requestedBy), time: formatRelative(a.createdAt, locale) })}</span>
                      {a.decidedAt && a.decision !== "withdrawn" ? <span className="text-ink-2">· {t("fourEyes.decidedBy", { decision: t(`fourEyes.decision.${a.decision}`), name: named(a.approverName, a.approverId), time: formatRelative(a.decidedAt, locale) })}</span> : null}
                    </div>
                    {a.criticalReasons.length ? (
                      <ul className="list-disc pl-5 text-ink-3">
                        {a.criticalReasons.map((r) => (
                          <li key={r}>{criticalReasonLabel(t, r)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {a.requestNote ? <p className="text-ink-3">{t("fourEyes.note", { note: a.requestNote })}</p> : null}
                    {a.reason ? <p className="text-ink-3">{t("fourEyes.reasonGiven", { reason: a.reason })}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card variant="flat">
        <CardHeader>
          <CardTitle>{t("version.evidence.title")}</CardTitle>
          <CardDescription>{t("version.evidence.intro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TestEvidence runs={detail.evidence.runs} available={detail.evidence.available} observed={detail.evidence.observed} emptyText={t("version.evidence.runsEmpty")} locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
