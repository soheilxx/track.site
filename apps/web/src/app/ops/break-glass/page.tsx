import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@track-site/ui";
import { ActiveGrants } from "@/components/ops/break-glass/active-grants";
import { BreakGlassHistory } from "@/components/ops/break-glass/history";
import {
  BreakGlassNoticeProvider,
  BreakGlassNoticeRegion,
} from "@/components/ops/break-glass/notice";
import { ApprovalQueue } from "@/components/ops/break-glass/queue";
import { RequestForm } from "@/components/ops/break-glass/request-form";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { formatNumber } from "@/lib/format";
import { loadBreakGlassOverview } from "@/server/ops/break-glass";
import { checkPlatform } from "@/server/ops/platform";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("breakGlass");
}

/**
 * Break-glass (docs/17 §4): request form, approval queue (four eyes, single-admin fallback recorded as
 * self-approved), active grants with countdown, "open dashboard" and revoke, and the history. Every number
 * on this page is counted from `break_glass_access`; nothing is estimated.
 */
export default async function OpsBreakGlassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await checkPlatform("PLATFORM_SUPPORT");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [t, tOps, locale, overview] = await Promise.all([
    getTranslations("opsBreakGlass"),
    getTranslations("ops"),
    getLocale(),
    loadBreakGlassOverview(access.ctx),
  ]);
  // `/ops/break-glass?organization=<id>` (Organisations detail): preselects the organisation in the request form
  const wanted = (await searchParams).organization;
  const defaultOrganizationId =
    typeof wanted === "string" && /^[0-9a-f-]{36}$/i.test(wanted) ? wanted : null;
  const fourEyes =
    overview.eligibleAdminCount === 0
      ? t("summary.noAdmins")
      : overview.otherAdminExists
        ? t("summary.fourEyesOn")
        : t("summary.fourEyesOff");
  return (
    <BreakGlassNoticeProvider>
      <div className="space-y-8">
        <OpsPageHeader
          title={tOps("pages.breakGlass.title")}
          intro={tOps("pages.breakGlass.intro")}
        />
        <BreakGlassNoticeRegion />

        <dl className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">
              {t("summary.pending")}
            </dt>
            <dd className="mt-1 font-medium text-ink tabular-nums">
              {formatNumber(overview.pending.length, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">
              {t("summary.active")}
            </dt>
            <dd className="mt-1 font-medium text-ink tabular-nums">
              {formatNumber(overview.active.length, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-ink-3 uppercase">
              {t("summary.admins")}
            </dt>
            <dd className="mt-1 font-medium text-ink tabular-nums">
              {formatNumber(overview.eligibleAdminCount, locale)}
              <span className="ml-2 text-xs font-normal text-ink-3">
                {t("summary.adminsHint", { twoFactor: overview.requiresTwoFactor ? "yes" : "no" })}
              </span>
            </dd>
            <dd className="mt-1 text-xs text-ink-2">{fourEyes}</dd>
          </div>
        </dl>

        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>{t("rules.readOnly")}</li>
          <li>{t("rules.audited")}</li>
          <li>{t("rules.notified")}</li>
        </ul>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t("request.title")}</CardTitle>
              <CardDescription>{t("request.text")}</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestForm
                organisations={overview.organisations}
                otherAdminExists={overview.otherAdminExists}
                locale={locale}
                defaultOrganizationId={defaultOrganizationId}
              />
            </CardContent>
          </Card>

          <section aria-labelledby="break-glass-queue-title" className="space-y-3">
            <h2 id="break-glass-queue-title" className="text-lg font-semibold text-ink">
              {t("queue.title")}{" "}
              <Badge tone={overview.pending.length ? "info" : "neutral"}>
                {formatNumber(overview.pending.length, locale)}
              </Badge>
            </h2>
            <ApprovalQueue entries={overview.pending} locale={locale} />
          </section>
        </div>

        <section aria-labelledby="break-glass-active-title" className="space-y-3">
          <h2 id="break-glass-active-title" className="text-lg font-semibold text-ink">
            {t("active.title")}{" "}
            <Badge tone={overview.active.length ? "ok" : "neutral"}>
              {formatNumber(overview.active.length, locale)}
            </Badge>
          </h2>
          <ActiveGrants entries={overview.active} locale={locale} now={overview.now} />
        </section>

        <section aria-labelledby="break-glass-history-title" className="space-y-3">
          <h2 id="break-glass-history-title" className="text-lg font-semibold text-ink">
            {t("history.title")}
          </h2>
          <BreakGlassHistory
            entries={overview.history}
            locale={locale}
            truncated={overview.truncated}
          />
        </section>
      </div>
    </BreakGlassNoticeProvider>
  );
}
