"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-1 text-sm text-ink-2">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as (typeof routing.locales)[number];
          document.cookie = `NEXT_LOCALE=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
          startTransition(() => router.replace(pathname, { locale: next }));
        }}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
  );
}
