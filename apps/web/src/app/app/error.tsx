"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@track-site/ui";

/** Dashboard error boundary: keeps the shell (navigation, switcher, Track AI) and offers retry + Command Center. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("shell.error");
  useEffect(() => {
    // digest only: never log messages that could contain tenant data
    console.error("dashboard error", error.digest ?? "no-digest");
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
      <p className="mt-2 text-ink-2">{t("text")}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-3">{error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>{t("retry")}</Button>
        <Link href="/app" className={buttonVariants({ variant: "secondary" })}>
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
