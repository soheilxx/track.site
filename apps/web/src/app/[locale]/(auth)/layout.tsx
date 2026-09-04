import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";

/** Focused auth shell for login, signup, password, verification, two-factor and invitation pages. */
export default async function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthFrame locale={locale}>{children}</AuthFrame>;
}
