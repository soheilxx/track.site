import { Users } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@track-site/ui";
import { OpsForbidden, OpsPageHeader, opsPageMetadata } from "@/components/ops/shell";
import { FourEyesPanel } from "@/components/ops/users/four-eyes-panel";
import { OperatorsTable } from "@/components/ops/users/operators-table";
import { RoleChangeControl } from "@/components/ops/users/role-change-control";
import { RoleHistory } from "@/components/ops/users/role-history";
import { RoleRequests } from "@/components/ops/users/role-requests";
import { checkPlatform } from "@/server/ops/platform";
import { DIRECTORY_PATH, loadPlatformUsers } from "@/server/ops/users";

export function generateMetadata(): Promise<Metadata> {
  return opsPageMetadata("users");
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      {intro ? <p className="text-sm text-ink-3">{intro}</p> : null}
      {children}
    </section>
  );
}

/**
 * Platform users (Track Operations, docs/17 §3): operators with role, two-factor state, last sign-in and
 * sessions; pending role changes under the four-eyes rule; the recent role-change history; the entry to
 * the read-only customer directory. Admin only — support operators get the inline 403.
 */
export default async function OpsUsersPage() {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [t, tOps, locale] = await Promise.all([getTranslations("opsUsers"), getTranslations("ops"), getLocale()]);
  const overview = await loadPlatformUsers(access.ctx);
  return (
    <div className="space-y-8">
      <OpsPageHeader
        title={tOps("pages.users.title")}
        intro={t("overview.intro")}
        actions={
          <>
            {/* button-styled link: interactive elements are never nested */}
            <Link href={DIRECTORY_PATH} className={buttonVariants({ variant: "secondary" })} data-testid="ops-users-directory">
              <Users className="size-4" aria-hidden="true" />
              {t("overview.directory")}
            </Link>
            <RoleChangeControl mode={overview.otherAdminExists ? "proposal" : "self"} variant="primary" />
          </>
        }
      />

      <FourEyesPanel overview={overview} />

      <Section id="ops-users-requests" title={t("requests.title")} intro={t("requests.intro")}>
        <RoleRequests requests={overview.requests} locale={locale} />
      </Section>

      <Section id="ops-users-operators" title={t("operators.title")}>
        <OperatorsTable operators={overview.operators} now={overview.now} cacheMinutes={overview.sessionCacheMinutes} locale={locale} />
      </Section>

      <Section id="ops-users-history" title={t("history.title")}>
        <RoleHistory entries={overview.history} locale={locale} />
      </Section>
    </div>
  );
}
