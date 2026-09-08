"use client";

import { KeyRound } from "lucide-react";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Banner, Button, buttonVariants, cn } from "@track-site/ui";
import { leaveSupportViewAction, supportAccessBannerAction, type SupportAccessBannerState } from "@/server/ops/actions/break-glass";
import { INITIAL_STATE } from "./feedback";
import { formatDateTime } from "./labels";

/**
 * Break-glass notice in the customer dashboard shell (docs/17 §4). The operator viewing a tenant under a
 * grant sees "Support access active until … (grant …)" with the way back to the console and a way out of the
 * support view (the cookie that pins the tenant is cleared, `ops.break_glass.close` is recorded, their own
 * workspace applies again); the organisation's own members see that a read-only support grant is active and
 * where its trail is. The state is read through a server action on every route change, so a revocation
 * disappears with the next navigation.
 */
export function SupportAccessBanner() {
  const t = useTranslations("shell");
  const locale = useLocale();
  const timeZone = useTimeZone();
  const pathname = usePathname();
  const [state, setState] = useState<SupportAccessBannerState>(null);
  useEffect(() => {
    let cancelled = false;
    supportAccessBannerAction()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        // an unreachable action never hides the dashboard; the server-side guard stays in force regardless
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  if (!state) return null;
  if (state.kind === "operator") {
    return (
      <Banner
        tone="warn"
        icon={<KeyRound className="size-5" aria-hidden="true" />}
        title={t("supportAccess.operatorTitle", { until: formatDateTime(state.endsAt, locale, timeZone), grant: state.grantId })}
        action={
          <>
            <Link href="/ops/break-glass" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              {t("supportAccess.backToOps")}
            </Link>
            <LeaveSupportViewForm label={t("supportAccess.leave")} pendingLabel={t("supportAccess.leaving")} />
          </>
        }
        className="mb-4"
        data-testid="support-access-banner"
      >
        {t("supportAccess.operatorText", { organization: state.organization })}
      </Banner>
    );
  }
  const [first] = state.grants;
  if (!first) return null;
  return (
    <Banner
      tone="info"
      icon={<KeyRound className="size-5" aria-hidden="true" />}
      title={t("supportAccess.customerTitle", { until: formatDateTime(first.endsAt, locale, timeZone), grant: first.grantId })}
      action={
        <Link href="/app/team/audit" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          {t("supportAccess.openAudit")}
        </Link>
      }
      className="mb-4"
      data-testid="support-access-banner"
    >
      {t("supportAccess.customerText")}
      {state.grants.length > 1 ? ` ${t("supportAccess.customerMultiple", { count: state.grants.length })}` : null}
    </Banner>
  );
}

/** "Leave support view": a server action that clears the tenant cookie, audits the close and redirects — no confirmation needed, nothing is changed. */
function LeaveSupportViewForm({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const [, action, pending] = useActionState(leaveSupportViewAction, INITIAL_STATE);
  return (
    <form action={action}>
      <Button type="submit" variant="primary" size="sm" loading={pending} loadingLabel={pendingLabel} data-testid="support-access-leave">
        {label}
      </Button>
    </form>
  );
}
