import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrandMark, buttonVariants, cn } from "@track-site/ui";
import type { PlatformAccessReason } from "@/server/ops/platform";

const KEY: Record<PlatformAccessReason, "noRole" | "twoFactor" | "insufficientRole"> = {
  no_role: "noRole",
  two_factor_required: "twoFactor",
  insufficient_role: "insufficientRole",
};

/**
 * Localized 403 of the console. `standalone` renders a complete page (used by the /ops layout instead of the
 * shell when the account has no platform role or lacks two-factor); otherwise it is the content of a page
 * inside the shell (a support operator on an admin-only module). The HTTP status stays 200 — Next's
 * `forbidden()` interrupt needs `experimental.authInterrupts`; the page is `noindex` and never cached anyway.
 */
export async function OpsForbidden({
  reason,
  standalone = false,
}: {
  reason: PlatformAccessReason;
  standalone?: boolean;
}) {
  const [t, tOps, tSecurity] = await Promise.all([
    getTranslations("ops.gate"),
    getTranslations("ops"),
    getTranslations("security"),
  ]);
  const key = KEY[reason];
  const back = reason === "insufficient_role" ? "/ops" : "/app";
  const body = (
    <div role="alert" className="mx-auto max-w-lg py-24 text-center">
      {standalone ? (
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold text-ink">
          <BrandMark size={26} />
          {tOps("title")}
        </div>
      ) : null}
      <p className="font-mono text-sm text-ink-3">{t("status")}</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{t(`${key}.title`)}</h1>
      <p className="mt-2 text-ink-2">{t(`${key}.text`)}</p>
      {/* button-styled links: interactive elements are never nested */}
      <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
        {reason === "two_factor_required" ? (
          // self-service enrolment in the customer dashboard (security settings); the console re-checks on the way back
          <Link
            href="/app/settings/security"
            className={buttonVariants()}
            data-testid="ops-gate-enable-two-factor"
          >
            {tSecurity("opsGate.enable")}
          </Link>
        ) : null}
        <Link
          href={back}
          className={cn(
            buttonVariants({ variant: reason === "two_factor_required" ? "secondary" : "primary" }),
          )}
        >
          {t(`${key}.back`)}
        </Link>
      </div>
    </div>
  );
  if (!standalone) return body;
  return (
    <main id="main" className="h-dvh overflow-y-auto px-6">
      {body}
    </main>
  );
}
