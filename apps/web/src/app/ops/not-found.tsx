import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants, cn } from "@track-site/ui";

/** Console 404, rendered inside the shell (same structure as the dashboard's `app/not-found.tsx`). */
export default async function OpsNotFound() {
  const t = await getTranslations("ops.notFound");
  return (
    <div className="mx-auto max-w-lg py-24 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
      <p className="mt-2 text-ink-2">{t("text")}</p>
      {/* button-styled link: interactive elements are never nested */}
      <Link href="/ops" className={cn(buttonVariants(), "mt-6")}>
        {t("back")}
      </Link>
    </div>
  );
}
