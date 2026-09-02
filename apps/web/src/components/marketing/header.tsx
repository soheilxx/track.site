"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Brand, Button, Container, cn } from "@track-site/ui";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

const NAV = [
  { href: "/features", key: "features" },
  { href: "/integrations", key: "integrations" },
  { href: "/how-it-works", key: "howItWorks" },
  { href: "/pricing", key: "pricing" },
  { href: "/docs", key: "docs" },
  { href: "/blog", key: "blog" },
] as const;

export function MarketingHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ground/80 backdrop-blur supports-[backdrop-filter]:bg-ground/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="track.site home" className="shrink-0">
          <Brand size={32} textClassName="text-lg" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
                pathname.startsWith(item.href) && "bg-surface-2 text-ink",
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <LocaleSwitcher />
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink">
            {t("login")}
          </Link>
          <Link href="/signup">
            <Button size="sm">{t("signup")}</Button>
          </Link>
        </div>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? t("closeMenu") : t("openMenu")} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Container>
      {open ? (
        <div id="mobile-nav" className="border-t border-line bg-surface md:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link key={item.key} href={item.href} className="rounded-lg px-3 py-2.5 text-base font-medium text-ink-2 hover:bg-surface-2" onClick={() => setOpen(false)}>
                {t(item.key)}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
              <LocaleSwitcher />
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2" onClick={() => setOpen(false)}>
                {t("login")}
              </Link>
              <Link href="/signup" onClick={() => setOpen(false)}>
                <Button size="sm">{t("signup")}</Button>
              </Link>
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
