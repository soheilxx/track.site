import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState, buttonVariants } from "@track-site/ui";
import { FlagDetail } from "@/components/ops/controls/flag-detail";
import { OpsForbidden } from "@/components/ops/shell";
import { getFeatureFlag, isValidFlagKey } from "@/server/ops/controls";
import { checkPlatform, platformLocale } from "@/server/ops/platform";

type Params = { params: Promise<{ key: string }> };

/** Route param as typed; a malformed percent-escape yields an empty key (→ not-found state) instead of a URIError. */
const keyOf = async (params: Params["params"]): Promise<string> => {
  const raw = (await params).key;
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [key, tOps] = await Promise.all([keyOf(params), getTranslations("ops.pages.controls")]);
  return { title: `${key} · ${tOps("title")}` };
}

/** Controls → one feature flag: default, description, per-organization overrides. */
export default async function OpsFlagPage({ params }: Params) {
  const access = await checkPlatform("PLATFORM_ADMIN");
  if (!access.ok) return <OpsForbidden reason={access.reason} />;
  const [key, t, locale] = await Promise.all([keyOf(params), getTranslations("opsControls.flags"), platformLocale(access.ctx.user)]);
  const flag = isValidFlagKey(key) ? await getFeatureFlag(access.ctx, key) : null;
  const back = (
    <Link href="/ops/controls/flags" className={buttonVariants({ variant: "ghost", size: "sm" })}>
      <ArrowLeft className="size-4" aria-hidden="true" /> {t("detail.back")}
    </Link>
  );
  if (!flag) {
    return <EmptyState title={t("detail.notFound")} description={t("detail.notFoundText")} action={back} />;
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-lg font-semibold text-ink">{flag.key}</h2>
          {flag.description ? <p className="mt-1 max-w-3xl text-sm text-ink-3">{flag.description}</p> : null}
        </div>
        {back}
      </div>
      {!flag.registered ? (
        <EmptyState title={t("detail.unregisteredTitle")} description={t("detail.unregisteredText")} action={back} />
      ) : (
        <FlagDetail flag={flag} locale={locale} />
      )}
    </div>
  );
}
