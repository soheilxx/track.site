import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants, cn } from "@track-site/ui";

/**
 * Dashboard 404, rendered inside the shell (navigation, switcher and Track AI stay available) in the
 * user's language: `notFound()` from any dashboard page (unknown site, integration …) lands here.
 */
export default async function DashboardNotFound() {
  const t = await getTranslations("shell.notFound");
  return (
    <div className="mx-auto max-w-lg py-24 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="mt-4 font-display text-2xl font-semibold text-ink">{t("title")}</h1>
      <p className="mt-2 text-ink-2">{t("text")}</p>
      {/* button-styled link: interactive elements are never nested */}
      <Link href="/app" className={cn(buttonVariants(), "mt-6")}>
        {t("back")}
      </Link>
    </div>
  );
}
